import { Language, Message } from '../../shared/types.ts';
import { getEncounter, saveEncounter } from '../domain/encounterStore.ts';
import { trace } from '../trace.ts';
import { uuid, nowIso } from '../lib/ids.ts';

/** Per-encounter one-time confirmation token, set only by the server after the patient confirms. */
const confirmationTokens = new Map<string, string>();
export function setConfirmationToken(encounterId: string, tok: string | null) {
  if (tok) confirmationTokens.set(encounterId, tok); else confirmationTokens.delete(encounterId);
}
export function hasConfirmationToken(encounterId: string): boolean {
  return confirmationTokens.has(encounterId);
}

const LANG_NAME: Record<Language, string> = { en: 'English', hi: 'Hindi', as: 'Assamese' };

export function isAgentConfigured(): boolean {
  return Boolean(process.env.CLINE_API_KEY);
}

/**
 * Runs the in-product agent on the real Cline SDK Agent runtime.
 * Streams tool-started / tool-finished events into the app trace store so the
 * UI shows genuine SDK tool use — not fabricated events.
 */
export async function runAgentTurn(encounterId: string, userText: string, language: Language): Promise<Message> {
  const [{ Agent }, { buildTools, AGENT_SYSTEM_PROMPT }] = await Promise.all([import('@cline/sdk'), import('./tools.ts')]);
  const encounter = getEncounter(encounterId);
  if (!encounter) throw new Error('encounter not found');

  const tools = buildTools(encounterId, () => confirmationTokens.get(encounterId) ?? null);

  const agent = new Agent({
    providerId: 'cline',
    modelId: process.env.CLINE_MODEL ?? 'anthropic/claude-sonnet-4.6',
    apiKey: process.env.CLINE_API_KEY,
    systemPrompt: AGENT_SYSTEM_PROMPT + `\nPatient language: ${LANG_NAME[language]}.`,
    tools,
    maxIterations: 8,
  });
  const unsubscribe = agent.subscribe(event => {
      if (event.type === 'tool-started') {
        trace(`sdk.${event.toolCall.toolName}`, 'started', `model called ${event.toolCall.toolName}`, 'cline-sdk');
      } else if (event.type === 'tool-finished') {
        trace(`sdk.${event.toolCall.toolName}`, 'completed', `${event.toolCall.toolName} finished`, 'cline-sdk');
      }
  });

  // Give the model the structured context it is allowed to see.
  const context = [
    `Current structured summary (null = not yet asked, never treat as "no"):`,
    JSON.stringify(encounter.fields),
    `Screening answers:`, JSON.stringify(encounter.screening.answers),
    `Purpose: ${encounter.screening.purpose}; physicalExam: ${encounter.screening.physicalExam}`,
    `Documents already uploaded: ${encounter.documents.length}`,
    `Patient just said (${LANG_NAME[language]}): """${userText.slice(0, 4000)}"""`,
    `Ask ONE follow-up question, or if you have enough, tell the patient clearly what is still missing and that they can review and confirm a slot.`,
  ].join('\n');

  const timer = setTimeout(() => agent.abort('Time limit'), 30000);
  let result;
  try { result = await agent.run(context); }
  finally { clearTimeout(timer); unsubscribe(); }
  if (result.error || result.status !== 'completed') throw new Error('Language service unavailable. Your original message was saved.');

  const reply = result.outputText?.trim() || 'I could not process that. Please try again.';
  const message: Message = {
    id: uuid(), role: 'assistant', text: reply, language,
    translation: 'original', createdAt: nowIso(),
  };
  const current = getEncounter(encounterId)!;
  current.messages.push(message);
  saveEncounter(current);
  trace('agent.turn', result.status === 'completed' ? 'completed' : 'failed', `Cline SDK agent turn ${result.status}`, 'cline-sdk');
  return message;
}