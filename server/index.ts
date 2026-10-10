import express, { Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Message, Snapshot, CareDecision, Booking, FieldKey, ClarificationDraft } from '../shared/types.ts';
import { getDb } from './db.ts';
import { createEncounter, getEncounter, saveEncounter, listEncounters } from './domain/encounterStore.ts';
import { extractFields } from './domain/briefing.ts';
import { parseLabReport } from './domain/documents.ts';
import { decideCareRoute } from './rules/careRoute.ts';
import { listDoctors, createProposal, approveProposal, bookSlot, bookingForEncounter, openProposalForEncounter, httpError } from './domain/booking.ts';
import { translate } from './domain/translate.ts';
import { pickNextQuestion, parseAnswer, intakeComplete } from './domain/intake.ts';
import { recentTraces, trace } from './trace.ts';
import { uuid, nowIso } from './lib/ids.ts';
import { runAgentTurn, isAgentConfigured, setConfirmationToken, hasConfirmationToken, draftClarificationWithAgent, runGateProbeWithAgent } from './agent/runAgent.ts';
import { runEvaluation, latestReport } from './eval/runner.ts';
import { RULE_VERSION } from './rules/redFlags.ts';
import { z } from 'zod';
import { SAFETY_QUESTIONS } from './domain/intake.ts';
import { answerSelfCare, createSelfCareSession, evaluateSelfCare, type SelfCareSession } from './domain/selfcare.ts';
import { conversationTurn, conversationComplete } from './domain/conversation.ts';
import { evaluateRedFlags } from './rules/redFlags.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const turnQueues = new Map<string, Promise<unknown>>();
async function serializeTurn<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = turnQueues.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  turnQueues.set(id, next);
  try { return await next; } finally { if (turnQueues.get(id) === next) turnQueues.delete(id); }
}
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'A JSON object body is required' });
  }
  next();
});
const answerSchema = z.enum(['yes', 'no', 'unknown']);
const screeningSchema = z.object({
  key: z.string().optional(), answer: answerSchema.optional(),
  purpose: z.enum(['new-concern', 'report-review', 'follow-up']).optional(),
  physicalExam: answerSchema.optional(), adult: answerSchema.optional(),
}).strict().refine(v => (v.key === undefined) === (v.answer === undefined), 'key and answer must be supplied together')
  .refine(v => Object.keys(v).length > 0, 'At least one update is required');

function snapshot(encounterId: string): Snapshot {
  const enc = getEncounter(encounterId);
  if (!enc) throw httpError(404, 'Encounter not found');
  const freeText = enc.messages.filter(m => m.role === 'patient').map(m => `${m.english ?? ''} ${m.text}`);
  const video = listDoctors('video').some(d => d.slots.length > 0);
  const inPerson = listDoctors('in-person').some(d => d.slots.length > 0);
  const decision: CareDecision = decideCareRoute(enc.screening, freeText, { video, inPerson });
  if (enc.conversation) {
    enc.conversation.intakeComplete = conversationComplete(enc);
    enc.conversation.bookingReady = enc.conversation.intakeComplete && ['video', 'in-person'].includes(decision.route);
    if (!enc.conversation.intakeComplete && decision.route !== 'emergency') {
      decision.route = 'clarification'; decision.title = 'Consultation details needed';
      decision.missing.push('Required consultation fields');
    }
  }
  const booking: Booking | null = bookingForEncounter(enc.id);
  const proposal = booking || decision.route === 'emergency' ? null : openProposalForEncounter(enc.id);
  return { encounter: enc, decision, booking, proposal };
}

/** Guided mode: conversational deterministic assistant. No LLM. */
function guidedReply(encounterId: string, userText: string): Message {
  const enc = getEncounter(encounterId)!;
  const decision = snapshot(encounterId).decision;
  let reply: string;

  if (decision.route === 'emergency') {
    reply = decision.explanation;
  } else {
    const q = pickNextQuestion(enc);
    if (q) {
      reply = q.text;
      // Record that the application actually asked, so "not asked" stays distinguishable from "unanswered".
      if (q.type === 'field' && q.key && !enc.askedFields?.includes(q.key as FieldKey)) enc.askedFields = [...(enc.askedFields ?? []), q.key as FieldKey];
    } else if (!intakeComplete(enc)) {
      reply = 'Thank you. Please also complete the safety check below so the system can suggest the right kind of care.';
    } else {
      reply = 'Thanks — your summary is ready for the doctor. Complete the safety check below, then you can choose a doctor and book a time.';
    }
  }

  const message: Message = { id: uuid(), role: 'assistant', text: reply, language: 'en', translation: 'original', createdAt: nowIso(), replyOrigin: decision.route === 'emergency' ? 'safety' : 'fixture' };
  enc.messages.push(message);
  saveEncounter(enc);
  trace('guided.reply', 'completed', 'Guided-mode conversational follow-up (no LLM used)', 'application');
  return message;
}

