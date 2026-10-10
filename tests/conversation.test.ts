import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { conversationTurn, ensureConversation, ageInMonths } from '../server/domain/conversation.ts';
import { configs } from '../server/config/conversationFields.ts';
import { validateConversationOutput } from '../server/agent/conversationValidation.ts';
import { emptyScreening } from '../server/rules/redFlags.ts';
import { decideCareRoute } from '../server/rules/careRoute.ts';
import { IntakeBriefing } from '../src/components/IntakeBriefing.tsx';
import { normalizeClineModel } from '../server/agent/runAgent.ts';
import type { Encounter, Message } from '../shared/types.ts';
import type { ConversationContext } from '../shared/conversation.ts';

function encounter(): Encounter {
  const screening = emptyScreening();
  for (const key of Object.keys(screening.answers)) screening.answers[key] = 'no';
  return { id: 'test', name: 'Synthetic', language: 'en', messages: [], fields: [], documents: [], screening, version: 1, createdAt: new Date().toISOString() };
}
function patient(enc: Encounter, text: string): Message {
  const message: Message = { id: `patient-${enc.messages.length}`, role: 'patient', text, language: enc.language, translation: 'original', createdAt: new Date().toISOString() };
  enc.messages.push(message); return message;
}
function mocked(context: ConversationContext): Promise<string> {
  const area = /rash/i.test(context.conversation[0].text) ? 'rash' : /stomach/i.test(context.conversation[0].text) ? 'stomach' : /fever/i.test(context.conversation[0].text) ? 'fever' : /cough/i.test(context.conversation[0].text) ? 'cough' : 'headache';
  const extracted = context.nextField && !context.FIELDS_DONE.some(f => f.id === context.nextField)
    ? [{ field: context.nextField, value: context.latestMessage, quote: context.latestMessage }] : [];
  const next = context.FIELDS_NEEDED.find(f => f.required && !extracted.some(e => e.field === f.id));
  const config = configs(area).find(f => f.id === next?.id);
  return Promise.resolve(JSON.stringify({ reply: config?.question ?? 'Your consultation notes are ready.', extracted, quick_replies: config?.quick_replies ?? [] }));
}
for (const symptom of ['headache', 'stomach pain', 'fever', 'cough', 'rash']) test(`${symptom}: mocked JSON conversation completes without asking any field twice`, async () => {
  const enc = encounter();
  let reply = await conversationTurn(enc, patient(enc, `I have ${symptom}`), mocked); enc.messages.push(reply);
  const asked = new Set<string>();
  while (enc.conversation!.pendingField) {
    const key = enc.conversation!.pendingField;
    assert.ok(!asked.has(key), `Repeated ${key}`); asked.add(key);
    const value = key === 'duration' ? "I don't know" : key === 'location' ? 'Forehead' : 'Patient example answer';
    reply = await conversationTurn(enc, patient(enc, value), mocked); enc.messages.push(reply);
    assert.equal(reply.replyOrigin, 'cline');
  }
  assert.equal(enc.conversation!.intakeComplete, true);
  assert.equal(enc.conversation!.fields.find(f => f.id === 'duration')!.status, 'unknown');
  assert.equal(decideCareRoute(enc.screening, enc.messages.filter(m => m.role === 'patient').map(m => m.text), { video: true, inPerson: true }).route, 'in-person');
});
test('unsupported quote and unsupported normalized value never become patient facts', () => {
  const enc = encounter(); patient(enc, 'I have a headache'); const state = ensureConversation(enc);
  const result = validateConversationOutput(JSON.stringify({ reply: 'How long has it been going on?', extracted: [{ field: 'duration', value: '3 days', quote: '3 days' }, { field: 'allergies', value: 'allergic', quote: 'headache' }], quick_replies: [] }), 'I have a headache', state.fields, configs(state.area));
  assert.equal(result.output.extracted.length, 0); assert.equal(result.rejectedExtractions, 2);
});
for (const invalid of ['word '.repeat(31) + '?', '😊 How long has it been going on?', '**How long has it been going on?**', 'Do you need a doctor?', 'Would a doctor need to examine you?', "I'm sorry to hear that. How long has it been going on?"]) test(`invalid reply regenerates once: ${invalid.slice(0, 35)}`, async () => {
  const enc = encounter(); let calls = 0;
  const reply = await conversationTurn(enc, patient(enc, 'I have a headache'), async context => {
    calls++; return calls === 1 ? JSON.stringify({ reply: invalid, extracted: [], quick_replies: [] }) : mocked(context);
  });
  assert.equal(calls, 2); assert.equal(reply.replyOrigin, 'cline'); assert.equal(reply.text, 'How long has it been going on?');
});
test('repeated answered-field question regenerates once and preserves provenance', async () => {
  const enc = encounter(); enc.messages.push(await conversationTurn(enc, patient(enc, 'headache'), mocked));
  let calls = 0;
  const reply = await conversationTurn(enc, patient(enc, '3 days'), async context => {
    calls++; return calls === 1 ? JSON.stringify({ reply: 'How long has it been going on?', extracted: [{ field: 'duration', value: '3 days', quote: '3 days' }], quick_replies: [] }) : mocked(context);
  });
  assert.equal(calls, 2); assert.equal(reply.replyOrigin, 'cline');
  assert.equal(enc.conversation!.fields.find(f => f.id === 'duration')!.quote, '3 days');
});
test('emergency bypass calls no model even on first message', async () => {
  const enc = encounter(); let calls = 0;
  const reply = await conversationTurn(enc, patient(enc, 'I cannot breathe'), async () => { calls++; return '{}'; });
  assert.equal(calls, 0); assert.equal(reply.replyOrigin, 'safety');
});
test('optional age records a minor briefing or declined age without blocking intake', async () => {
  const enc = encounter(); enc.messages.push(await conversationTurn(enc, patient(enc, 'headache'), mocked));
  await conversationTurn(enc, patient(enc, 'age: 12'), mocked);
  assert.equal(ageInMonths(enc), 144);
  assert.match(renderToStaticMarkup(createElement(IntakeBriefing, { encounter: enc })), /Patient is a minor, guardian should attend/);
  await conversationTurn(enc, patient(enc, 'age: prefer not to say'), mocked);
  assert.equal(ageInMonths(enc), null);
  assert.equal(enc.conversation!.fields.find(f => f.id === 'age')!.status, 'declined');
});
test('two invalid JSON responses end in explicit fixture fallback', async () => {
  const enc = encounter(); let calls = 0;
  const reply = await conversationTurn(enc, patient(enc, 'headache'), async () => { calls++; return 'not json'; });
  assert.equal(calls, 2); assert.equal(reply.replyOrigin, 'fixture'); assert.equal(reply.fallbackReason, 'invalid_model_output');
});
test('optional infant age retains fever emergency rule and bypasses the model', async () => {
  const enc = encounter(); enc.messages.push(await conversationTurn(enc, patient(enc, 'fever'), mocked));
  let calls = 0;
  const reply = await conversationTurn(enc, patient(enc, 'age: 2 months'), async () => { calls++; return '{}'; });
  assert.equal(calls, 0); assert.equal(reply.replyOrigin, 'safety');
  assert.equal(enc.screening.selfCareAlert?.question, 'Fever in a baby under 3 months');
});
test('known local model spelling normalizes without changing other model IDs', () => {
  assert.equal(normalizeClineModel('anthropic/claude-sonnet-4-6'), 'anthropic/claude-sonnet-4.6');
  assert.equal(normalizeClineModel('another/model'), 'another/model');
});