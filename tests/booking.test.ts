import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the app at an isolated temp database before importing modules.
const dir = mkdtempSync(join(tmpdir(), 'sehat-test-'));
process.env.SEHAT_DB = join(dir, 'test.db');

const { getDb } = await import('../server/db.ts');
const { createEncounter } = await import('../server/domain/encounterStore.ts');
const { createProposal, approveProposal, bookSlot } = await import('../server/domain/booking.ts');

function firstSlotId(): string {
  const row = getDb().prepare('SELECT id FROM slots ORDER BY starts_at LIMIT 1').get() as { id: string };
  return row.id;
}

/** A slot with no booking and no proposal, so a fresh race can be set up. */
function freshSlotId(): string {
  const row = getDb().prepare(
    `SELECT s.id FROM slots s
     WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.slot_id = s.id)
     ORDER BY s.starts_at LIMIT 1`,
  ).get() as { id: string } | undefined;
  assert.ok(row, 'expected at least one unbooked slot in the seeded database');
  return row.id;
}

test('booking without patient confirmation is refused', () => {
  const enc = createEncounter('en');
  const slot = firstSlotId();
  const proposal = createProposal(enc.id, slot);
  assert.throws(
    () => bookSlot(proposal.id, 'wrong-token', enc.id),
    /confirmation|Invalid|token/i,
    'booking must require a valid patient confirmation token',
  );
});

test('booking with a wrong token is refused even after confirmation', () => {
  const enc = createEncounter('en');
  const slot = firstSlotId();
  const proposal = createProposal(enc.id, slot);
  approveProposal(proposal.id, enc.id);
  assert.throws(() => bookSlot(proposal.id, 'not-the-real-token', enc.id), /Invalid confirmation/i);
});

test('a valid confirmed booking succeeds exactly once; second attempt is rejected', () => {
  const enc = createEncounter('en');
  const slot = firstSlotId();
  const proposal = createProposal(enc.id, slot);
  const token = approveProposal(proposal.id, enc.id);
  const booking = bookSlot(proposal.id, token, enc.id);
  assert.ok(booking.id, 'first booking should succeed');
  // Same proposal cannot be reused.
  assert.throws(() => bookSlot(proposal.id, token, enc.id), /already used/i);
});

test('two different patients racing for one slot: exactly one wins', () => {
  const a = createEncounter('en', 'Patient A');
  const b = createEncounter('en', 'Patient B');
  const slot = freshSlotId();
  const propA = createProposal(a.id, slot);
  const propB = createProposal(b.id, slot);
  const tokA = approveProposal(propA.id, a.id);
  const tokB = approveProposal(propB.id, b.id);

  const outcomes: string[] = [];
  // Interleave the two attempts. The UNIQUE constraint on bookings.slot_id
  // guarantees at most one INSERT can ever succeed, regardless of order.
  try {
    bookSlot(propA.id, tokA, a.id);
    outcomes.push('A');
  } catch { /* A may lose */ }
  try {
    bookSlot(propB.id, tokB, b.id);
    outcomes.push('B');
  } catch { /* B may lose */ }

  assert.equal(outcomes.length, 1, `exactly one booking should succeed, got ${outcomes.length} (${outcomes.join(',')})`);

  // Database-level check: only one booking row exists for this slot.
  const count = getDb().prepare('SELECT COUNT(*) AS n FROM bookings WHERE slot_id = ?').get(slot) as { n: number };
  assert.equal(count.n, 1, 'exactly one booking row must exist for the slot');
});

test('concurrent transactions on one slot serialize to a single winner', async () => {
  const a = createEncounter('en', 'Race A');
  const b = createEncounter('en', 'Race B');
  const slot = freshSlotId();
  const propA = createProposal(a.id, slot);
  const propB = createProposal(b.id, slot);
  const tokA = approveProposal(propA.id, a.id);
  const tokB = approveProposal(propB.id, b.id);

  const attempt = async (pid: string, tok: string, eid: string) => {
    // Yield so both attempts are genuinely in flight before either resolves.
    await new Promise(r => setImmediate(r));
    try { bookSlot(pid, tok, eid); return 'win'; } catch { return 'lose'; }
  };

  const results = await Promise.all([attempt(propA.id, tokA, a.id), attempt(propB.id, tokB, b.id)]);
  assert.equal(results.filter(r => r === 'win').length, 1, `exactly one should win, results=${results.join(',')}`);
});

test('cleanup temp database', () => {
  try { getDb().close(); } catch { /* ignore */ }
  rmSync(dir, { recursive: true, force: true });
});