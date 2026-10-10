import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Encounter, Language } from '../../shared/types.ts';
import type { SelfCareEvidence, SelfCareQuestion, SelfCareResponse } from '../../shared/selfcare.ts';
import { evaluateRedFlags } from '../rules/redFlags.ts';

const localized = z.object({ en: z.string().min(1), hi: z.string().min(1), as: z.string().min(1) }).strict();
const questionSchema = localized.extend({
  id: z.string(), kind: z.enum(['text', 'number', 'yesno']),
  if_yes: z.enum(['doctor', 'emergency']).optional(), if_no: z.enum(['doctor', 'emergency']).optional(),
  care_after: z.number().optional(),
});
const topicSchema = z.object({
  id: z.string(), title: localized, symptom_terms: z.array(z.string()).min(1),
  ask_first: z.array(questionSchema).min(1), comfort_measures: z.array(localized).min(1),
  avoid: z.array(localized).min(1), see_doctor_if: z.array(localized).min(1), go_now_if: z.array(localized),
  max_days_before_care: z.number().nullable(), care_time_limit: localized, timing_needs_review: z.boolean(),
  excluded_groups: z.array(z.enum(['infant', 'under5', 'pregnant', 'over65', 'chronic'])),
  reviewed_by: z.string().nullable(), reviewed_on: z.string().nullable(),
  review_status: z.enum(['needs_clinician_review', 'reviewed']),
  translation_reviewed: z.object({ en: z.boolean(), hi: z.boolean(), as: z.boolean() }),
  source_section: z.string(),
}).strict();
export type SelfCareTopic = z.infer<typeof topicSchema>;
export const SELFCARE_TOPICS = z.array(topicSchema).parse(JSON.parse(readFileSync(new URL('../../data/selfcare.json', import.meta.url), 'utf8')));
const REVIEW_NOTE = 'Needs clinician review — not for patient use. Synthetic hackathon project. Not a diagnosis.';
export const SELFCARE_REFUSAL = "I can't advise on that, please speak to a health worker or doctor";
const EMERGENCY = 'This may be an emergency. Please go to the nearest hospital or call for an ambulance now. Do not wait.';

type AnswerRecord = { sourceId: string; text: string };
export interface SelfCareSession {
  encounterId: string; version: number; expiresAt: number; topicId?: string;
  asked: string[]; answers: Record<string, AnswerRecord>;
}
export function createSelfCareSession(enc: Encounter): SelfCareSession {
  return { encounterId: enc.id, version: enc.version, expiresAt: Date.now() + 30 * 60 * 1000, asked: [], answers: {} };
}
const q = (id: string, en: string, kind: 'text' | 'number' | 'yesno' = 'yesno') => ({ id, en, hi: 'TODO_TRANSLATE', as: 'TODO_TRANSLATE', kind });
const RISK_QUESTIONS = [
  q('risk.age', 'What is the patient’s age in months?', 'number'),
  q('risk.pregnant', 'Is the patient pregnant?'),
  q('risk.chronic', 'Does the patient have a long-term illness (diabetes, heart, kidney, asthma or immune problems)?'),
];
const UNIVERSAL_QUESTIONS = [
  q('safety.breath', 'Any chest pain, trouble breathing, gasping or blue lips?'),
  q('safety.neurology', 'Unconscious, very drowsy, confused, unable to wake, new or repeated fits, face drooping, limb weakness, slurred speech or sudden severe headache?'),
  q('safety.bleeding', 'Heavy bleeding that does not stop with firm pressure, vomiting blood, or black or bloody stool?'),
  q('safety.exposure', 'Snake bite, poisoning, or swallowing a chemical or unknown substance?'),
  q('safety.allergy', 'Swelling of face or throat, or hives with trouble breathing?'),
  q('safety.pregnancy', 'Pregnancy with bleeding, severe belly pain, fits, or reduced baby movement?'),
  q('safety.infant', 'Fever in a baby under 3 months?'),
  q('safety.dehydration', 'Very sleepy, no urine for 8 hours or more, sunken eyes, or cannot drink?'),
  q('safety.selfharm', 'Thoughts of self-harm or suicide?'),
];

