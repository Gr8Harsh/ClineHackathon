import { Encounter, FieldKey } from '../../shared/types.ts';
import { RED_FLAG_RULES } from '../rules/redFlags.ts';

/** Safety questions the deterministic engine wants answered before it trusts an interpretation. */
export const SAFETY_QUESTIONS = RED_FLAG_RULES.filter(r => r.screeningKey).map(r => ({
  key: r.screeningKey!, text: `Are you experiencing this warning sign: ${r.label}? Answer yes, no, or unsure.`,
}));

/** Missing summary fields that still matter. Missing is never turned into "no". */
export const FIELD_QUESTIONS: Partial<Record<FieldKey, string>> = {
  duration: 'How long has this been going on? Reply with "duration: ...".',
  history: 'What medical history should the doctor know? Reply with "history: ...".',
  medications: 'What medicines do you take regularly? Reply with "medications: ..."; say none only if truly none.',
  allergies: 'Do you have any allergies? Reply with "allergies: ..."; say none only if truly none.',
};

export const PHYSICAL_EXAM_QUESTION = 'Might an in-person examination be needed? Answer yes, no, or unsure. A clinician must assess suitability.';
export const ADULT_QUESTION = 'Are you 18 years or older? This illustrative demo is adults-only. Answer yes, no, or unsure.';

export function pickNextQuestion(encounter: Encounter): { type: 'safety' | 'field' | 'exam' | 'adult'; key?: string; text: string } | null {
  for (const q of SAFETY_QUESTIONS) {
    if (!['yes', 'no'].includes(encounter.screening.answers[q.key])) return { type: 'safety', key: q.key, text: q.text };
  }
  if (encounter.screening.adult === 'unknown') return { type: 'adult', text: ADULT_QUESTION };
  if (encounter.screening.physicalExam === 'unknown') return { type: 'exam', text: PHYSICAL_EXAM_QUESTION };
  for (const key of ['duration', 'history', 'medications', 'allergies'] as FieldKey[]) {
    const f = encounter.fields.find(x => x.key === key);
    if (!f || f.value === null) return { type: 'field', key, text: FIELD_QUESTIONS[key]! };
  }
  return null;
}

/** Very small, honest structured-answer parser. No free inference. */
export function parseAnswer(text: string): 'yes' | 'no' | 'unknown' | null {
  const t = text.trim().toLowerCase();
  if (['yes', 'y', 'হয়', 'হয়', 'हाँ', 'हां'].includes(t)) return 'yes';
  if (['no', 'n', 'নাই', 'নহয়', 'नहीं', 'नही'].includes(t)) return 'no';
  if (['unsure', "don't know", 'unknown', 'not sure', 'maybe'].includes(t)) return 'unknown';
  return null;
}