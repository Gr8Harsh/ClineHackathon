import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { Language, Snapshot } from '../shared/types.ts';

const base = process.env.SEHAT_REVIEW_URL ?? 'http://127.0.0.1:3001';
const managed = process.env.SEHAT_REVIEW_START_SERVER === '1' ? spawn(process.execPath, ['--import', 'tsx', '--env-file-if-exists=.env', 'server/index.ts'], { env: { ...process.env, PORT: new URL(base).port || '3001' }, stdio: 'ignore' }) : null;
if (managed) {
  process.on('exit', () => managed.kill());
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* Wait only for startup. */ }
    await new Promise(r => setTimeout(r, 100));
  }
}
const output = resolve('test-results', 'transcripts'); mkdirSync(output, { recursive: true });
const personas: { name: string; language: Language; messages: string[] }[] = [
  { name: 'terse-headache', language: 'en', messages: ['headache', '3 days', 'Forehead', 'comes and goes'] },
  { name: 'rambling-headache', language: 'en', messages: ['I have a headache for 3 days, mostly my forehead, worse in the evening. This is a fictional demo.', 'comes and goes', 'I do not know'] },
  { name: 'stomach', language: 'en', messages: ['my stomach hurts', 'since yesterday', 'lower belly', 'constant'] },
  { name: 'fever', language: 'en', messages: ['I have a fever', 'one day', 'not measured', 'no other symptoms reported'] },
  { name: 'cough', language: 'en', messages: ['I have a cough', '2 days', 'Dry', 'no other symptoms reported'] },
  { name: 'rash', language: 'en', messages: ['rash on my arm since yesterday', 'stayed the same', 'Itchy', 'I do not know'] },
  { name: 'unknown-answers', language: 'en', messages: ['headache', "I don't know", 'All over', "I don't know"] },
  { name: 'hindi', language: 'hi', messages: ['मुझे सिरदर्द है', 'तीन दिन से', 'माथे पर', 'शाम को ज्यादा होता है'] },
  { name: 'assamese', language: 'as', messages: ['মোৰ মূৰ বিষাইছে', 'তিনি দিনৰ পৰা', 'কপালত', 'সন্ধিয়া বেছি হয়'] },
  { name: 'minor-optional-age', language: 'en', messages: ['headache', 'age: 12', '3 days', 'All over', 'comes and goes'] },
];
async function request(path: string, body?: unknown) {
  const response = await fetch(base + '/api' + path, { signal: AbortSignal.timeout(95000), ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
const health = await request('/health');
if (health.agentMode !== 'cline-sdk') throw new Error('Cline is not configured. Refusing to label fixture transcripts as live review.');
const summaries = [];
for (const persona of personas) {
  const transcript: { patient: string; reply?: string; origin?: string; fallbackReason?: string; elapsedMs: number; fields?: unknown; readiness?: unknown; error?: string }[] = [];
  let snapshot: Snapshot;
  try { snapshot = await request('/encounters', { language: persona.language }); }
  catch (error) { summaries.push({ persona: persona.name, liveTurns: 0, totalTurns: 0, allLive: false, error: (error as Error).message }); continue; }
  for (const text of persona.messages) {
    const started = Date.now();
    try {
      const result = await request(`/encounters/${snapshot.encounter.id}/messages`, { text, workflow: 'conversation', clientMessageId: randomUUID() });
      snapshot = result.snapshot;
      transcript.push({ patient: text, reply: result.message.text, origin: result.message.replyOrigin, fallbackReason: result.message.fallbackReason, elapsedMs: Date.now() - started, fields: snapshot.encounter.conversation?.fields, readiness: { intakeComplete: snapshot.encounter.conversation?.intakeComplete, bookingReady: snapshot.encounter.conversation?.bookingReady } });
      if (snapshot.decision.route === 'emergency') break;
    } catch (error) { transcript.push({ patient: text, elapsedMs: Date.now() - started, error: (error as Error).message }); break; }
  }
  let traces = [];
  try { traces = (await request('/traces')).filter((t: { detail: string }) => t.detail.includes(snapshot.encounter.id.slice(0, 8))); } catch { /* Keep collected real turns even if trace retrieval is unavailable. */ }
  const report = { persona, encounterId: snapshot.encounter.id, generatedAt: new Date().toISOString(), transcript, traces };
  writeFileSync(resolve(output, `${persona.name}.json`), JSON.stringify(report, null, 2));
  writeFileSync(resolve(output, `${persona.name}.txt`), transcript.map(t => `Patient: ${t.patient}\nAssistant [${t.origin ?? 'error'}${t.fallbackReason ? `: ${t.fallbackReason}` : ''}]: ${t.reply ?? t.error}\nElapsed: ${t.elapsedMs}ms\n`).join('\n'));
  const liveTurns = transcript.filter(t => t.origin === 'cline').length;
  summaries.push({ persona: persona.name, liveTurns, totalTurns: transcript.length, allLive: liveTurns === transcript.length });
  console.log(persona.name, `${liveTurns}/${transcript.length} live turns`);
}
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summaries, null, 2));
console.log(`Transcripts saved to ${output}. Synthetic only; not clinician or language validation.`);
managed?.kill();