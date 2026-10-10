import { Encounter, Language, Message } from '../../shared/types.ts';
import { emptyScreening } from '../rules/redFlags.ts';
import { extractFields } from './briefing.ts';
import { getDb } from '../db.ts';
import { uuid, nowIso } from '../lib/ids.ts';
import { trace } from '../trace.ts';

const GREETINGS: Record<Language, string> = {
  en: 'Hello. I can help you prepare for a consultation. I do not diagnose. Tell me what is wrong, in your own words.',
  hi: 'नमस्ते। मैं आपको परामर्श की तैयारी में मदद कर सकता हूँ। मैं निदान नहीं करता। अपनी समस्या अपने शब्दों में बताइए।',
  as: 'নমস্কাৰ। মই আপোনাক পৰামৰ্শৰ প্ৰস্তুতিত সহায় কৰিব পাৰোঁ। মই ৰোগ নিৰ্ণয় নকৰোঁ। আপোনাৰ সমস্যা আপোনাৰ শব্দত কোৱাৰ চেষ্টা কৰক।',
};

export function createEncounter(language: Language, name = 'Demo Patient'): Encounter {
  const greeting: Message = {
    id: uuid(), role: 'assistant', text: GREETINGS[language], language,
    translation: 'original', createdAt: nowIso(),
  };
  const encounter: Encounter = {
    id: uuid(), name, language, messages: [greeting], fields: extractFields([greeting]),
    screening: emptyScreening(), documents: [], createdAt: nowIso(), version: 1,
  };
  saveEncounter(encounter);
  trace('encounter.create', 'completed', `Encounter ${encounter.id.slice(0, 8)} created (${language})`);
  return encounter;
}

export function saveEncounter(encounter: Encounter) {
  encounter.version += 1;
  getDb().prepare(
    `INSERT INTO encounters (id, payload, created_at, version) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, version = excluded.version`,
  ).run(encounter.id, JSON.stringify(encounter), encounter.createdAt, encounter.version);
}

export function getEncounter(id: string): Encounter | null {
  const row = getDb().prepare('SELECT payload FROM encounters WHERE id = ?').get(id) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as Encounter : null;
}

export function listEncounters(limit = 30): Encounter[] {
  const rows = getDb().prepare('SELECT payload FROM encounters ORDER BY created_at DESC LIMIT ?').all(limit) as { payload: string }[];
  return rows.map(r => JSON.parse(r.payload) as Encounter);
}