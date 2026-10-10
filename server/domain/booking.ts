import { AvailableDoctor, Booking, Proposal } from '../../shared/types.ts';
import { getDb } from '../db.ts';
import { uuid, nowIso, token as makeToken } from '../lib/ids.ts';
import { trace } from '../trace.ts';
import { getEncounter } from './encounterStore.ts';
import { decideCareRoute } from '../rules/careRoute.ts';

const PROPOSAL_TTL_MS = 5 * 60 * 1000;

export interface BookingRow { id: string; encounter_id: string; slot_id: string; doctor_name: string; starts_at: string; mode: string; fee: number; created_at: string }
export interface SlotRow { id: string; doctor_id: string; starts_at: string; mode: string; doctor_name: string; fee: number; doctor_status: string; doctor_video: number }

function rowToBooking(b: BookingRow): Booking {
  return { id: b.id, encounterId: b.encounter_id, slotId: b.slot_id, doctorName: b.doctor_name, startsAt: b.starts_at, mode: b.mode, fee: b.fee, createdAt: b.created_at };
}

/**
 * Deterministic booking eligibility. Clinical routing is the application's
 * responsibility; this gate never overrides it.
 */
function bookingGate(encounterId: string): { block: string | null; route: 'video' | 'in-person' | null } {
  const enc = getEncounter(encounterId);
  if (!enc) return { block: 'Encounter not found', route: null };
  const freeText = enc.messages.filter(m => m.role === 'patient').map(m => `${m.english ?? ''} ${m.text}`);
  const decision = decideCareRoute(enc.screening, freeText, { video: true, inPerson: true });
  if (decision.route === 'emergency') return { block: 'Emergency route: booking is disabled', route: null };
  if (decision.route === 'clarification') return { block: 'Screening is incomplete; booking is unavailable', route: null };
  return { block: null, route: decision.route };
}

export interface DoctorRow { id: string; name: string; specialty: string; initials: string; languages: string; location: string; fee: number; status: string; video: number }

export function listDoctors(mode?: 'video' | 'in-person'): AvailableDoctor[] {
  const db = getDb();
  const docs = db.prepare('SELECT * FROM doctors').all() as unknown as DoctorRow[];
  const now = Date.now();
  const booked = new Set((db.prepare('SELECT slot_id FROM bookings').all() as { slot_id: string }[]).map(b => b.slot_id));
  return docs.map(d => {
    const slots = db.prepare('SELECT * FROM slots WHERE doctor_id = ? ORDER BY starts_at').all(d.id) as unknown as { id: string; starts_at: string; mode: string }[];
    const available = slots
      .filter(s => d.status === 'available' && (s.mode !== 'video' || d.video === 1))
      .filter(s => new Date(s.starts_at).getTime() > now && !booked.has(s.id))
      .filter(s => !mode || s.mode === mode)
      .slice(0, 8)
      .map(s => ({ id: s.id, doctorId: d.id, startsAt: s.starts_at, mode: s.mode as 'video' | 'in-person' }));
    return {
      id: d.id, name: d.name, specialty: d.specialty, initials: d.initials,
      languages: d.languages, location: d.location, fee: d.fee,
      status: d.status as 'available' | 'offline', video: d.video, slots: available,
    };
  });
}

