import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { Encounter } from '../shared/types.ts';

// Point the app at an isolated temp database before importing modules.
const dir = mkdtempSync(join(tmpdir(), 'sehat-test-'));
process.env.SEHAT_DB = join(dir, 'test.db');

const { getDb } = await import('../server/db.ts');
const { createEncounter, saveEncounter } = await import('../server/domain/encounterStore.ts');
const { emptyScreening } = await import('../server/rules/redFlags.ts');
const { createProposal, approveProposal, bookSlot } = await import('../server/domain/booking.ts');

function eligibleEncounter(physicalExam: 'yes' | 'no' = 'no'): Encounter {
  const enc = createEncounter('en');
  const s = emptyScreening();
  for (const k of Object.keys(s.answers)) s.answers[k] = 'no';
  s.adult = 'yes';
  s.physicalExam = physicalExam;
  enc.screening = s;
  saveEncounter(enc);
  return enc;
}

function freshVideoSlot(): string {
  const row = getDb().prepare(
    `SELECT s.id FROM slots s JOIN doctors d ON d.id = s.doctor_id
     WHERE s.mode = 'video' AND d.status = 'available' AND d.video = 1
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.slot_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM bookings b2 JOIN slots s2 ON s2.id = b2.slot_id WHERE s2.doctor_id = s.doctor_id AND s2.starts_at = s.starts_at)
     ORDER BY s.starts_at LIMIT 1`,
  ).get() as { id: string } | undefined;
  assert.ok(row, 'expected at least one unbooked video slot');
  return row.id;
}

function propose(enc: Encounter, slotId: string) {
  const proposal = createProposal(enc.id, slotId);
  const token = approveProposal(proposal.id, enc.id);
  return { proposal, token };
}

test('booking without patient confirmation is refused', () => {
  const enc = eligibleEncounter();
  const { proposal } = propose(enc, freshVideoSlot());
  assert.throws(() => bookSlot(proposal.id, 'wrong-token', enc.id), /confirmation|Invalid|token/i);
});

test('booking with a wrong token is refused even after confirmation', () => {
  const enc = eligibleEncounter();
  const { proposal } = propose(enc, freshVideoSlot());
  assert.throws(() => bookSlot(proposal.id, 'not-the-real-token', enc.id), /Invalid confirmation/i);
});

test('a valid confirmed booking succeeds; a retry returns the same booking (idempotent)', () => {
  const enc = eligibleEncounter();
  const { proposal, token } = propose(enc, freshVideoSlot());
  const booking = bookSlot(proposal.id, token, enc.id);
  assert.ok(booking.id, 'first booking should succeed');
  const retry = bookSlot(proposal.id, token, enc.id);
  assert.equal(retry.id, booking.id, 'a retried booking must return the existing booking');
  const count = getDb().prepare('SELECT COUNT(*) AS n FROM bookings WHERE slot_id = ?').get(proposal.slotId) as { n: number };
  assert.equal(count.n, 1, 'idempotent retry must not create a second row');
});

test('proposal creation is refused when screening is unresolved', () => {
  const enc = createEncounter('en');
  assert.throws(() => createProposal(enc.id, freshVideoSlot()), /Screening is incomplete/i);
});

test('booking is refused when the care route becomes an emergency', () => {
  const enc = eligibleEncounter();
  const { proposal, token } = propose(enc, freshVideoSlot());
  const s = emptyScreening();
  for (const k of Object.keys(s.answers)) s.answers[k] = 'no';
  s.answers.breathlessSevere = 'yes';
  s.adult = 'yes'; s.physicalExam = 'no';
  enc.screening = s;
  saveEncounter(enc);
  assert.throws(() => bookSlot(proposal.id, token, enc.id), /Emergency route/i);
});

test('a doctor cannot be double-booked at the same time across modes', () => {
  const slot = getDb().prepare(`SELECT s.id, s.doctor_id, s.starts_at FROM slots s JOIN doctors d ON d.id = s.doctor_id
     WHERE s.mode = 'video' AND d.status = 'available' AND d.video = 1 ORDER BY s.starts_at LIMIT 1`).get() as { id: string; doctor_id: string; starts_at: string };
  const sibling = getDb().prepare(`SELECT s.id FROM slots s WHERE s.doctor_id = ? AND s.starts_at = ? AND s.id != ?`).get(slot.doctor_id, slot.starts_at, slot.id) as { id: string } | undefined;
  assert.ok(sibling, 'expected a sibling slot for the same doctor and time');
  const a = eligibleEncounter('no'); // video route
  const b = eligibleEncounter('yes'); // in-person route, matching the sibling slot
  const pa = propose(a, slot.id);
  const pb = propose(b, sibling.id);
  bookSlot(pa.proposal.id, pa.token, a.id);
  assert.throws(() => bookSlot(pb.proposal.id, pb.token, b.id), /already has an appointment/i);
});

test('two different patients racing for one slot: exactly one wins', () => {
  const a = eligibleEncounter();
  const b = eligibleEncounter();
  const slot = freshVideoSlot();
  const pa = propose(a, slot);
  const pb = propose(b, slot);
  const outcomes: string[] = [];
  try { bookSlot(pa.proposal.id, pa.token, a.id); outcomes.push('A'); } catch { /* may lose */ }
  try { bookSlot(pb.proposal.id, pb.token, b.id); outcomes.push('B'); } catch { /* may lose */ }
  assert.equal(outcomes.length, 1, `exactly one should win, got ${outcomes.length}`);
  const count = getDb().prepare('SELECT COUNT(*) AS n FROM bookings WHERE slot_id = ?').get(slot) as { n: number };
  assert.equal(count.n, 1);
});

test('separate OS processes racing for one slot: exactly one wins', async () => {
  const slot = freshVideoSlot();
  const dbPath = process.env.SEHAT_DB!;
  const child = join(dirname(fileURLToPath(import.meta.url)), 'helpers', 'race-child.ts');
  const run = () => new Promise<string>((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', child], {
      env: { ...process.env, SEHAT_DB: dbPath, RACE_SLOT_ID: slot },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = ''; let err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => { code === 0 ? resolve(out.trim()) : reject(new Error(`child exited ${code}: ${err}`)); });
  });
  const [x, y] = await Promise.all([run(), run()]);
  const wins = [x, y].filter(r => r === 'WIN');
  assert.equal(wins.length, 1, `exactly one process must win, results=${JSON.stringify([x, y])}`);
  const count = getDb().prepare('SELECT COUNT(*) AS n FROM bookings WHERE slot_id = ?').get(slot) as { n: number };
  assert.equal(count.n, 1);
});

test('cleanup temp database', () => {
  try { getDb().close(); } catch { /* ignore */ }
  rmSync(dir, { recursive: true, force: true });
});