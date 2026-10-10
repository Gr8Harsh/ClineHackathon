import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uuid, nowIso } from './lib/ids.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let db: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.SEHAT_DB ?? join(root, 'data', 'sehat.db');
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, specialty TEXT NOT NULL, initials TEXT NOT NULL,
      languages TEXT NOT NULL, location TEXT NOT NULL, fee INTEGER NOT NULL,
      status TEXT NOT NULL, video INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL, starts_at TEXT NOT NULL, mode TEXT NOT NULL,
      UNIQUE(doctor_id, starts_at, mode)
    );
    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL, slot_id TEXT NOT NULL,
      token TEXT, expires_at TEXT, approved_at TEXT, consumed_at TEXT, status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL, slot_id TEXT NOT NULL UNIQUE,
      proposal_id TEXT NOT NULL UNIQUE, doctor_name TEXT NOT NULL, starts_at TEXT NOT NULL,
      mode TEXT NOT NULL, fee INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, name TEXT NOT NULL,
      status TEXT NOT NULL, detail TEXT NOT NULL, origin TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evaluations (
      generated_at TEXT NOT NULL, rule_version TEXT NOT NULL, passed INTEGER NOT NULL,
      total INTEGER NOT NULL, results TEXT NOT NULL
    );
  `);
  seed(db);
  return db;
}

const DOCTORS = [
  ['dr-ananya-roy', 'Dr. Ananya Roy', 'General Medicine', 'AR', 'Assamese, Bengali, English', 'Guwahati', 500, 'available', 1],
  ['dr-hemanta-das', 'Dr. Hemanta Das', 'General Medicine', 'HD', 'Assamese, Hindi, English', 'Silchar', 400, 'available', 0],
  ['dr-meera-joshi', 'Dr. Meera Joshi', 'Cardiology', 'MJ', 'Hindi, English', 'Guwahati', 900, 'available', 1],
  ['dr-riya-kalita', 'Dr. Riya Kalita', 'Dermatology', 'RK', 'Assamese, English', 'Tezpur', 600, 'offline', 1],
  ['dr-imran-hoque', 'Dr. Imran Hoque', 'General Medicine', 'IH', 'Assamese, Bengali, English', 'Dhubri', 350, 'available', 1],
] as const;

function seed(d: DatabaseSync) {
  const count = d.prepare('SELECT COUNT(*) AS n FROM doctors').get() as { n: number };
  if (count.n > 0) return;
  const insertDoc = d.prepare('INSERT INTO doctors VALUES (?,?,?,?,?,?,?,?,?)');
  for (const doc of DOCTORS) insertDoc.run(...doc);
  const insertSlot = d.prepare('INSERT INTO slots VALUES (?,?,?,?)');
  const base = new Date();
  base.setSeconds(0, 0);
  const modes: Record<string, ('video' | 'in-person')[]> = { 'dr-riya-kalita': ['video'], 'dr-meera-joshi': ['video', 'in-person'] };
  for (const [id] of DOCTORS) {
    const allowed = modes[id] ?? ['in-person', 'video'];
    for (let day = 1; day <= 7; day++) {
      for (const hour of [10, 11, 15, 16]) {
        const at = new Date(base);
        at.setDate(at.getDate() + day);
        at.setHours(hour, 0, 0, 0);
        for (const mode of allowed) insertSlot.run(`${id}-${day}-${hour}-${mode}`, id, at.toISOString(), mode);
      }
    }
  }
  d.prepare('INSERT INTO traces VALUES (?,?,?,?,?,?)').run(null, nowIso(), 'database.ready', 'completed', 'Synthetic doctors and slots seeded', 'application');
}