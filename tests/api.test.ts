import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Snapshot } from '../shared/types.ts';

test('real HTTP intake, provenance, screening, documents and clarification round trip', { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sehat-api-'));
  process.env.SEHAT_DB = join(dir, 'api.db');
  process.env.SEHAT_TEST = '1';
  delete process.env.CLINE_API_KEY;
  const { app } = await import('../server/index.ts');
  const { getDb } = await import('../server/db.ts');
  const { RED_FLAG_RULES } = await import('../server/rules/redFlags.ts');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request('/api/health')).body.agentMode, 'guided');
    assert.equal((await request('/api/encounters', { language: 'invalid' })).status, 400);
    assert.equal((await request('/api/encounters', null)).status, 400);
    assert.equal((await request('/api/encounters/absent')).status, 404);
    assert.equal((await request('/api/unknown')).status, 404);
    const created = (await request('/api/encounters', { language: 'en' })).body as Snapshot;
    const id = created.encounter.id;
    const path = `/api/encounters/${id}`;
    assert.equal(created.decision.route, 'clarification');
    assert.equal((await request(path + '/fields/allergies/confirm', {})).status, 400);
    assert.equal((await request(path + '/messages', { text: 22 })).status, 400);
    const intake = (await request(path + '/messages', { text: 'Dry cough for 3 days' })).body.snapshot as Snapshot;
    assert.equal(intake.encounter.fields[0].value, 'Dry cough for 3 days');
    assert.ok(intake.encounter.messages.some(m => m.id === intake.encounter.fields[0].sourceId));
    assert.equal(intake.decision.route, 'clarification');
    for (const body of [{ key: '__proto__', answer: 'no' }, { key: 'chestPressure' }, { adult: 'maybe' }, { physicalExam: 1 }]) {
      assert.equal((await request(path + '/screening', body)).status, 400);
    }
    for (const rule of RED_FLAG_RULES) {
      assert.equal((await request(path + '/screening', { key: rule.screeningKey, answer: 'no' })).status, 200);
    }
    const routed = (await request(path + '/screening', { adult: 'yes', physicalExam: 'no' })).body as Snapshot;
    assert.equal(routed.decision.route, 'video');
    assert.equal(routed.encounter.screening.completed, true);
    const document = (await request(path + '/documents', { name: 'synthetic.txt', text: '\nHeader\nHaemoglobin: 13.2 g/dL\n' })).body.document;
    assert.equal(document.observations[0].line, 3);
    assert.equal(document.text, '\nHeader\nHaemoglobin: 13.2 g/dL\n');
    assert.equal(document.observations[0].verification, 'unverified');
    assert.equal((await request(path + '/clarification', { question: 'Any blood thinners?' })).status, 200);
    const clarified = (await request(path + '/clarification/answer', { text: 'I am not sure' })).body as Snapshot;
    assert.equal(clarified.encounter.clarification?.answer?.text, 'I am not sure');
    assert.equal((await request(path + '/clarification', { question: 'Another?' })).status, 409);
    const urgent = (await request(path + '/messages', { text: 'No fever but I cannot breathe' })).body;
    assert.equal(urgent.snapshot.decision.route, 'emergency');
    assert.match(urgent.message.text, /emergency/i);
    assert.equal(urgent.snapshot.encounter.screening.answers.breathlessSevere, 'no');
    const doctors = (await request('/api/doctors?mode=video')).body;
    assert.ok(doctors.every((d: { status: string; video: number; slots: unknown[] }) => d.slots.length === 0 || (d.status === 'available' && d.video === 1)));
    assert.equal((await request('/api/doctors?mode=invalid')).status, 400);

    // Booking bypass attempt: a fresh unresolved encounter cannot create a proposal.
    const unresolved = (await request('/api/encounters', { language: 'en' })).body as Snapshot;
    const videoDoctors = (await request('/api/doctors?mode=video')).body as { id: string; slots: { id: string }[] }[];
    const openSlot = videoDoctors.flatMap(d => d.slots).find(Boolean)?.id;
    assert.ok(openSlot, 'expected an open video slot for the bypass test');
    const bypass = await request(`/api/encounters/${unresolved.encounter.id}/proposals`, { slotId: openSlot });
    assert.equal(bypass.status, 409);
    assert.match(bypass.body.error, /Screening is incomplete/i);
    const root = await fetch(base + '/');
    if (root.ok) assert.match(await root.text(), /<div id="root">/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  }
});