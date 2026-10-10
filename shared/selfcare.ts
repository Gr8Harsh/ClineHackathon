import type { Language } from './types.ts';

export type SelfCareStatus = 'emergency' | 'doctor' | 'refused' | 'screening_required' | 'question' | 'review_required' | 'translation_unavailable' | 'guidance';
export interface SelfCareQuestion {
  id: string; text: string; kind: 'yesno' | 'text' | 'number';
  status: 'not_asked' | 'unanswered' | 'answered';
}
export interface SelfCareEvidence { sourceId: string; question: string; text: string; tag: 'Patient reported' }
export interface SelfCareGuidance {
  title: string; comfort_measures: string[]; avoid: string[]; go_now_if: string[]; see_doctor_if: string[];
  time_limit: string; reviewed_by: string; reviewed_on: string;
  tag: 'General guidance (reviewed)'; footer: string;
}
export interface SelfCareResponse {
  status: SelfCareStatus; message: string; language: Language; topicId?: string;
  questions: SelfCareQuestion[]; nextQuestion?: SelfCareQuestion;
  evidence: SelfCareEvidence[]; guidance?: SelfCareGuidance;
  reviewNote: string;
}
export type SelfCareRequest = { reset?: boolean; questionId?: string; answer?: string };