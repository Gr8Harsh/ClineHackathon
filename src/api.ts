import type { AvailableDoctor, Booking, EvalReport, Language, Message, Proposal, Snapshot, TraceEvent, LabDocument } from '../shared/types.ts';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const body = await res.json(); if (body.error) msg = body.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ ok: boolean; agentMode: 'cline-sdk' | 'guided'; ruleVersion: string }>('/api/health'),
  createEncounter: (language: Language) => req<Snapshot>('/api/encounters', { method: 'POST', body: JSON.stringify({ language }) }),
  getEncounter: (id: string) => req<Snapshot>(`/api/encounters/${id}`),
  listEncounters: () => req<{ id: string; name: string; language: Language; createdAt: string }[]>('/api/encounters'),
  sendMessage: (id: string, text: string) => req<{ message: Message; snapshot: Snapshot }>(`/api/encounters/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  setScreening: (id: string, body: { key?: string; answer?: string; purpose?: string; physicalExam?: string }) => req<Snapshot>(`/api/encounters/${id}/screening`, { method: 'POST', body: JSON.stringify(body) }),
  confirmField: (id: string, key: string) => req<Snapshot>(`/api/encounters/${id}/fields/${key}/confirm`, { method: 'POST', body: '{}' }),
  uploadDocument: (id: string, name: string, text: string) => req<{ document: LabDocument; snapshot: Snapshot }>(`/api/encounters/${id}/documents`, { method: 'POST', body: JSON.stringify({ name, text }) }),
  doctors: (mode?: 'video' | 'in-person') => req<AvailableDoctor[]>(`/api/doctors${mode ? `?mode=${mode}` : ''}`),
  createProposal: (id: string, slotId: string) => req<{ proposal: Proposal; snapshot: Snapshot }>(`/api/encounters/${id}/proposals`, { method: 'POST', body: JSON.stringify({ slotId }) }),
  confirmProposal: (proposalId: string, encounterId: string) => req<{ confirmed: boolean; token: string }>(`/api/proposals/${proposalId}/confirm`, { method: 'POST', body: JSON.stringify({ encounterId }) }),
  bookProposal: (proposalId: string, encounterId: string, token: string) => req<{ booking: Booking; snapshot: Snapshot }>(`/api/proposals/${proposalId}/book`, { method: 'POST', body: JSON.stringify({ encounterId, token }) }),
  askClarification: (id: string, question: string) => req<Snapshot>(`/api/encounters/${id}/clarification`, { method: 'POST', body: JSON.stringify({ question }) }),
  answerClarification: (id: string, text: string) => req<Snapshot>(`/api/encounters/${id}/clarification/answer`, { method: 'POST', body: JSON.stringify({ text }) }),
  traces: () => req<TraceEvent[]>('/api/traces'),
  evalReport: () => req<EvalReport>('/api/eval'),
  runEval: () => req<EvalReport>('/api/eval/run', { method: 'POST', body: '{}' }),
};