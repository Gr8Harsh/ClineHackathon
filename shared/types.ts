export type Language = 'en' | 'hi' | 'as';
export type Answer = 'yes' | 'no' | 'unknown';
export type Route = 'emergency' | 'clarification' | 'video' | 'in-person';
export type FieldKey = 'concern' | 'duration' | 'history' | 'medications' | 'allergies';
export const FIELD_LABELS: Record<FieldKey, string> = {
  concern: 'Main concern', duration: 'Duration', history: 'Medical history', medications: 'Current medications', allergies: 'Allergies',
};
export interface Message {
  id: string; role: 'patient' | 'assistant'; text: string; language: Language;
  english?: string; translation: 'original' | 'unverified' | 'fixture'; createdAt: string;
}
export interface BriefField {
  key: FieldKey; value: string | null; sourceId: string | null;
  verification: 'unverified' | 'patient-confirmed'; transformation: 'none' | 'translation';
}
export interface Screening {
  answers: Record<string, Answer>; adult: Answer; purpose: 'new-concern' | 'report-review' | 'follow-up';
  physicalExam: Answer; completed: boolean;
}
export interface CareDecision {
  route: Route; title: string; explanation: string; triggered: string[]; missing: string[]; ruleVersion: string;
}
export interface LabObservation {
  id: string; name: string; value: string; unit: string; line: number; sourceText: string;
  verification: 'unverified' | 'patient-confirmed';
}
export interface LabDocument { id: string; name: string; text: string; observations: LabObservation[]; createdAt: string }
export interface Clarification { question: string; askedAt: string; answer?: Message }
export interface Encounter {
  id: string; name: string; language: Language; messages: Message[]; fields: BriefField[];
  screening: Screening; documents: LabDocument[]; clarification?: Clarification;
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
export interface Snapshot { encounter: Encounter; decision: CareDecision; booking: Booking | null }
export interface EvalResult { name: string; expected: Route; actual: Route; passed: boolean }
export interface EvalReport { generatedAt: string; ruleVersion: string; results: EvalResult[]; passed: number; total: number }