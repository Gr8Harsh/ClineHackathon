import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Snapshot, TraceEvent } from '../shared/types.ts';

// One isolated database for this file; both tests share the server modules.
const dir = mkdtempSync(join(tmpdir(), 'sehat-loop-'));
process.env.SEHAT_DB = join(dir, 'loop.db');
process.env.SEHAT_TEST = '1';
delete process.env.CLINE_API_KEY;
after(async () => {
  const { getDb } = await import('../server/db.ts');
  getDb().close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

/**
 * The demo loop, end to end over real HTTP in guided mode (no API key):
 * assisted Assamese intake → "not asked" gap → video route → gate refuses an
 * unconfirmed booking → confirmed atomic booking → doctor asks about the gap →
 * patient answers in Assamese → field becomes patient-reported with original + English.
 */
test('demo loop: assisted Assamese intake to doctor question that fills a missing field', { timeout: 30000 }, async () => {
  const { app } = await import('../server/index.ts');
  const { RED_FLAG_RULES } = await import('../server/rules/redFlags.ts');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    // Assisted mode: an ASHA worker enters the patient's words.
    assert.equal((await request('/api/encounters', { language: 'as', assistedBy: { name: '', role: 'asha' } })).status, 400);
    const created = (await request('/api/encounters', { language: 'as', assistedBy: { name: 'Synthetic ASHA worker', role: 'asha' } })).body as Snapshot;
    assert.equal(created.encounter.assistedBy?.role, 'asha');
    const id = created.encounter.id;
    const path = `/api/encounters/${id}`;

    // 1. Assamese intake, recorded with a labelled (fixture) English rendering.
    const intake = (await request(path + '/messages', { text: 'মোৰ চাৰি দিনৰ পৰা মূৰ বিষাইছে' })).body.snapshot as Snapshot;
    const msg = intake.encounter.messages.find(m => m.role === 'patient')!;
    assert.equal(msg.enteredBy, 'health-worker');
    assert.equal(msg.english, 'I have had a headache for 4 days');
    assert.equal(msg.translation, 'fixture');
    const concern = intake.encounter.fields.find(f => f.key === 'concern')!;
    assert.equal(concern.transformation, 'translation');
    assert.equal(concern.sourceId, msg.id);
    assert.equal(intake.encounter.fields.find(f => f.key === 'duration')?.value, 'for 4 days');
    // Medications were never asked: missing, and distinguishable from "asked but unanswered".
    assert.equal(intake.encounter.fields.find(f => f.key === 'medications')?.value, null);
    assert.ok(!intake.encounter.askedFields?.includes('medications'));

    // 2. Structured screening → video route that says travel may not be needed.
    for (const rule of RED_FLAG_RULES) await request(path + '/screening', { key: rule.screeningKey, answer: 'no' });
    const routed = (await request(path + '/screening', { adult: 'yes', physicalExam: 'no' })).body as Snapshot;
    assert.equal(routed.decision.route, 'video');
    assert.match(routed.decision.explanation, /may not need a long journey/);

    // 3. A proposal appears in the snapshot (as the agent's propose_slot would create it).
    const doctors = (await request('/api/doctors?mode=video')).body as { slots: { id: string }[] }[];
    const slotId = doctors.flatMap(d => d.slots)[0].id;
    const { proposal } = (await request(path + '/proposals', { slotId })).body;
    assert.equal(((await request(path)).body as Snapshot).proposal?.id, proposal.id);

    // 4. Gate probe: booking without patient confirmation is refused, and the refusal is traced.
    const probe = (await request(path + '/gate-probe', { mode: 'direct' })).body;
    assert.equal(probe.via, 'direct-tool-call');
    assert.equal(probe.booking, null);
    assert.match(probe.outcome, /not confirmed/);
    const traces = (await request('/api/traces')).body as TraceEvent[];
    assert.ok(traces.some(t => t.name === 'tool.book_slot' && t.status === 'failed' && /no token/.test(t.detail)));

    // 5. Explicit patient confirmation → atomic booking.
    const { token } = (await request(`/api/proposals/${proposal.id}/confirm`, { encounterId: id })).body;
    const booked = (await request(`/api/proposals/${proposal.id}/book`, { encounterId: id, token })).body.snapshot as Snapshot;
    assert.ok(booked.booking);
    assert.equal(booked.proposal, null);

    // 6. Doctor: template draft without an API key, then one question linked to the missing field.
    const draft = (await request(path + '/clarification/draft', {})).body;
    assert.equal(draft.draftedBy, 'template');
    assert.equal(draft.fieldKey, 'medications');
    assert.equal((await request(path + '/clarification', { question: 'Any allergies?', fieldKey: 'concern' })).status, 409);
    const asked = (await request(path + '/clarification', { question: 'Any blood thinners?', fieldKey: 'medications' })).body as Snapshot;
    assert.equal(asked.encounter.clarification?.questionForPatient?.status, 'fixture');
    assert.match(asked.encounter.clarification!.questionForPatient!.text, /তেজ পাতল/);

    // 7. Patient answers in Assamese → the gap becomes patient-reported, sourced to that exact answer.
    const answered = (await request(path + '/clarification/answer', { text: 'হয়, মই প্ৰতিদিনে এছপিৰিন খাওঁ' })).body as Snapshot;
    const answer = answered.encounter.clarification!.answer!;
    const meds = answered.encounter.fields.find(f => f.key === 'medications')!;
    assert.equal(meds.value, 'Yes, I take aspirin every day');
    assert.equal(meds.sourceId, answer.id);
    assert.equal(meds.transformation, 'translation');
    assert.equal(meds.verification, 'unverified');
    assert.equal(answer.text, 'হয়, মই প্ৰতিদিনে এছপিৰিন খাওঁ');
    assert.equal(answer.enteredBy, 'health-worker');

    const list = (await request('/api/encounters')).body as { id: string; booked: boolean; assistedBy: unknown }[];
    assert.ok(list.find(e => e.id === id)?.booked);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('an answer captured from a guided question is not erased by later messages', { timeout: 30000 }, async () => {
  const { app } = await import('../server/index.ts');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  try {
    const id = ((await post('/api/encounters', { language: 'en' })) as Snapshot).encounter.id;
    const path = `/api/encounters/${id}/messages`;
    await post(path, { text: 'Dry cough' });
    const afterDuration = (await post(path, { text: 'about a week' })).snapshot as Snapshot;
    assert.equal(afterDuration.encounter.fields.find(f => f.key === 'duration')?.value, 'about a week');
    assert.ok(afterDuration.encounter.askedFields?.includes('history'));
    const later = (await post(path, { text: 'no known conditions' })).snapshot as Snapshot;
    assert.equal(later.encounter.fields.find(f => f.key === 'duration')?.value, 'about a week');
    assert.equal(later.encounter.fields.find(f => f.key === 'history')?.value, 'no known conditions');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
