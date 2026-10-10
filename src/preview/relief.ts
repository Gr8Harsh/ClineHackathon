import type { AvailableDoctor, Snapshot } from '../../shared/types.ts';
import type { SelfCareResponse } from '../../shared/selfcare.ts';

export type ReliefQuestion = { id: string; text: string; kind: 'yesno' | 'text' | 'number'; target: 'screening' | 'selfcare' };

export function nextReliefQuestion(snapshot: Snapshot, result: SelfCareResponse, catalog: { key: string; text: string }[]): ReliefQuestion | null {
  if (snapshot.decision.route === 'emergency' || result.status === 'emergency') return null;
  if (result.status === 'screening_required') {
    const missing = catalog.find(q => !['yes', 'no'].includes(snapshot.encounter.screening.answers[q.key]));
    if (missing) return { id: missing.key, text: `Are you experiencing this warning sign: ${missing.text}?`, kind: 'yesno', target: 'screening' };
  }
  if (result.nextQuestion) return { ...result.nextQuestion, target: 'selfcare' };
  return null;
}

export function availableReliefDoctors(doctors: AvailableDoctor[], location: string, route: Snapshot['decision']['route']): AvailableDoctor[] {
  if (route === 'emergency') return [];
  return doctors.filter(d => d.status === 'available' && d.location.toLowerCase().includes(location.trim().toLowerCase()))
    .map(d => ({ ...d, slots: d.slots.filter(s => Date.parse(s.startsAt) > Date.now() && (route === 'clarification' || s.mode === route)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) }))
    .filter(d => d.slots.length > 0)
    .sort((a, b) => Date.parse(a.slots[0].startsAt) - Date.parse(b.slots[0].startsAt));
}

export function reliefExplanation(result: SelfCareResponse): string {
  switch (result.status) {
    case 'question': return 'Before considering temporary relief, I need to check a few details. Please answer only what you know.';
    case 'screening_required': return 'Safety information is still missing. Complete the server safety questions in the Patient tab before considering relief. A symptom description alone cannot establish mildness.';
    case 'review_required': return 'Temporary relief for this topic is awaiting clinician review, so I can’t safely show comfort measures yet. You can explore the available doctor options below.';
    case 'translation_unavailable': return 'Temporary relief is not available in this language yet. Reviewed translations are needed before advice can be shown. Doctor options are still available.';
    case 'refused': return 'I can’t provide temporary relief for this request. Only approved topics are supported, and medicine or dose questions need a pharmacist or doctor. You can explore doctor options below.';
    default: return result.message;
  }
}