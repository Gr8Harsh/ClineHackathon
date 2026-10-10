import type { SymptomArea } from '../../shared/conversation.ts';

export interface FieldConfig { id: string; label: string; required: boolean; quick_replies: string[]; question: string; aliases: string[] }
const field = (id: string, label: string, question: string, aliases: string[], quick_replies: string[] = [], required = true): FieldConfig => ({ id, label, question, aliases, quick_replies, required });
const duration = field('duration', 'Duration', 'How long has it been going on?', ['how long', 'when did', 'duration', 'কিমান দিন', 'কেতিয়াৰ পৰা', 'কিমান সময়', 'कब से', 'कितने दिन', 'कितने समय']);
const pattern = field('pattern', 'Pattern', 'Is it constant, or does it come and go?', ['constant', 'come and go', 'comes and goes', 'steady', 'throbbing', 'pain feel', 'time of day', 'pattern', 'কেতিয়া', 'দিনৰ', 'লগাতাৰ', 'लगातार', 'आता जाता', 'आता-जाता', 'किस समय']);
const associated = field('associated', 'Other symptoms', 'What other symptoms have you noticed?', ['other symptom', 'anything else', 'আৰু', 'और क्या', 'अन्य लक्षण']);
export const OPTIONAL_FIELDS: FieldConfig[] = [
  field('age', 'Patient age', 'How old is the patient?', ['how old', 'age', 'বয়স', 'उम्र'], ['Prefer not to say'], false),
  field('medications', 'Current medicines', 'Do you take any medicines regularly?', ['medicine', 'medication', 'ঔষধ', 'दवा'], ['None', 'I don’t know', 'Prefer not to say'], false),
  field('allergies', 'Allergies', 'Do you have any known allergies?', ['allerg', 'এলাৰ্জি', 'एलर्जी'], ['None', 'I don’t know', 'Prefer not to say'], false),
  field('history', 'Relevant medical history', 'Is there any medical history you want the doctor to know?', ['history', 'long-term', 'medical condition', 'बीमारी'], ['None', 'I don’t know', 'Prefer not to say'], false),
];
export const CONVERSATION_FIELDS: Record<SymptomArea, FieldConfig[]> = {
  headache: [duration, field('location', 'Pain location', 'Where does it hurt most?', ['where', 'location', 'which part', 'ক’ত', 'কত', 'কোথায়', 'কোন অংশ', 'কোন ঠাই', 'कहाँ', 'किस हिस्से'], ['Forehead', 'One side', 'Back of head', 'All over']), pattern],
  stomach: [duration, field('location', 'Pain location', 'Where in your stomach does it hurt?', ['where', 'location', 'ক’ত', 'कहाँ'], ['Upper belly', 'Lower belly', 'One side', 'All over']), pattern],
  fever: [duration, field('temperature', 'Measured temperature', 'What temperature did you measure, if you know?', ['temperature', 'thermometer', 'তাপ', 'तापमान'], ['Not measured', 'I don’t know']), associated],
  cough: [duration, field('description', 'Cough description', 'Is the cough dry, or are you bringing up mucus?', ['dry', 'mucus', 'cough like', 'শুকান', 'सूखी', 'बलगम'], ['Dry', 'With mucus', 'I don’t know']), associated],
  rash: [duration, field('location', 'Rash location', 'Where on your body is the rash?', ['where', 'location', 'ক’ত', 'कहाँ']), field('progression', 'Rash progression', 'Has the rash spread or changed?', ['spread', 'changed', 'progress', 'বাঢ়', 'फैल', 'बदल']), field('sensation', 'Itching or pain', 'Does it itch, hurt, or neither?', ['itch', 'hurt', 'pain', 'খজুৱ', 'खुजली', 'दर्द'], ['Itchy', 'Painful', 'Neither', 'I don’t know'])],
  general: [duration, field('description', 'Symptom description', 'How would you describe what you’re feeling?', ['describe', 'feeling', 'description', 'অনুভৱ', 'महसूस']), field('impact', 'Daily activity impact', 'How is this affecting your daily activities?', ['daily', 'activities', 'affect', 'কাম', 'काम'])],
};
export const CONVERSATION_CONFIG_VERSION = 1;
export function configs(area: SymptomArea): FieldConfig[] { return [...CONVERSATION_FIELDS[area], ...OPTIONAL_FIELDS]; }
export function detectSymptomArea(text: string): SymptomArea {
  if (/headache|head hurts|মূৰ বিষ|सिरदर्द|सिर में दर्द/i.test(text)) return 'headache';
  if (/stomach|belly|abdom|পেট|पेट/i.test(text)) return 'stomach';
  if (/fever|temperature|জ্বৰ|बुखार/i.test(text)) return 'fever';
  if (/cough|কাশ|खाँसी|खांसी/i.test(text)) return 'cough';
  if (/rash|ফুসকুৰি|चकत्त|दाने/i.test(text)) return 'rash';
  return 'general';
}