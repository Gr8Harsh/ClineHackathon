import { z } from 'zod';
import type { ConversationOutput, IntakeField } from '../../shared/conversation.ts';
import type { FieldConfig } from '../config/conversationFields.ts';

const schema = z.object({
  reply: z.string().trim().min(1).max(1000),
  extracted: z.array(z.object({ field: z.string(), value: z.string().min(1).max(1000), quote: z.string().min(1).max(1000) }).strict()).max(20),
  quick_replies: z.array(z.string().trim().min(1).max(100)).max(4),
}).strict();
export const isUnknown = (text: string) => /^(?:i\s+)?(?:don['’]?t know|do not know|unknown|not sure|unsure|not measured|জানি নে|নাজানো|পতা নে|मुझे नहीं पता|पता नहीं)$/iu.test(text.trim().replace(/[.!।]+$/u, ''));
export const isDeclined = (text: string) => /^(?:i\s+)?(?:prefer not to say|rather not say|skip)$/i.test(text.trim());
export function plainReply(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/[*_`#]/g, '').replace(/^\s*[-•]\s*/gm, '').trim();
}
export function acceptedExtractions(raw: string, latest: string, fields: IntakeField[]): ConversationOutput['extracted'] {
  const parsed = schema.parse(JSON.parse(raw));
  return parsed.extracted.filter(e => fields.some(f => f.id === e.field) && latest.includes(e.quote) && e.value === e.quote);
}
export function validateConversationOutput(raw: string, latest: string, fields: IntakeField[], config: FieldConfig[]): { output: ConversationOutput; questionField: string | null; rejectedExtractions: number } {
  const parsed = schema.parse(JSON.parse(raw));
  const reply = parsed.reply;
  if (plainReply(reply) !== reply || /\[[^\]]+\]\(|^\s*\d+[.)]\s/m.test(reply)) throw new Error('Formatting: plain text only');
  if (reply.split(/\s+/u).length > 30) throw new Error('Reply exceeds 30 words');
  if (/sorry|apolog|😊|happy to help|hope you feel|माफ़|ক্ষমা/iu.test(reply)) throw new Error('Apology or filler');
  if (/(?:need|should|want|require|probably|might).{0,35}(?:doctor|exam|in.person)|(?:doctor|exam).{0,35}(?:need|should|necessary)|what (?:condition|disease)|likely (?:condition|diagnosis)|harmless|benign|you (?:have|probably have) (?:a |an )?(?:migraine|infection)|কোন রোগ|डॉक्टर.{0,20}(?:चाहिए|ज़रूरत)|जाँच.{0,20}(?:चाहिए|ज़रूरत)/iu.test(reply)) throw new Error('Patient cannot decide clinical routing or diagnosis');
  if (/\b(?:mg|dose|dosage|tablets?|paracetamol|ibuprofen|aspirin|antibiotic)\b/iu.test(reply)) throw new Error('Medicine advice is prohibited');
  const accepted = parsed.extracted.filter(e => fields.some(f => f.id === e.field) && latest.includes(e.quote) && e.value === e.quote);
  if (new Set(accepted.map(e => e.field)).size !== accepted.length) throw new Error('Reply has duplicate field extractions');
  const done = new Set(fields.filter(f => ['answered', 'unknown', 'declined'].includes(f.status)).map(f => f.id));
  for (const e of accepted) done.add(e.field);
  const questions = (reply.match(/[?？]/gu) ?? []).length;
  if (questions > 1) throw new Error('Ask one question only');
  let questionField: string | null = null;
  if (questions) {
    const question = reply.split(/[.!।]/u).at(-1)!.toLowerCase();
    const matches = config.filter(f => f.aliases.some(a => question.includes(a.toLowerCase())));
    if (matches.some(f => done.has(f.id))) throw new Error('Question repeats a completed field');
    const candidates = matches.filter(f => !done.has(f.id));
    if (candidates.length !== 1) throw new Error('Question target is ambiguous or unsupported');
    questionField = candidates[0].id;
  } else if (fields.some(f => f.required && !done.has(f.id))) throw new Error('A required field still needs one question');
  if (parsed.quick_replies.length === 1) throw new Error('Use two to four quick replies or none');
  if (parsed.quick_replies.some(q => plainReply(q) !== q || /\b(?:mg|dose|paracetamol|ibuprofen|aspirin|antibiotic)\b/iu.test(q))) throw new Error('Quick replies must be plain text without medicines or doses');
  return { output: { ...parsed, extracted: accepted }, questionField, rejectedExtractions: parsed.extracted.length - accepted.length };
}