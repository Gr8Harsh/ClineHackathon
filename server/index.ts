import express, { Request, Response, NextFunction } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Message, Snapshot, CareDecision, Booking } from '../shared/types.ts';
import { getDb } from './db.ts';
import { createEncounter, getEncounter, saveEncounter, listEncounters } from './domain/encounterStore.ts';
import { extractFields } from './domain/briefing.ts';
import { parseLabReport } from './domain/documents.ts';
import { decideCareRoute } from './rules/careRoute.ts';
import { listDoctors, createProposal, approveProposal, bookSlot, bookingForEncounter, httpError } from './domain/booking.ts';
import { pickNextQuestion, parseAnswer } from './domain/intake.ts';
import { recentTraces, trace } from './trace.ts';
import { uuid, nowIso } from './lib/ids.ts';
import { runAgentTurn, isAgentConfigured, setConfirmationToken } from './agent/runAgent.ts';
import { runEvaluation, latestReport } from './eval/runner.ts';
import { RULE_VERSION } from './rules/redFlags.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.use(express.json({ limit: '1mb' }));

function snapshot(encounterId: string): Snapshot {
  const enc = getEncounter(encounterId);
  if (!enc) throw httpError(404, 'Encounter not found');
  const freeText = enc.messages.filter(m => m.role === 'patient').map(m => `${m.english ?? ''} ${m.text}`);
  const video = listDoctors('video').some(d => d.slots.length > 0);
  const inPerson = listDoctors('in-person').some(d => d.slots.length > 0);
  const decision: CareDecision = decideCareRoute(enc.screening, freeText, { video, inPerson });
  const booking: Booking | null = bookingForEncounter(enc.id);
  return { encounter: enc, decision, booking };
}

/** Guided mode: deterministic assistant that asks the next needed question. No LLM. */
function guidedReply(encounterId: string, userText: string): Message {
  const enc = getEncounter(encounterId)!;
  const q = pickNextQuestion(enc);
  let reply: string;
  if (q) {
    reply = q.text;
  } else {
    const d = snapshot(encounterId).decision;
    reply = `Thank you. Here is where things stand: ${d.title}. ${d.explanation}`;
  }
  const message: Message = { id: uuid(), role: 'assistant', text: reply, language: enc.language, translation: 'original', createdAt: nowIso() };
  enc.messages.push(message);
  saveEncounter(enc);
  trace('guided.reply', 'completed', 'Guided-mode deterministic follow-up (no LLM used)', 'application');
  return message;
}

function requireEncounter(req: Request) {
  const enc = getEncounter(req.params.id!);
  if (!enc) throw httpError(404, 'Encounter not found');
  return enc;
}

// --- Routes ---
app.get('/api/health', (_req, res) => {
  getDb();
  res.json({ ok: true, agentMode: isAgentConfigured() ? 'cline-sdk' : 'guided', ruleVersion: RULE_VERSION });
});

app.post('/api/encounters', (req, res) => {
  const { language, name } = req.body as { language?: Language; name?: string };
  const enc = createEncounter(['en', 'hi', 'as'].includes(language ?? '') ? language! : 'en', name);
  res.json(snapshot(enc.id));
});

app.get('/api/encounters', (_req, res) => {
  res.json(listEncounters().map(e => ({ id: e.id, name: e.name, language: e.language, createdAt: e.createdAt })));
});

app.get('/api/encounters/:id', (req, res) => {
  res.json(snapshot(req.params.id!));
});

app.post('/api/encounters/:id/messages', async (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const text = boundedText(req.body.text, 4000);
    const pending = pickNextQuestion(enc);
    const previous = enc.messages.at(-1);
    const answer = parseAnswer(text);
    if (previous?.role === 'assistant' && pending && previous.text === pending.text && answer) {
      if (pending.type === 'safety' && pending.key) enc.screening.answers[pending.key] = answer;
      if (pending.type === 'exam') enc.screening.physicalExam = answer;
    }
    const patientMsg: Message = { id: uuid(), role: 'patient', text, language: enc.language, translation: 'original', createdAt: nowIso() };
    enc.messages.push(patientMsg);
    const fields = extractFields(enc.messages);
    enc.fields = fields.map(f => {
      const old = enc.fields.find(o => o.key === f.key);
      return old?.value === f.value && old?.sourceId === f.sourceId ? old : f;
    });
    saveEncounter(enc);
    const emergency = snapshot(enc.id).decision.route === 'emergency';
    let reply: Message;
    try { reply = isAgentConfigured() && !emergency ? await runAgentTurn(enc.id, text, enc.language) : guidedReply(enc.id, text); }
    catch {
      trace('agent.turn', 'failed', 'Language service unavailable; guided fallback used');
      reply = guidedReply(enc.id, text);
    }
    res.json({ message: reply, snapshot: snapshot(enc.id) });
  } catch (err) { next(err); }
});

app.post('/api/encounters/:id/screening', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const { key, answer, purpose, physicalExam, adult } = req.body as {
      key?: string; answer?: string; purpose?: string; physicalExam?: string; adult?: string;
    };
    if (key && answer) {
      if (!(key in enc.screening.answers)) throw httpError(400, `Unknown screening key ${key}`);
      if (!['yes', 'no', 'unknown'].includes(answer)) throw httpError(400, 'Answer must be yes, no, or unknown');
      enc.screening.answers[key] = answer as 'yes' | 'no' | 'unknown';
    }
    if (purpose && ['new-concern', 'report-review', 'follow-up'].includes(purpose)) enc.screening.purpose = purpose as never;
    if (physicalExam && ['yes', 'no', 'unknown'].includes(physicalExam)) enc.screening.physicalExam = physicalExam as never;
    if (adult && ['yes', 'no', 'unknown'].includes(adult)) enc.screening.adult = adult as never;
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
    const doc = parseLabReport(boundedText(name ?? 'lab-report.txt', 120), boundedText(text, 20000));
    enc.documents.push(doc);
    saveEncounter(enc);
    res.json({ document: doc, snapshot: snapshot(enc.id) });
  } catch (err) { next(err); }
});

app.get('/api/doctors', (req, res) => {
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
app.post('/api/encounters/:id/clarification', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const { question } = req.body as { question?: string };
    if (enc.clarification) throw httpError(409, 'Only one clarifying question is supported');
    enc.clarification = { question: boundedText(question, 500), askedAt: nowIso() };
    saveEncounter(enc);
    res.json(snapshot(enc.id));
  } catch (err) { next(err); }
});

/** Patient answers the clarification in their own language. */
app.post('/api/encounters/:id/clarification/answer', (req, res, next) => {
  try {
    const enc = requireEncounter(req);
    const { text } = req.body as { text?: string };
    if (!enc.clarification || enc.clarification.answer) throw httpError(409, 'No unanswered clarification');
    const answer: Message = { id: uuid(), role: 'patient', text: boundedText(text, 4000), language: enc.language, translation: 'original', createdAt: nowIso() };
    enc.clarification.answer = answer;
    enc.messages.push(answer);
    saveEncounter(enc);
    res.json(snapshot(enc.id));
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

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

const port = Number(process.env.PORT ?? 3001);
if (process.env.SEHAT_TEST !== '1') {
  app.listen(port, '127.0.0.1', () => {
    getDb();
    console.log(`SEHAT OS API on http://127.0.0.1:${port} — mode: ${isAgentConfigured() ? 'Cline SDK (live LLM)' : 'guided (no API key)'}`);
  });
}

export { app };

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(400, `Text is required (maximum ${max} characters)`);
  return value.trim();
}
