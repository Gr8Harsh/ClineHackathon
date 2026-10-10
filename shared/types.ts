import type { ConversationState } from './conversation.ts';
export type Language = 'en' | 'hi' | 'as';
export type Answer = 'yes' | 'no' | 'unknown';
export type Route = 'emergency' | 'clarification' | 'video' | 'in-person';
export type FieldKey = 'concern' | 'duration' | 'history' | 'medications' | 'allergies';
export const FIELD_LABELS: Record<FieldKey, string> = {
  concern: 'Main concern', duration: 'Duration', history: 'Medical history', medications: 'Current medications', allergies: 'Allergies',
};
/** Who physically typed or spoke a patient message. The words are still the patient's. */
export type EnteredBy = 'patient' | 'health-worker';
export interface Message {
  id: string; role: 'patient' | 'assistant'; text: string; language: Language;
  english?: string; translation: 'original' | 'unverified' | 'fixture'; createdAt: string;
  enteredBy?: EnteredBy;
  replyOrigin?: 'cline' | 'fixture' | 'safety';
  fallbackReason?: string;
  quickReplies?: string[];
  clientMessageId?: string;
}
export interface BriefField {
  key: FieldKey; value: string | null; sourceId: string | null;
  verification: 'unverified' | 'patient-confirmed'; transformation: 'none' | 'translation';
}
export interface Screening {
  answers: Record<string, Answer>; adult: Answer; purpose: 'new-concern' | 'report-review' | 'follow-up';
  physicalExam: Answer; completed: boolean;
  /** Application-owned latch from a patient answer in the separate self-care session. No advice is stored. */
  selfCareAlert?: { sourceId: string; question: string; patientText: string };
}
export interface CareDecision {
  route: Route; title: string; explanation: string; triggered: string[]; missing: string[]; ruleVersion: string;
}
export interface LabObservation {
  id: string; name: string; value: string; unit: string; line: number; sourceText: string;
  verification: 'unverified' | 'patient-confirmed';
}
export interface LabDocument { id: string; name: string; text: string; observations: LabObservation[]; createdAt: string }
export interface Clarification {
  question: string; askedAt: string; answer?: Message;
  /** Briefing field this question is meant to fill, if the doctor linked one. */
  fieldKey?: FieldKey;
  /** How the question text was produced. The doctor always reviews and sends it. */
  draftedBy?: 'doctor' | 'cline-sdk' | 'template';
  /** The question rendered in the patient's language, when an honest rendering exists. */
  questionForPatient?: { text: string; status: 'fixture' | 'unverified' };
}
/** ASHA / clinic worker who ran the intake for a patient (assisted mode). Synthetic demo identity only. */
export interface AssistedBy { name: string; role: 'asha' | 'clinic-staff' }
export interface Encounter {
  id: string; name: string; language: Language; messages: Message[]; fields: BriefField[];
  screening: Screening; documents: LabDocument[]; clarification?: Clarification;
  /** Fields the application actually asked about. Missing + never asked is shown as "not asked". */
  askedFields?: FieldKey[];
  /** Free-form LLM turns ask questions the app cannot track, so "not asked" cannot be claimed after one. */
  agentTurns?: number;
  assistedBy?: AssistedBy;
  conversation?: ConversationState;
  createdAt: string; version: number;
}
export interface Doctor {
  id: string; name: string; specialty: string; initials: string; languages: string;
  location: string; fee: number; status: 'available' | 'offline'; video: number;
}
export interface Slot { id: string; doctorId: string; startsAt: string; mode: 'video' | 'in-person' }
export interface AvailableDoctor extends Doctor { slots: Slot[] }
export interface Booking {
  id: string; encounterId: string; slotId: string; doctorName: string; startsAt: string;
  mode: string; fee: number; createdAt: string;
}
export interface Proposal { id: string; slotId: string; doctorName: string; startsAt: string; mode: string; fee: number; expiresAt: string }
export interface TraceEvent {
  id: string; at: string; name: string; status: 'started' | 'completed' | 'failed';
  detail: string; origin: 'application' | 'cline-sdk';
}
export interface Snapshot { encounter: Encounter; decision: CareDecision; booking: Booking | null; proposal: Proposal | null }
export interface ClarificationDraft { question: string; fieldKey: FieldKey | null; draftedBy: 'cline-sdk' | 'template'; note: string }
export interface EvalResult { name: string; expected: Route; actual: Route; passed: boolean }
export interface EvalReport { generatedAt: string; ruleVersion: string; results: EvalResult[]; passed: number; total: number }