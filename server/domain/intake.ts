import { Encounter, FieldKey } from '../../shared/types.ts';
import { RED_FLAG_RULES } from '../rules/redFlags.ts';

/**
 * Conversational guided intake (no LLM). Asks in a natural order and stops
 * before the warning-sign checklist, which is presented separately as a
 * "safety check" step rather than dumped into the chat one rule at a time.
 */

export type PromptKind = 'yesno' | 'text';

/** Warning-sign checklist for the separate "safety check" step (server-driven). */
export const SAFETY_QUESTIONS = RED_FLAG_RULES.filter(r => r.screeningKey).map(r => ({
  key: r.screeningKey!, text: r.label,
}));

export const FIELD_QUESTIONS: Partial<Record<FieldKey, string>> = {
  duration: 'How long has this been going on — a few hours, days, or weeks?',
  history: 'Is there any medical history the doctor should know about, like diabetes or high blood pressure?',
  medications: 'Do you take any medicines regularly? If none, just say "none".',
  allergies: 'Do you have any allergies to medicines or food? If none, just say "none".',
};

export interface NextQuestion { type: 'field'; key?: string; text: string; kind: PromptKind }

/** Natural intake order. The warning-sign rules are handled by the safety-check step, not here. */
export function pickNextQuestion(encounter: Encounter): NextQuestion | null {
  for (const key of ['duration', 'history', 'medications', 'allergies'] as FieldKey[]) {
    const f = encounter.fields.find(x => x.key === key);
    if (!f || f.value === null) return { type: 'field', key, text: FIELD_QUESTIONS[key]!, kind: 'text' };
  }
  return null;
}

/** True when the conversational intake is complete and only the safety check remains. */
export function intakeComplete(encounter: Encounter): boolean {
  return ['duration', 'history', 'medications', 'allergies'].every(k => encounter.fields.find(f => f.key === k)?.value !== null);
}

/** Very small, honest structured-answer parser. No free inference. */
export function parseAnswer(text: string): 'yes' | 'no' | 'unknown' | null {
  const t = text.trim().toLowerCase();
  if (['yes', 'y', 'yeah', 'yep', 'হয়', 'হয়', 'हाँ', 'हां', 'haan', 'ha'].includes(t)) return 'yes';
  if (['no', 'n', 'nah', 'nope', 'নাই', 'নহয়', 'नहीं', 'नही', 'nahi', 'none', 'nil'].includes(t)) return 'no';
  if (['unsure', "don't know", 'dont know', 'unknown', 'not sure', 'maybe'].includes(t)) return 'unknown';
  return null;
}