/** Patient picks a real slot -> we create a proposal. This does NOT book anything. */
export function createProposal(encounterId: string, slotId: string): Proposal {
  const gate = bookingGate(encounterId);
  if (gate.block) { trace('proposal.create', 'failed', gate.block); throw httpError(409, gate.block); }
  const db = getDb();
  const slot = db.prepare('SELECT s.id, s.doctor_id, s.starts_at, s.mode, d.name AS doctor_name, d.fee, d.status AS doctor_status, d.video AS doctor_video FROM slots s JOIN doctors d ON d.id = s.doctor_id WHERE s.id = ?').get(slotId) as SlotRow | undefined;
  if (!slot) { trace('proposal.create', 'failed', 'Slot not found'); throw httpError(404, 'Slot not found'); }
  if (slot.mode !== gate.route) { trace('proposal.create', 'failed', `Route requires ${gate.route}, slot is ${slot.mode}`); throw httpError(409, `The care route requires ${gate.route}, not ${slot.mode}`); }
  if (slot.doctor_status !== 'available' || (slot.mode === 'video' && slot.doctor_video !== 1)) { trace('proposal.create', 'failed', 'Doctor not currently available'); throw httpError(409, 'That doctor is not currently available'); }
  const existing = db.prepare('SELECT id FROM bookings WHERE slot_id = ?').get(slotId);
  if (existing) { trace('proposal.create', 'failed', 'Slot already booked'); throw httpError(409, 'That slot is already booked'); }
  db.prepare('DELETE FROM proposals WHERE status = ? AND expires_at < ?').run('open', nowIso());

  const proposal: Proposal = {
    id: uuid(), slotId, doctorName: slot.doctor_name, startsAt: slot.starts_at,
    mode: slot.mode, fee: slot.fee, expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
  };
  db.prepare('INSERT INTO proposals (id, encounter_id, slot_id, token, expires_at, status) VALUES (?,?,?,?,?,?)')
    .run(proposal.id, encounterId, slotId, makeToken(), proposal.expiresAt, 'open');
  trace('proposal.create', 'completed', `Proposal for ${slot.doctor_name} at ${slot.starts_at}; nothing booked yet`);
  return proposal;
}

export function getProposalRow(id: string) {
  return getDb().prepare('SELECT * FROM proposals WHERE id = ?').get(id) as
    { id: string; encounter_id: string; slot_id: string; token: string; expires_at: string; approved_at: string | null; consumed_at: string | null; status: string } | undefined;
}

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/**
 * ATOMIC BOOKING. Runs in an IMMEDIATE transaction so concurrent attempts
 * serialize at the database. The UNIQUE constraint on bookings.slot_id is the
 * final guarantee: at most one booking can ever exist for a slot.
 */