/** Whitelist-only matching. Negated and ambiguous symptoms never silently pick a topic. */
export function matchSelfCareTopics(text: string, topics = SELFCARE_TOPICS): SelfCareTopic[] {
  return topics.filter(topic => topic.symptom_terms.some(term => {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return text.split(/[,.!?;]|\bbut\b|\band\b/i).some(clause => {
      const match = pattern.exec(clause);
      return match && !/\b(?:no|without|denies|not|don't have|do not have)\s*$/i.test(clause.slice(0, match.index));
    });
  }));
}

/** Always evaluates red flags itself. Callers cannot supply a model-generated safe boolean. */
export function evaluateSelfCare(enc: Encounter, session: SelfCareSession, topics = SELFCARE_TOPICS): SelfCareResponse {
  const evidence: SelfCareEvidence[] = enc.messages.filter(m => m.role === 'patient').map(m => ({ sourceId: m.id, question: 'Original patient message', text: m.text, tag: 'Patient reported' }));
  const base = (status: SelfCareResponse['status'], message: string): SelfCareResponse => ({ status, message, language: enc.language, topicId: session.topicId, questions: [], evidence, reviewNote: REVIEW_NOTE });
  const texts = enc.messages.filter(m => m.role === 'patient').map(m => `${m.english ?? ''} ${m.text}`);
  const redFlags = evaluateRedFlags(enc.screening, [...texts, ...Object.values(session.answers).map(a => a.text)]);
  if (redFlags.triggered.length) return base('emergency', EMERGENCY);
  // A newly reported emergency must win even if a session is stale, an
  // excluded group matches, or the patient also mentions an unsupported topic.
  if (UNIVERSAL_QUESTIONS.some(question => session.answers[question.id]?.text === 'yes')) return base('emergency', EMERGENCY);
  for (const [id, answer] of Object.entries(session.answers)) {
    const question = [...RISK_QUESTIONS, ...UNIVERSAL_QUESTIONS].find(q => q.id === id);
    if (question) evidence.push({ sourceId: answer.sourceId, question: question.en, text: answer.text, tag: 'Patient reported' });
  }
  if (session.version !== enc.version || session.encounterId !== enc.id || session.expiresAt <= Date.now()) {
    return base('screening_required', 'This session is stale. Restart and check the current patient information before guidance.');
  }
  const matches = matchSelfCareTopics(texts.join(' '), topics);
  if (!matches.length) return base('refused', SELFCARE_REFUSAL);
  if (texts.some(text => /\b(?:dose|dosage|which medicine|what medicine|prescribe|how many tablets)\b/i.test(text))) {
    return base('refused', 'Ask a pharmacist, ASHA worker or doctor which medicine is safe for you.');
  }
  const reportedRisk = matchSelfCareTopics(texts.join(' '), [{ ...matches[0], symptom_terms: ['pregnant', 'diabetes', 'asthma', 'kidney disease', 'heart disease', 'immune problems', 'infant', 'baby'] }]).length > 0;
  if (reportedRisk) return base('doctor', 'A reported high-risk condition requires a health worker or doctor. No home-care guidance will be given.');
  const topic = matches.length === 1 ? matches[0] : topics.find(t => t.id === session.answers['topic.choice']?.text && matches.some(m => m.id === t.id));
  function ask(questions: { id: string; en: string; hi: string; as: string; kind: 'text' | 'number' | 'yesno' }[]): SelfCareResponse | null {
    const entries: SelfCareQuestion[] = questions.map(question => ({
      id: question.id, text: question.id === 'topic.age' ? `${question.en} Enter age in months, as above.` : question.en, kind: question.kind,
      status: session.answers[question.id] && session.answers[question.id].text !== 'unknown' ? 'answered' : session.asked.includes(question.id) ? 'unanswered' : 'not_asked',
    }));
    const nextQuestion = entries.find(question => question.status !== 'answered');
    if (!nextQuestion) return null;
    if (!session.asked.includes(nextQuestion.id)) session.asked.push(nextQuestion.id);
    // This response actually asks the question; all later questions are still not asked.
    nextQuestion.status = 'unanswered';
    return { ...base('question', 'Please answer before guidance. Unknown is not no.'), questions: entries, nextQuestion };
  }
  // Unknown demographics cannot become a negative exclusion.
  const age = session.answers['risk.age']?.text;
  const months = age && age !== 'unknown' ? Number(age) : null;
  if (months !== null && months < 3 && matches.some(t => t.id === 'fever')) return base('emergency', EMERGENCY);
  const groups = new Set<string>();
  if (months !== null && months < 3) groups.add('infant');
  if (months !== null && months < 60) groups.add('under5');
  if (months !== null && months > 65 * 12) groups.add('over65');
  if (session.answers['risk.pregnant']?.text === 'yes') groups.add('pregnant');
  if (session.answers['risk.chronic']?.text === 'yes') groups.add('chronic');
  const excluded = matches.some(t => t.excluded_groups.some(group => groups.has(group)));
  if (matches.some(t => t.id === 'burns') && months !== null && (months < 18 * 12 || months > 65 * 12)) return base('emergency', EMERGENCY);
  if (excluded || enc.screening.adult === 'no' || months !== null && months < 18 * 12) {
    return base('doctor', 'Home-care guidance is not available for this age or risk group. Please speak to a health worker or doctor.');
  }
  if (enc.language !== 'en') return base('translation_unavailable', 'Self-care translations are unavailable and unreviewed. Guidance is blocked; please speak to a health worker or doctor.');
  if (redFlags.missingSafety.length || !enc.conversation && enc.screening.adult !== 'yes') return base('screening_required', 'Complete the existing safety screening first. No detected emergency does not mean symptoms are harmless.');
  const riskQuestion = ask(RISK_QUESTIONS);
  if (riskQuestion) return riskQuestion;
  const safetyQuestion = ask(UNIVERSAL_QUESTIONS);
  if (safetyQuestion) return safetyQuestion;
  if (!topic) {
    delete session.answers['topic.choice'];
    return ask([q('topic.choice', `More than one topic matches. Enter one topic ID: ${matches.map(t => t.id).join(', ')}`, 'text')])!;
  }
  session.topicId = topic.id;
  // Only actual submitted answers appear as evidence, separate from advice.
  const topicQuestions = topic.ask_first.map(question => ({ ...question, id: `topic.${question.id}` }));
  for (const question of topicQuestions) {
    const answer = session.answers[question.id];
    if (!answer || answer.text === 'unknown') continue;
    evidence.push({ sourceId: answer.sourceId, question: question.en, text: answer.text, tag: 'Patient reported' });
    if (question.id === 'topic.pregnant' && answer.text !== session.answers['risk.pregnant']?.text) return base('doctor', 'The pregnancy answers disagree. Please speak to a health worker or doctor; no advice can be given.');
    const escalation = answer.text === 'yes' ? question.if_yes : answer.text === 'no' ? question.if_no : undefined;
    if (escalation) return base(escalation, escalation === 'emergency' ? EMERGENCY : 'Please speak to a health worker or doctor now rather than waiting for home care.');
    if (question.care_after !== undefined && Number(answer.text) > question.care_after) return base('doctor', 'The draft’s care threshold has been reached. Please speak to a health worker or doctor.');
  }
  const topicQuestion = ask(topicQuestions);
  if (topicQuestion) return topicQuestion;
  if (topic.review_status !== 'reviewed' || !topic.reviewed_by?.trim() || !topic.reviewed_on || !/^\d{4}-\d{2}-\d{2}$/.test(topic.reviewed_on) || topic.timing_needs_review) {
    return base('review_required', 'This topic is awaiting clinician review. No comfort measures can be displayed for patient use. Please speak to a health worker or doctor.');
  }
  const language: Language = enc.language;
  const strings = [topic.title, ...topic.comfort_measures, ...topic.avoid, ...topic.go_now_if, ...topic.see_doctor_if, topic.care_time_limit, ...topic.ask_first];
  if (!topic.translation_reviewed[language] || strings.some(s => s[language] === 'TODO_TRANSLATE')) return base('translation_unavailable', 'Guidance is blocked until this language is reviewed.');
  return { ...base('guidance', "I'm sorry you're not feeling well. These symptoms can have many causes."), guidance: {
    title: topic.title[language], comfort_measures: topic.comfort_measures.map(s => s[language]), avoid: topic.avoid.map(s => s[language]),
    go_now_if: topic.go_now_if.map(s => s[language]), see_doctor_if: topic.see_doctor_if.map(s => s[language]), time_limit: topic.care_time_limit[language],
    reviewed_by: topic.reviewed_by, reviewed_on: topic.reviewed_on, tag: 'General guidance (reviewed)',
    footer: `General guidance, not a diagnosis. Reviewed by: ${topic.reviewed_by} (${topic.reviewed_on}). ${topic.care_time_limit[language]}`,
  } };
}

export function answerSelfCare(enc: Encounter, session: SelfCareSession, questionId: string, text: string): SelfCareResponse {
  const current = evaluateSelfCare(enc, session);
  if (current.status !== 'question' || current.nextQuestion?.id !== questionId) throw new Error('Only the current question can be answered');
  const trimmed = text.trim();
  const value = /^(?:unknown|not sure|unsure|i don'?t know|don'?t know)$/i.test(trimmed) ? 'unknown' : trimmed;
  if (!value || value.length > 1000) throw new Error('Answer is required (maximum 1000 characters)');
  if (current.nextQuestion.kind === 'yesno' && !['yes', 'no', 'unknown'].includes(value)) throw new Error('Use yes, no or unknown');
  if (current.nextQuestion.kind === 'number' && value !== 'unknown' && (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) throw new Error('Use a nonnegative number or unknown');
  if (questionId === 'risk.age' && value !== 'unknown' && Number(value) > 150 * 12) throw new Error('Age is outside the supported range');
  if (questionId === 'topic.age' && value !== 'unknown' && value !== session.answers['risk.age']?.text) throw new Error('Age must agree with the age in months already reported; restart to correct it');
  session.answers[questionId] = { sourceId: randomUUID(), text: value };
  const result = evaluateSelfCare(enc, session);
  // Persist only the reported warning, never the advice. A server-owned latch
  // ensures snapshot, agent tools and booking all see the same emergency.
  if (result.status === 'emergency') enc.screening.selfCareAlert = {
    sourceId: session.answers[questionId].sourceId, question: current.nextQuestion.text, patientText: value,
  };
  return result;
}