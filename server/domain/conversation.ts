import type { ConversationContext, ConversationState, IntakeField } from '../../shared/conversation.ts';
import type { Encounter, Message } from '../../shared/types.ts';
import { configs, detectSymptomArea } from '../config/conversationFields.ts';
import { generateConversation, isAgentConfigured } from '../agent/runAgent.ts';
import { acceptedExtractions, isDeclined, isUnknown, plainReply, validateConversationOutput } from '../agent/conversationValidation.ts';
import { evaluateRedFlags } from '../rules/redFlags.ts';
import { uuid, nowIso } from '../lib/ids.ts';
import { trace } from '../trace.ts';

export const EMERGENCY_REPLY = 'Emergency warning signs were reported. Go to the nearest emergency department or call your local emergency number now. Do not wait for an appointment.';
export function ensureConversation(enc: Encounter): ConversationState {
  if (!enc.conversation) {
    const area = detectSymptomArea(enc.messages.filter(m => m.role === 'patient').map(m => m.text).join(' '));
    enc.conversation = { area, fields: configs(area).map(f => ({ id: f.id, label: f.label, required: f.required, status: 'not_asked', value: null, quote: null, sourceId: null })), pendingField: null, intakeComplete: false, bookingReady: false };
  }
  return enc.conversation;
}
function record(field: IntakeField, text: string, source: Message) {
  field.status = isUnknown(text) ? 'unknown' : !field.required && isDeclined(text) ? 'declined' : 'answered';
  field.value = field.status === 'answered' ? text : null; field.quote = text; field.sourceId = source.id;
}
export function ageInMonths(enc: Encounter): number | null {
  const field = enc.conversation?.fields.find(f => f.id === 'age' && f.status === 'answered');
  const value = field?.value?.trim();
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)\s*(months?|years?|वर्ष|साल|মাহ|বছৰ)?$/iu.exec(value);
  if (!match) return null;
  return Number(match[1]) * (/month|মাহ/i.test(match[2] ?? '') ? 1 : 12);
}
export function conversationComplete(enc: Encounter): boolean { return Boolean(enc.conversation?.fields.filter(f => f.required).every(f => ['answered', 'unknown'].includes(f.status))); }

