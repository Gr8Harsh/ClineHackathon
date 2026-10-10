import { Language } from '../../shared/types.ts';
import { isAgentConfigured, translateWithAgent } from '../agent/runAgent.ts';
import { trace } from '../trace.ts';

export interface Translation { text: string; status: 'fixture' | 'unverified' }

/**
 * Synthetic demo phrasebook. Exact matches only, so the scripted demo works
 * offline. Every entry is labelled "fixture", never presented as live
 * translation, and needs native-speaker review before real use.
 */
const PHRASEBOOK: { as?: string; hi?: string; en: string }[] = [
  { as: 'মোৰ চাৰি দিনৰ পৰা মূৰ বিষাইছে', hi: 'मुझे चार दिन से सिरदर्द है', en: 'I have had a headache for 4 days' },
  { as: 'মই দুৰ্বল অনুভৱ কৰিছোঁ', hi: 'मैं कमज़ोर महसूस कर रहा हूँ', en: 'I am feeling weak' },
  { as: 'হয়, মই প্ৰতিদিনে এছপিৰিন খাওঁ', hi: 'हाँ, मैं रोज़ एस्पिरिन लेता हूँ', en: 'Yes, I take aspirin every day' },
  { as: 'নাই, মই কোনো ঔষধ নাখাওঁ', hi: 'नहीं, मैं कोई दवा नहीं लेता', en: 'No, I do not take any medicines' },
  { as: 'আপুনি কোনো তেজ পাতল কৰা ঔষধ (blood thinner) খায় নেকি?', hi: 'क्या आप खून पतला करने वाली कोई दवा (blood thinner) लेते हैं?', en: 'Any blood thinners?' },
  { as: 'আপুনি নিয়মীয়াকৈ কোনো ঔষধ খায় নেকি, যেনে তেজ পাতল কৰা ঔষধ?', hi: 'क्या आप नियमित रूप से कोई दवा लेते हैं, जैसे खून पतला करने वाली दवा?', en: 'Are you taking any blood thinners or other regular medicines?' },
];

const norm = (t: string) => t.trim().replace(/[\s।.?!]+$/u, '').replace(/\s+/g, ' ').toLowerCase();

export function phrasebookLookup(text: string, from: Language, to: Language): string | null {
  const key = norm(text);
  const hit = PHRASEBOOK.find(p => p[from] !== undefined && norm(p[from]!) === key);
  return hit?.[to] ?? null;
}

/**
 * Translate between the patient's language and English. Returns null when no
 * honest translation is available; callers then show the original only.
 */
export async function translate(text: string, from: Language, to: Language): Promise<Translation | null> {
  if (from === to) return null;
  const fixture = phrasebookLookup(text, from, to);
  if (fixture) {
    trace('translate.fixture', 'completed', `Synthetic phrasebook ${from}→${to}; labelled fixture, not live translation`);
    return { text: fixture, status: 'fixture' };
  }
  if (!isAgentConfigured()) return null;
  try { return { text: await translateWithAgent(text, from, to), status: 'unverified' }; }
  catch {
    trace('translate.live', 'failed', `Live ${from}→${to} translation unavailable; original kept, no English shown`);
    return null;
  }
}