function requireEncounter(req: Request) {
  const id = req.params.id;
  if (typeof id !== 'string') throw httpError(400, 'Invalid encounter ID');
  const enc = getEncounter(id);
  if (!enc) throw httpError(404, 'Encounter not found');
  return enc;
}

// --- Routes ---
app.get('/api/health', (_req, res) => {
  getDb();
  res.json({ ok: true, agentMode: isAgentConfigured() ? 'cline-sdk' : 'guided', ruleVersion: RULE_VERSION });
});

app.post('/api/encounters', (req, res) => {
  const input = z.object({
    language: z.enum(['en', 'hi', 'as']).default('en'), name: z.string().trim().min(1).max(100).optional(),
    assistedBy: z.object({ name: z.string().trim().min(1).max(100), role: z.enum(['asha', 'clinic-staff']) }).strict().optional(),
  }).strict().safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid language, patient name or assisting worker' });
  const enc = createEncounter(input.data.language, input.data.name, input.data.assistedBy);
  res.json(snapshot(enc.id));
});

app.get('/api/encounters', (_req, res) => {
  res.json(listEncounters().map(e => ({ id: e.id, name: e.name, language: e.language, createdAt: e.createdAt, assistedBy: e.assistedBy ?? null, booked: Boolean(bookingForEncounter(e.id)) })));
});

app.get('/api/encounters/:id', (req, res, next) => {
  try { res.json(snapshot(requireEncounter(req).id)); } catch (err) { next(err); }
});