export function bookSlot(proposalId: string, confirmationToken: string, encounterId: string): Booking {
  const db = getDb();
  const proposal = getProposalRow(proposalId);
  if (!proposal) { trace('booking.attempt', 'failed', 'Proposal not found'); throw httpError(404, 'Proposal not found'); }
  if (proposal.encounter_id !== encounterId) { trace('booking.attempt', 'failed', 'Proposal belongs to another encounter'); throw httpError(403, 'This proposal belongs to another patient'); }
  // Idempotency: a retry of a successful booking returns the existing booking.
  if (proposal.consumed_at) {
    const existing = db.prepare('SELECT * FROM bookings WHERE proposal_id = ?').get(proposalId) as BookingRow | undefined;
    if (existing && existing.encounter_id === encounterId) return rowToBooking(existing);
    trace('booking.attempt', 'failed', 'Proposal already used'); throw httpError(409, 'This proposal was already used');
  }
  if (new Date(proposal.expires_at).getTime() < Date.now()) { trace('booking.attempt', 'failed', 'Proposal expired'); throw httpError(410, 'This proposal expired. Choose the slot again.'); }
  if (proposal.approved_at !== 'patient-confirmed') { trace('booking.attempt', 'failed', 'Missing patient confirmation'); throw httpError(403, 'Booking requires explicit patient confirmation'); }
  if (!confirmationToken || confirmationToken !== proposal.token) { trace('booking.attempt', 'failed', 'Invalid confirmation token'); throw httpError(403, 'Invalid confirmation'); }
  const gate = bookingGate(encounterId);
  if (gate.block) { trace('booking.attempt', 'failed', gate.block); throw httpError(409, gate.block); }

  db.exec('BEGIN IMMEDIATE');
  try {
    const slot = db.prepare('SELECT s.id, s.doctor_id, s.starts_at, s.mode, d.name AS doctor_name, d.fee, d.status AS doctor_status, d.video AS doctor_video FROM slots s JOIN doctors d ON d.id = s.doctor_id WHERE s.id = ?').get(proposal.slot_id) as SlotRow | undefined;
    if (!slot) { db.exec('ROLLBACK'); throw httpError(404, 'Slot no longer exists'); }
    if (slot.mode !== gate.route) { db.exec('ROLLBACK'); throw httpError(409, `The care route requires ${gate.route}, not ${slot.mode}`); }
    if (slot.doctor_status !== 'available' || (slot.mode === 'video' && slot.doctor_video !== 1)) { db.exec('ROLLBACK'); throw httpError(409, 'That doctor is no longer available'); }
    const clash = db.prepare('SELECT id FROM bookings WHERE slot_id = ?').get(slot.id);
    if (clash) { db.exec('ROLLBACK'); trace('booking.attempt', 'failed', 'Slot taken by concurrent booking'); throw httpError(409, 'Sorry, that slot was just taken.'); }
    const timeClash = db.prepare('SELECT b.id FROM bookings b JOIN slots s ON s.id = b.slot_id WHERE s.doctor_id = ? AND s.starts_at = ? AND b.slot_id != ?').get(slot.doctor_id, slot.starts_at, slot.id);
    if (timeClash) { db.exec('ROLLBACK'); trace('booking.attempt', 'failed', 'Doctor already booked at this time'); throw httpError(409, 'That doctor already has an appointment at this time.'); }
    const id = uuid();
    db.prepare('INSERT INTO bookings (id, encounter_id, slot_id, proposal_id, doctor_name, starts_at, mode, fee, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, encounterId, slot.id, proposal.id, slot.doctor_name, slot.starts_at, slot.mode, slot.fee, nowIso());
    db.prepare('UPDATE proposals SET consumed_at = ?, status = ? WHERE id = ?').run(nowIso(), 'consumed', proposal.id);
    db.exec('COMMIT');
    trace('booking.confirm', 'completed', `Booked ${slot.doctor_name} ${slot.starts_at} (${slot.mode}) — one winner by UNIQUE constraint`);
    return { id, encounterId, slotId: slot.id, doctorName: slot.doctor_name, startsAt: slot.starts_at, mode: slot.mode, fee: slot.fee, createdAt: nowIso() };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/** Patient pressed "Confirm" — server marks the proposal confirmed and reveals the one-time token. */
export function approveProposal(proposalId: string, encounterId: string): string {
  const gate = bookingGate(encounterId);
  if (gate.block) throw httpError(409, gate.block);
  const db = getDb();
  const proposal = getProposalRow(proposalId);
  if (!proposal) throw httpError(404, 'Proposal not found');
  if (proposal.encounter_id !== encounterId) throw httpError(403, 'Not your proposal');
  if (proposal.consumed_at) throw httpError(409, 'Proposal already used');
  if (new Date(proposal.expires_at).getTime() < Date.now()) throw httpError(410, 'This proposal expired. Choose the slot again.');
  db.prepare('UPDATE proposals SET approved_at = ? WHERE id = ?').run('patient-confirmed', proposalId);
  trace('proposal.approve', 'completed', 'Patient explicitly confirmed; one-time confirmation token issued');
  return proposal.token;
}

export function bookingForEncounter(encounterId: string): Booking | null {
  const b = getDb().prepare('SELECT * FROM bookings WHERE encounter_id = ? ORDER BY created_at DESC LIMIT 1').get(encounterId) as
    { id: string; encounter_id: string; slot_id: string; doctor_name: string; starts_at: string; mode: string; fee: number; created_at: string } | undefined;
  return b ? { id: b.id, encounterId: b.encounter_id, slotId: b.slot_id, doctorName: b.doctor_name, startsAt: b.starts_at, mode: b.mode, fee: b.fee, createdAt: b.created_at } : null;
}
