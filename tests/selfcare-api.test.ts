import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

test('HTTP self-care scopes questions, prevents review bypass and blocks emergency booking without saving advice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sehat-selfcare-'));
  process.env.SEHAT_DB = join(dir, 'test.db'); process.env.SEHAT_TEST = '1'; delete process.env.CLINE_API_KEY;
  const { app } = await import('../server/index.ts');
  const { getDb } = await import('../server/db.ts');
  const { createEncounter, saveEncounter, getEncounter } = await import('../server/domain/encounterStore.ts');
  const { RED_FLAG_RULES } = await import('../server/rules/redFlags.ts');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function post(path: string, body: unknown) {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
  try {
    const enc = createEncounter('en');
    enc.messages.push({ id: 'source-fever', role: 'patient', language: 'en', text: 'fever', translation: 'original', createdAt: new Date().toISOString() });
    for (const rule of RED_FLAG_RULES) enc.screening.answers[rule.screeningKey!] = 'no';
    enc.screening.adult = 'yes'; enc.screening.physicalExam = 'no'; saveEncounter(enc);
    const path = `/api/encounters/${enc.id}/selfcare`;
    const before = JSON.stringify(getEncounter(enc.id));
    assert.equal((await post('/api/encounters/absent/selfcare', {})).status, 404);
    assert.equal((await post(path, { reviewed: true })).status, 400);
    assert.equal((await post(path, { questionId: 'risk.age' })).status, 400);
    assert.equal((await post(path, { questionId: 'risk.pregnant', answer: 'no' })).status, 409);
    let result = (await post(path, { reset: true })).body.selfcare;
    assert.equal(result.nextQuestion.id, 'risk.age');
    for (let turn = 0; turn < 40 && result.status === 'question'; turn++) {
      const q = result.nextQuestion;
      const answer = q.id === 'risk.age' || q.id === 'topic.age' ? '360' : q.kind === 'number' ? '1' : q.kind === 'yesno' ? 'no' : 'Synthetic reply';
      const response = await post(path, { questionId: q.id, answer });
      assert.equal(response.status, 200); result = response.body.selfcare;
    }
    assert.equal(result.status, 'review_required'); assert.equal(result.guidance, undefined);
    assert.equal(JSON.stringify(getEncounter(enc.id)), before);
    await post(path, { reset: true });
    await post(path, { questionId: 'risk.age', answer: '360' });
    await post(path, { questionId: 'risk.pregnant', answer: 'no' });
    await post(path, { questionId: 'risk.chronic', answer: 'no' });
    const emergency = await post(path, { questionId: 'safety.breath', answer: 'yes' });
    assert.equal(emergency.body.selfcare.status, 'emergency');
    assert.equal(emergency.body.snapshot.decision.route, 'emergency');
    assert.equal(emergency.body.snapshot.encounter.messages.length, enc.messages.length);
    assert.equal(emergency.body.snapshot.encounter.screening.selfCareAlert.patientText, 'yes');
    assert.equal((await post(path, { reset: true })).body.selfcare.status, 'emergency');
    const doctors = await fetch(base + '/api/doctors?mode=video').then(r => r.json());
    const slotId = doctors.flatMap((d: { slots: { id: string }[] }) => d.slots)[0].id;
    const proposal = await post(`/api/encounters/${enc.id}/proposals`, { slotId });
    assert.equal(proposal.status, 409); assert.match(proposal.body.error, /emergency/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    getDb().close(); rmSync(dir, { recursive: true, force: true });
  }
});