app.post('/api/encounters/:id/messages', async (req, res, next) => {
  try {
    if (req.body.workflow === 'conversation') {
      const id = requireEncounter(req).id;
      return await serializeTurn(id, async () => {
        const enc = getEncounter(id)!;
        const text = boundedText(req.body.text, 4000);
        const clientMessageId = boundedText(req.body.clientMessageId, 100);
        const existing = enc.messages.find(m => m.role === 'patient' && m.clientMessageId === clientMessageId);
        if (existing && existing.text !== text) throw httpError(409, 'Message ID already belongs to different text');
        const existingReply = existing ? enc.messages[enc.messages.indexOf(existing) + 1] : undefined;
        if (existingReply?.role === 'assistant') return res.json({ message: existingReply, snapshot: snapshot(id) });
        const patient: Message = existing ?? { id: uuid(), role: 'patient', text, language: enc.language, translation: 'original', createdAt: nowIso(), enteredBy: 'patient', clientMessageId };
        if (!existing) { enc.messages.push(patient); saveEncounter(enc); }
        const reply = await conversationTurn(enc, patient);
        if (reply.replyOrigin === 'cline') reply.language = enc.language;
        const concern = enc.fields.find(f => f.key === 'concern');
        const firstPatient = enc.messages.find(m => m.role === 'patient');
        if (concern && firstPatient) { concern.value = firstPatient.text; concern.sourceId = firstPatient.id; concern.transformation = 'none'; }
        for (const field of enc.conversation?.fields ?? []) {
          const brief = enc.fields.find(f => f.key === field.id);
          if (brief && field.sourceId) { brief.value = field.status === 'unknown' ? 'Patient did not know' : field.status === 'declined' ? 'Patient preferred not to say' : field.value; brief.sourceId = field.sourceId; brief.transformation = 'none'; }
        }
        enc.messages.push(reply);
        saveEncounter(enc);
        trace('reply.path', 'completed', `Encounter ${id.slice(0, 8)}; message ${reply.id}; origin ${reply.replyOrigin}; reason ${reply.fallbackReason ?? 'provider_completed'}`, reply.replyOrigin === 'cline' ? 'cline-sdk' : 'application');
        return res.json({ message: reply, snapshot: snapshot(id) });
      });
    }
    const enc = requireEncounter(req);
    const text = boundedText(req.body.text, 4000);
    const workflow = z.enum(['intake', 'temporary-relief']).parse(req.body.workflow ?? 'intake');
    const enteredBy = enteredBySchema.safeParse(req.body.enteredBy ?? (enc.assistedBy ? 'health-worker' : 'patient'));
    if (!enteredBy.success) throw httpError(400, 'enteredBy must be patient or health-worker');
    const rawEmergency = evaluateRedFlags(enc.screening, [...enc.messages.filter(m => m.role === 'patient').map(m => m.text), text]).triggered.length > 0;
    const english = enc.language === 'en' || rawEmergency ? null : await translate(text, enc.language, 'en');
    const pending = pickNextQuestion(enc);
    const previous = enc.messages.at(-1);
    const answer = parseAnswer(text);
    const isAnswer = previous?.role === 'assistant' && pending && previous.text === pending.text;

    const patientMsg: Message = {
      id: uuid(), role: 'patient', text, language: enc.language, createdAt: nowIso(), enteredBy: enteredBy.data,
      ...(english ? { english: english.text, translation: english.status } : { translation: 'original' as const }),
    };
    enc.messages.push(patientMsg);

    // Apply the answer to the pending question (structured answers) or the field being asked (free text).
    if (isAnswer) {
      if (pending.type === 'field' && pending.key) {
        const field = enc.fields.find(f => f.key === pending.key);
        if (field) {
          field.value = ['no', 'none', 'nil', 'nahi', 'নাই'].includes(text.trim().toLowerCase()) ? 'None' : (english?.text ?? text.trim());
          field.sourceId = patientMsg.id;
          field.transformation = english ? 'translation' : 'none';
          field.verification = 'unverified';
        }
      }
    }

    const fields = extractFields(enc.messages);
    enc.fields = fields.map(f => {
      const old = enc.fields.find(o => o.key === f.key);
      // Keep an answer captured from a direct question; re-extraction must never erase recorded evidence.
      if (old && old.value !== null && f.value === null) return old;
      return old?.value === f.value && old?.sourceId === f.sourceId ? old : f;
    });
    saveEncounter(enc);
    const emergency = snapshot(enc.id).decision.route === 'emergency';
    let reply: Message;
    const reason = emergency ? 'emergency_bypass' : !isAgentConfigured() ? 'missing_provider_configuration' : workflow === 'temporary-relief' ? 'temporary_relief_guided_mode' : null;
    try { reply = reason ? guidedReply(enc.id, text) : await runAgentTurn(enc.id, text, enc.language); }
    catch (error) {
      trace('agent.turn', 'failed', `Provider failed (${error instanceof Error ? error.name : 'unknown'}); guided fallback used`);
      reply = guidedReply(enc.id, text);
      reply.fallbackReason = 'provider_error';
    }
    reply.fallbackReason ??= reason ?? undefined;
    const recorded = getEncounter(enc.id)!;
    const storedReply = recorded.messages.find(m => m.id === reply.id);
    if (storedReply) Object.assign(storedReply, reply);
    saveEncounter(recorded);
    trace('reply.path', 'completed', `Encounter ${enc.id.slice(0, 8)}; message ${reply.id}; origin ${reply.replyOrigin}; reason ${reply.fallbackReason ?? 'provider_completed'}`, reply.replyOrigin === 'cline' ? 'cline-sdk' : 'application');
    const next = emergency ? null : pickNextQuestion(getEncounter(enc.id)!);
    const prompt = next ? { kind: next.kind } : null;
    res.json({ message: reply, snapshot: snapshot(enc.id), prompt });
  } catch (err) { next(err); }
});

app.get('/api/screening/questions', (_req, res) => {
  res.json({ ruleVersion: RULE_VERSION, questions: SAFETY_QUESTIONS, adultRequired: false });
});

// Ephemeral answers: no self-care advice is saved in messages, fields or the DB.
// This synthetic app has no authentication; sessions are scoped, not authorization.
const selfCareSessions = new Map<string, SelfCareSession>();
const selfCareRequest = z.object({ reset: z.boolean().optional(), questionId: z.string().optional(), answer: z.string().max(1000).optional() }).strict()
  .refine(v => (v.questionId === undefined) === (v.answer === undefined), 'Supply questionId and answer together')
  .refine(v => !v.reset || v.questionId === undefined, 'Reset cannot include an answer');
