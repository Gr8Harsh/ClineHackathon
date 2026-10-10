import { Encounter, FieldKey } from '../../shared/types.ts';

/** Safety questions the deterministic engine wants answered before it trusts an interpretation. */
export const SAFETY_QUESTIONS = [
  { key: 'breathlessSevere', text: 'Are you having severe difficulty breathing — gasping or unable to speak in full sentences?' },
  { key: 'oneSidedWeakness', text: 'Do you have weakness or numbness on one side of the body or face?' },
  { key: 'faceDroop', text: 'Is one side of the face drooping or numb?' },
  { key: 'speechSlurred', text: 'Is your speech slurred, or are you having trouble finding words?' },
  { key: 'selfHarm', text: 'Are you having thoughts of harming yourself or ending your life?' },
] as const;

/** Missing summary fields that still matter. Missing is never turned into "no". */
export const FIELD_QUESTIONS: Partial<Record<FieldKey, string>> = {
  duration: 'How long has this been going on — hours, days or weeks?',
  medications: 'What medicines do you take regularly? If none, say "none".',
  allergies: 'Do you have any medicine or food allergies? If none, say "none".',
};

export const PHYSICAL_EXAM_QUESTION = 'Might a doctor need to examine you in person for this (for example, to press on the area or use a statoroscope)? Answer yes, no, or unsure.';

export function pickNextQuestion(encounter: Encounter): { type: 'safety' | 'field' | 'exam'; key?: string; text: string } | null {
  for (const q of SAFETY_QUESTIONS) {
    if (encounter.screening.answers[q.key] === 'unknown') return { type: 'safety', key: q.key, text: q.text };
  }
  if (encounter.screening.physicalExam === 'unknown') return { type: 'exam', text: PHYSICAL_EXAM_QUESTION };
  for (const key of ['duration', 'medications', 'allergies'] as FieldKey[]) {
    const f = encounter.fields.find(x => x.key === key);
    if (!f || f.value === null) return { type: 'field', key, text: FIELD_QUESTIONS[key]! };
  }
  return null;
}

/** Very small, honest structured-answer parser. No free inference. */
export function parseAnswer(text: string): 'yes' | 'no' | 'unknown' | null {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|ha|haa|hàn|হয়|হয়ছে|oui|sí)\b/.test(t) || t === 'y') return 'yes';
  if (/^(no|nope|nah|নাই|নহয়|नहीं|नही|nahi)\b/.test(t) || t === 'n') return 'no';
  if (/(unsure|don'?t know|dont know|unknown|not sure|maybe)/.test(t)) return 'unknown';
  if (/(^|\s)(none|nil|no allergies|no medicines|no meds)(\s|$|\.)/.test(t)) return 'no';
  return null;
}