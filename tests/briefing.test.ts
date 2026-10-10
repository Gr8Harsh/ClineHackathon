import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFields } from '../server/domain/briefing.ts';
import { parseAnswer } from '../server/domain/intake.ts';

const message = (id: string, text: string, english?: string) => ({ id, text, english, role: 'patient' });

test('mentioning aspirin or sugar does not establish allergy, medication or history', () => {
  const fields = extractFields([message('a', 'Does aspirin help? I ate sugar.')]);
  for (const key of ['allergies', 'medications', 'history']) assert.equal(fields.find(f => f.key === key)?.value, null);
});

test('each explicit field links to its own message, never merged unsupported evidence', () => {
  const messages = [message('a', 'dry cough for 3 days'), message('b', 'allergies: none reported'), message('c', 'medications: aspirin'), message('d', 'history: patient reports diabetes')];
  const fields = extractFields(messages);
  assert.equal(fields.find(f => f.key === 'duration')?.value, 'for 3 days');
  assert.equal(fields.find(f => f.key === 'allergies')?.sourceId, 'b');
  assert.equal(fields.find(f => f.key === 'medications')?.sourceId, 'c');
  assert.equal(fields.find(f => f.key === 'history')?.sourceId, 'd');
  for (const f of fields) assert.ok(messages.some(m => m.id === f.sourceId));
});

test('translated evidence remains attributable and unverified; original is untouched', () => {
  const msg = message('a', 'মূল বক্তব্য', 'I feel tired');
  const field = extractFields([msg])[0];
  assert.equal(field.transformation, 'translation');
  assert.equal(field.verification, 'unverified');
  assert.equal(field.sourceId, 'a');
  assert.equal(msg.text, 'মূল বক্তব্য');
});

test('exact answer parser rejects contradictory or contextual replies', () => {
  assert.equal(parseAnswer('yes but no'), null);
  assert.equal(parseAnswer('no fever but severe difficulty breathing'), null);
  assert.equal(parseAnswer('no allergies'), null);
  assert.equal(parseAnswer('हाँ'), 'yes');
  assert.equal(parseAnswer('নাই'), 'no');
  assert.equal(parseAnswer('unsure'), 'unknown');
});