app.post('/api/encounters/:id/selfcare', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const input = selfCareRequest.safeParse(req.body);
    if (!input.success) throw httpError(400, 'Invalid self-care request');
    for (const [id, session] of selfCareSessions) if (session.expiresAt <= Date.now()) selfCareSessions.delete(id);
    let session = selfCareSessions.get(enc.id);
    if (!session || input.data.reset) {
      session = createSelfCareSession(enc);
      selfCareSessions.set(enc.id, session);
    }
    let result;
    if (input.data.questionId !== undefined && input.data.answer !== undefined) {
      try { result = answerSelfCare(enc, session, input.data.questionId, input.data.answer); }
      catch (error) { throw httpError(409, (error as Error).message); }
      if (enc.screening.selfCareAlert) { saveEncounter(enc); session.version = enc.version; }
    } else result = evaluateSelfCare(enc, session);
    trace('selfcare.evaluate', 'completed', `Self-care status: ${result.status}; no guidance saved to medical record`, 'application');
    res.json({ selfcare: result, snapshot: snapshot(enc.id) });
  } catch (error) { next(error); }
});

app.post('/api/encounters/:id/screening', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const parsed = screeningSchema.safeParse(req.body);
    if (turnQueues.has(enc.id)) throw httpError(409, 'A conversation turn is in progress. Retry the safety update after it completes.');
    if (!parsed.success) throw httpError(400, 'Invalid screening update: use paired key/answer and supported values');
    const { key, answer, purpose, physicalExam, adult } = parsed.data;
    if (key && answer) {
      if (!SAFETY_QUESTIONS.some(q => q.key === key)) throw httpError(400, `Unknown screening key ${key}`);
      if (!['yes', 'no', 'unknown'].includes(answer)) throw httpError(400, 'Answer must be yes, no, or unknown');
      enc.screening.answers[key] = answer as 'yes' | 'no' | 'unknown';
    }
    if (purpose) enc.screening.purpose = purpose;
    if (physicalExam) enc.screening.physicalExam = physicalExam;
    if (adult) enc.screening.adult = adult;
    enc.screening.completed = SAFETY_QUESTIONS.every(q => ['yes', 'no'].includes(enc.screening.answers[q.key]));
    saveEncounter(enc);
    res.json(snapshot(enc.id));
  } catch (err) { next(err); }
});

/** Patient explicitly confirms a summary field as accurate. Never done by the model. */
app.post('/api/encounters/:id/fields/:key/confirm', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const field = enc.fields.find(f => f.key === req.params.key);
    if (!field?.value || !field.sourceId) throw httpError(400, 'A missing field cannot be confirmed');
    field.verification = 'patient-confirmed';
    saveEncounter(enc);
    res.json(snapshot(enc.id));
  } catch (err) { next(err); }
});

app.post('/api/encounters/:id/documents', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const { name, text } = req.body as { name?: string; text?: string };
    boundedText(text, 20000);
    const doc = parseLabReport(boundedText(name ?? 'lab-report.txt', 120), text!);
    enc.documents.push(doc);
    saveEncounter(enc);
    res.json({ document: doc, snapshot: snapshot(enc.id) });
  } catch (err) { next(err); }
});

app.get('/api/doctors', (req, res) => {
  if (req.query.mode !== undefined && !['video', 'in-person'].includes(String(req.query.mode))) return res.status(400).json({ error: 'Unsupported consultation mode' });
  const mode = req.query.mode as 'video' | 'in-person' | undefined;
  res.json(listDoctors(mode));
});

app.post('/api/encounters/:id/proposals', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const { slotId } = req.body as { slotId?: string };
    if (!slotId) throw httpError(400, 'slotId is required');
    const proposal = createProposal(enc.id, slotId);
    res.json({ proposal, snapshot: snapshot(enc.id) });
  } catch (err) { next(err); }
});

/** Step 1 of the human gate: patient reviews exact details and presses Confirm. Returns a one-time token. */
app.post('/api/proposals/:id/confirm', (req, res, next) => {
  try {
    const { encounterId } = req.body as { encounterId?: string };
    if (!encounterId) throw httpError(400, 'encounterId is required');
    const tok = approveProposal(req.params.id!, encounterId);
    setConfirmationToken(encounterId, tok);
    trace('ui.confirm', 'completed', 'Patient pressed Confirm in the UI; one-time token issued to booking tool', 'application');
    res.json({ confirmed: true, token: tok });
  } catch (err) { next(err); }
});

