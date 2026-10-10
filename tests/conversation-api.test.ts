import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Snapshot } from '../shared/types.ts';

test('HTTP conversation queues, deduplicates retries, sources unknowns and gates booking', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sehat-conversation-'));
  process.env.SEHAT_DB = join(dir, 'test.db'); process.env.SEHAT_TEST = '1'; delete process.env.CLINE_API_KEY;
  const { app } = await import('../server/index.ts'); const { getDb } = await import('../server/db.ts');
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function post(path: string, body: unknown) { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; }
  try {
    const created = (await post('/api/encounters', { language: 'en' })).data as Snapshot;
    const path = `/api/encounters/${created.encounter.id}`;
    const send = (text: string, clientMessageId: string) => post(path + '/messages', { text, clientMessageId, workflow: 'conversation' });
    await send('headache', 'first');
    const [a, b] = await Promise.all([send("I don't know", 'second'), send('Forehead', 'third')]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const retry = await send('Forehead', 'third');
    assert.equal(retry.data.snapshot.encounter.messages.filter((m: { clientMessageId?: string }) => m.clientMessageId === 'third').length, 1);
    assert.equal(retry.data.snapshot.encounter.conversation.fields.find((f: { id: string }) => f.id === 'duration').status, 'unknown');
    const ready = (await send('comes and goes', 'fourth')).data.snapshot as Snapshot;
    assert.equal(ready.encounter.conversation!.intakeComplete, true); assert.equal(ready.encounter.conversation!.bookingReady, false);
    const { RED_FLAG_RULES } = await import('../server/rules/redFlags.ts');
    let routed = ready;
    for (const rule of RED_FLAG_RULES) routed = (await post(path + '/screening', { key: rule.screeningKey, answer: 'no' })).data;
    assert.equal(routed.encounter.conversation!.bookingReady, true);
    assert.equal(routed.decision.route, 'in-person');
    assert.equal((await send('different text', 'third')).status, 409);
    const emergency = (await send('I cannot breathe', 'urgent')).data;
    assert.equal(emergency.message.replyOrigin, 'safety'); assert.equal(emergency.snapshot.decision.route, 'emergency');
  } finally { await new Promise<void>(r => server.close(() => r())); getDb().close(); rmSync(dir, { recursive: true, force: true }); }
});