export type ConversationGenerator = (context: ConversationContext) => Promise<string>;
export async function conversationTurn(enc: Encounter, patient: Message, generator?: ConversationGenerator): Promise<Message> {
  const emergency = evaluateRedFlags(enc.screening, enc.messages.filter(m => m.role === 'patient').map(m => m.text));
  if (emergency.triggered.length) return makeReply(EMERGENCY_REPLY, 'safety', [], 'emergency_bypass');
  const state = ensureConversation(enc);
  const config = configs(state.area);
  const pending = state.fields.find(f => f.id === state.pendingField);
  // Explicit optional-field submissions use the same message and provenance path.
  const explicit = /^(age|medications|allergies|history)\s*:\s*(.+)$/isu.exec(patient.text);
  if (explicit) {
    const field = state.fields.find(f => f.id === explicit[1].toLowerCase())!;
    const value = explicit[2].trim();
    if (field.id !== 'age' || isUnknown(value) || isDeclined(value) || /^\d+(?:\.\d+)?\s*(months?|years?|वर्ष|साल|মাহ|বছৰ)?$/iu.test(value)) record(field, value, patient);
  }
  // Retain the supplied draft's age-dependent fever safeguard in the conversation path.
  const months = ageInMonths(enc);
  if (months !== null && months < 3 && state.area === 'fever') {
    enc.screening.selfCareAlert = { sourceId: state.fields.find(f => f.id === 'age')!.sourceId!, question: 'Fever in a baby under 3 months', patientText: patient.text };
    return makeReply(EMERGENCY_REPLY, 'safety', [], 'infant_fever_safeguard');
  }
  if (pending && (isUnknown(patient.text) || !pending.required && isDeclined(patient.text))) record(pending, patient.text, patient);
  const context: ConversationContext = {
    conversation: enc.messages.map(m => ({ role: m.role, text: m.text })), language: enc.language, latestMessage: patient.text,
    FIELDS_NEEDED: state.fields.filter(f => !['answered', 'unknown', 'declined'].includes(f.status)),
    FIELDS_DONE: state.fields.filter(f => ['answered', 'unknown', 'declined'].includes(f.status)), nextField: state.pendingField,
  };
  const call = generator ?? (isAgentConfigured() ? generateConversation : null);
  let failure = call ? 'invalid_model_output' : 'missing_provider_configuration';
  if (call) for (let attempt = 0; attempt < 2; attempt++) {
    // Check again before a retry, not just before the first model call.
    if (evaluateRedFlags(enc.screening, enc.messages.filter(m => m.role === 'patient').map(m => m.text)).triggered.length) return makeReply(EMERGENCY_REPLY, 'safety', [], 'emergency_bypass');
    try {
      const raw = await call(context);
      // Evidence acceptance is independent from whether the generated reply passes style validation.
      const extractions = acceptedExtractions(raw, patient.text, state.fields);
      for (const e of extractions) {
        const field = state.fields.find(f => f.id === e.field)!;
        if (field.id === 'age' && !isUnknown(e.value) && !isDeclined(e.value) && !/^(\d+(?:\.\d+)?)\s*(months?|years?|वर्ष|साल|মাহ|বছৰ)?$/iu.test(e.value)) continue;
        record(field, e.quote, patient);
      }
      const validated = validateConversationOutput(raw, patient.text, state.fields, config);
      const recordedMonths = ageInMonths(enc);
      if (recordedMonths !== null && recordedMonths < 3 && state.area === 'fever') {
        enc.screening.selfCareAlert = { sourceId: state.fields.find(f => f.id === 'age')!.sourceId!, question: 'Fever in a baby under 3 months', patientText: patient.text };
        return makeReply(EMERGENCY_REPLY, 'safety', [], 'infant_fever_safeguard');
      }
      state.pendingField = validated.questionField;
      if (state.pendingField) { const field = state.fields.find(f => f.id === state.pendingField)!; field.status = 'asked_unanswered'; }
      state.intakeComplete = conversationComplete(enc);
      trace('conversation.validation', 'completed', `Accepted ${validated.output.extracted.length} extractions; rejected ${validated.rejectedExtractions}; attempt ${attempt + 1}`);
      const response = makeReply(plainReply(validated.output.reply), 'cline', validated.output.quick_replies);
      response.language = enc.language;
      return response;
    } catch (error) {
      const validation = error instanceof SyntaxError || error instanceof Error && /Formatting|Reply|Apology|Question|question|required|Quick|JSON|Medicine|Patient|Zod/.test(error.message);
      failure = validation ? 'invalid_model_output' : error instanceof Error && error.name === 'ProviderTimeout' ? 'provider_timeout' : 'provider_error';
      const safeReason = error instanceof SyntaxError ? 'JSON parse failed' : validation && error instanceof Error && error.name !== 'ZodError' ? error.message.slice(0, 140) : error instanceof Error ? error.name : 'unknown';
      trace('conversation.retry', 'failed', `${failure}; encounter ${enc.id.slice(0, 8)}; message ${patient.id}; attempt ${attempt + 1}; ${safeReason}`);
      context.correction = validation ? `${safeReason}. Return a raw JSON object without code fences. Ask only a required missing field using the supplied question catalog.` : 'Previous provider attempt failed. Return valid JSON.';
      context.FIELDS_NEEDED = state.fields.filter(f => !['answered', 'unknown', 'declined'].includes(f.status));
      context.FIELDS_DONE = state.fields.filter(f => ['answered', 'unknown', 'declined'].includes(f.status));
    }
  }
  // Clearly labelled deterministic fallback records only direct answers to the tracked question.
  if (!explicit && pending && !['answered', 'unknown', 'declined'].includes(pending.status) && !isDeclined(patient.text)) record(pending, patient.text, patient);
  const next = state.fields.find(f => f.required && !['answered', 'unknown'].includes(f.status));
  state.pendingField = next?.id ?? null; state.intakeComplete = conversationComplete(enc);
  if (next) next.status = 'asked_unanswered';
  const question = config.find(f => f.id === next?.id);
  if (enc.language !== 'en') { state.pendingField = null; return makeReply('The language service is unavailable. Your original message is saved. Please retry or ask a health worker to help.', 'fixture', [], failure); }
  return makeReply(question?.question ?? 'Your consultation notes are ready. Complete any remaining safety questions before choosing an appointment.', 'fixture', question?.quick_replies.length === 1 ? [] : question?.quick_replies ?? [], failure);
}
function makeReply(text: string, origin: Message['replyOrigin'], quickReplies: string[], reason?: string): Message {
  return { id: uuid(), role: 'assistant', text, language: 'en', translation: 'original', createdAt: nowIso(), replyOrigin: origin, quickReplies, fallbackReason: reason };
}