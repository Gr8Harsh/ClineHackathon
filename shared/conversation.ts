import type { Language } from './types.ts';

export type SymptomArea = 'headache' | 'stomach' | 'fever' | 'cough' | 'rash' | 'general';
export type IntakeStatus = 'not_asked' | 'asked_unanswered' | 'answered' | 'unknown' | 'declined';
export interface IntakeField {
  id: string; label: string; required: boolean; status: IntakeStatus;
  value: string | null; quote: string | null; sourceId: string | null;
}
export interface ConversationState {
  area: SymptomArea; fields: IntakeField[]; pendingField: string | null;
  intakeComplete: boolean; bookingReady: boolean;
}
export interface ConversationOutput {
  reply: string;
  extracted: { field: string; value: string; quote: string }[];
  quick_replies: string[];
}
export interface ConversationContext {
  conversation: { role: string; text: string }[]; language: Language; latestMessage: string;
  FIELDS_NEEDED: IntakeField[]; FIELDS_DONE: IntakeField[];
  nextField: string | null; correction?: string;
}