/** Step 2 of the human gate: exchange the token for a real, atomic booking. */
app.post('/api/proposals/:id/book', (req, res, next) => {
  try {
    const { encounterId, token } = req.body as { encounterId?: string; token?: string };
    if (!encounterId || !token) throw httpError(400, 'encounterId and token are required');
    const booking = bookSlot(req.params.id!, token, encounterId);
    setConfirmationToken(encounterId, null);
    res.json({ booking, snapshot: snapshot(encounterId) });
  } catch (err) { next(err); }
});

/** Doctor sends ONE clarifying question. */
app.post('/api/encounters/:id/clarification', async (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const parsed = z.object({
      question: z.string(), fieldKey: z.enum(FIELD_KEYS).optional(), draftedBy: z.enum(['doctor', 'cline-sdk', 'template']).optional(),
    }).strict().safeParse(req.body);
    if (!parsed.success) throw httpError(400, 'Invalid clarification: question, optional fieldKey and draftedBy');
    if (enc.clarification) throw httpError(409, 'Only one clarifying question is supported');
    const { fieldKey, draftedBy } = parsed.data;
    if (fieldKey && enc.fields.find(f => f.key === fieldKey)?.value !== null) throw httpError(409, 'A clarifying question can only be linked to a field that is still missing');
    const question = boundedText(parsed.data.question, 500);
    const forPatient = enc.language === 'en' ? null : await translate(question, 'en', enc.language);
    enc.clarification = {
      question, askedAt: nowIso(), draftedBy: draftedBy ?? 'doctor',
      ...(fieldKey ? { fieldKey } : {}), ...(forPatient ? { questionForPatient: forPatient } : {}),
    };
    saveEncounter(enc);
    trace('clarification.ask', 'completed', `Doctor sent one question${fieldKey ? ` for missing field "${fieldKey}"` : ''}; ${forPatient ? `patient-language rendering: ${forPatient.status}` : 'no patient-language rendering available'}`);
    res.json(snapshot(enc.id));
  } catch (err) { next(err); }
});

/** Patient answers the clarification in their own language. */
app.post('/api/encounters/:id/clarification/answer', async (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const { text, enteredBy } = req.body as { text?: string; enteredBy?: unknown };
    if (!enc.clarification || enc.clarification.answer) throw httpError(409, 'No unanswered clarification');
    const who = enteredBySchema.safeParse(enteredBy ?? (enc.assistedBy ? 'health-worker' : 'patient'));
    if (!who.success) throw httpError(400, 'enteredBy must be patient or health-worker');
    const original = boundedText(text, 4000);
    const unsafe = evaluateRedFlags(enc.screening, [...enc.messages.filter(m => m.role === 'patient').map(m => m.text), original]).triggered.length > 0;
    const english = enc.language === 'en' || unsafe ? null : await translate(original, enc.language, 'en');
    const answer: Message = {
      id: uuid(), role: 'patient', text: original, language: enc.language, createdAt: nowIso(), enteredBy: who.data,
      ...(english ? { english: english.text, translation: english.status } : { translation: 'original' as const }),
    };
    enc.clarification.answer = answer;
    enc.messages.push(answer);
    // Close the loop: the linked missing field becomes patient-reported, sourced to this exact answer.
    const field = enc.clarification.fieldKey ? enc.fields.find(f => f.key === enc.clarification!.fieldKey) : undefined;
    if (field && field.value === null) {
      field.value = english?.text ?? original;
      field.sourceId = answer.id;
      field.transformation = english ? 'translation' : 'none';
      field.verification = 'unverified';
    }
    // Keep the conversation's field list in step, quoting the patient's exact words.
    const conversationField = enc.clarification.fieldKey ? enc.conversation?.fields.find(f => f.id === enc.clarification!.fieldKey) : undefined;
    if (conversationField && conversationField.status !== 'answered') {
      conversationField.status = 'answered';
      conversationField.value = english?.text ?? original;
      conversationField.quote = original;
      conversationField.sourceId = answer.id;
    }
    saveEncounter(enc);
    trace('clarification.answer', 'completed', `Patient answered in ${enc.language}${english ? ` (English rendering: ${english.status})` : ' (no English rendering)'}${field ? `; field "${field.key}" now patient-reported` : ''}`);
    res.json(snapshot(enc.id));
  } catch (err) { next(err); }
});

/** Doctor-side drafting: the Cline SDK agent reads the briefing and drafts one question. The doctor still decides. */
app.post('/api/encounters/:id/clarification/draft', async (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const missing = enc.fields.filter(f => f.value === null).map(f => f.key);
    if (!missing.length) throw httpError(409, 'No missing fields to ask about');
    let draft: ClarificationDraft | null = null;
    if (isAgentConfigured()) {
      try { draft = await draftClarificationWithAgent(enc.id, missing); }
      catch { trace('agent.draft-question', 'failed', 'Cline SDK draft unavailable; template draft used'); }
    }
    if (!draft) {
      const key = TEMPLATE_PRIORITY.find(k => missing.includes(k))!;
      draft = { question: TEMPLATE_QUESTIONS[key], fieldKey: key, draftedBy: 'template', note: isAgentConfigured() ? 'Agent draft failed; deterministic template used. Review before sending.' : 'No API key: deterministic template, no LLM used. Review before sending.' };
      trace('clarification.draft', 'completed', `Template draft for missing field "${key}" (no LLM)`);
    }
    res.json(draft);
  } catch (err) { next(err); }
});

/**
 * Safety probe for judges: try to book with no patient confirmation, through
 * the same book_slot tool the agent uses. The result is reported as it happened.
 */
app.post('/api/encounters/:id/gate-probe', async (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    if (hasConfirmationToken(enc.id)) throw httpError(409, 'A confirmation is in progress; run the probe before confirming');
    const proposal = openProposalForEncounter(enc.id);
    if (isAgentConfigured() && req.body.mode === 'agent') {
      try {
        const { outcome, chosen } = await runGateProbeWithAgent(enc.id, proposal?.id ?? null);
        return res.json({ via: 'cline-sdk', calledBookSlot: chosen.includes('book_slot'), outcome, booking: bookingForEncounter(enc.id) });
      } catch { trace('agent.gate-probe', 'failed', 'Cline SDK unavailable; direct tool probe used'); }
    }
    const { bookSlotTool } = await import('./agent/tools.ts');
    trace('gate-probe', 'started', 'Direct call to the book_slot tool with no patient confirmation (no LLM)');
    const tool = bookSlotTool(enc.id, () => null) as unknown as { execute: (input: { proposalId: string }, ctx?: unknown) => Promise<unknown> };
    const result = await tool.execute({ proposalId: proposal?.id ?? 'none' }, {});
    res.json({ via: 'direct-tool-call', calledBookSlot: true, outcome: JSON.stringify(result), booking: bookingForEncounter(enc.id) });
  } catch (err) { next(err); }
});

app.get('/api/traces', (_req, res) => { res.json(recentTraces(100)); });

app.get('/api/eval', async (_req, res, next) => {
  try { res.json(latestReport() ?? (await runEvaluation())); } catch (err) { next(err); }
});
app.post('/api/eval/run', async (_req, res, next) => {
  try { res.json(await runEvaluation()); } catch (err) { next(err); }
});

// Serve built client in production.
const dist = join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(dist, 'index.html'));
  });
}

app.use('/api', (_req, res) => { res.status(404).json({ error: 'API endpoint not found' }); });

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const port = Number(process.env.PORT ?? 3001);
if (process.env.SEHAT_TEST !== '1') {
  app.listen(port, '127.0.0.1', () => {
    getDb();
    console.log(`SEHAT OS API on http://127.0.0.1:${port} — mode: ${isAgentConfigured() ? 'Cline SDK (live LLM)' : 'guided (no API key)'}`);
  });
}

export { app };

const FIELD_KEYS = ['concern', 'duration', 'history', 'medications', 'allergies'] as const satisfies readonly FieldKey[];
const enteredBySchema = z.enum(['patient', 'health-worker']);
const TEMPLATE_PRIORITY: FieldKey[] = ['medications', 'allergies', 'history', 'duration', 'concern'];
const TEMPLATE_QUESTIONS: Record<FieldKey, string> = {
  medications: 'Are you taking any blood thinners or other regular medicines?',
  allergies: 'Do you have any allergies to medicines?',
  history: 'Do you have any long-term conditions, such as diabetes or high blood pressure?',
  duration: 'How long have you had this problem?',
  concern: 'What is the main problem you want to discuss?',
};

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(400, `Text is required (maximum ${max} characters)`);
  return value.trim();
}
