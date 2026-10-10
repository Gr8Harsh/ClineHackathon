import { BriefField, FieldKey } from '../../shared/types.ts';

const DURATION_PATTERNS: { re: RegExp; render: (m: RegExpMatchArray) => string }[] = [
  { re: /(\d+)\s*(hour|hr|hrs|hours?)\b/i, render: m => `${m[1]} hours` },
  { re: /(\d+)\s*(day|days?)\b/i, render: m => `${m[1]} days` },
  { re: /(\d+)\s*(week|weeks?)\b/i, render: m => `${m[1]} weeks` },
  { re: /(\d+)\s*(month|months?)\b/i, render: m => `${m[1]} months` },
];

const HISTORY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(diabetes|diabetic|sugar)\b/i, label: 'Diabetes' },
  { re: /\b(hypertension|high blood pressure|bp)\b/i, label: 'Hypertension' },
  { re: /\b(thyroid)\b/i, label: 'Thyroid condition' },
  { re: /\b(asthma)\b/i, label: 'Asthma' },
  { re: /\b(heart (disease|condition|failure)|chd)\b/i, label: 'Heart disease' },
  { re: /\b(kidney (disease|problem))\b/i, label: 'Kidney disease' },
];

const MED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(metformin)\b/i, label: 'Metformin' },
  { re: /\b(amlodipine|losartan|telmisartan|atenolol|metoprolol)\b/i, label: 'Blood-pressure medicine' },
  { re: /\b(thyroxine|levothyroxine|thyronorm)\b/i, label: 'Thyroid medicine' },
  { re: /\b(aspirin)\b/i, label: 'Aspirin' },
  { re: /\b(insulin)\b/i, label: 'Insulin' },
  { re: /\b(paracetamol|acetaminophen)\b/i, label: 'Paracetamol' },
];

const ALLERGY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(penicillin)\b/i, label: 'Penicillin' },
  { re: /\b(sulfa|sulfonamide)\b/i, label: 'Sulfa drugs' },
  { re: /\b(asa|aspirin)\b/i, label: 'Aspirin' },
  { re: /\b(peanut)\b/i, label: 'Peanut' },
  { re: /\b(shellfish|prawn|crab)\b/i, label: 'Shellfish' },
];

const NEGATION = /\b(no|not|none|without|never|deny|denies|nil)\b/i;

/** Structured, provenance-tagged extraction. Everything links back to a message id. */
export function extractFields(messages: { id: string; text: string; english?: string; role: string }[]): BriefField[] {
  const patient = messages.filter(m => m.role === 'patient');
  const evidence = patient.map(m => ({ id: m.id, text: `${m.english ?? ''} ${m.text}` }));

  const field = (key: FieldKey): BriefField => ({
    key, value: null, sourceId: null, verification: 'unverified', transformation: 'none',
  });
  const fields: Record<FieldKey, BriefField> = {
    concern: field('concern'), duration: field('duration'), history: field('history'),
    medications: field('medications'), allergies: field('allergies'),
  };

  if (patient.length > 0) {
    const first = patient[0];
    fields.concern = {
      key: 'concern', value: first.english ? `${first.english}` : first.text, sourceId: first.id,
      verification: 'unverified', transformation: first.english ? 'translation' : 'none',
    };
  }

  for (const ev of evidence) {
    if (!fields.duration.value) {
      for (const p of DURATION_PATTERNS) {
        const m = ev.text.match(p.re);
        if (m) {
          fields.duration = { key: 'duration', value: p.render(m), sourceId: ev.id, verification: 'unverified', transformation: 'none' };
          break;
        }
      }
    }
    const collect = (patterns: { re: RegExp; label: string }[], key: FieldKey) => {
      if (fields[key].value) return;
      const hits: string[] = [];
      let sourceId: string | null = null;
      for (const ev2 of evidence) {
        for (const p of patterns) {
          if (p.re.test(ev2.text) && !NEGATION.test(ev2.text.split(p.re.source)[0] ?? '')) {
            if (!hits.includes(p.label)) hits.push(p.label);
            sourceId = sourceId ?? ev2.id;
          }
        }
      }
      if (hits.length > 0 && sourceId) {
        fields[key] = { key, value: hits.join(', '), sourceId, verification: 'unverified', transformation: 'none' };
      }
    };
    collect(HISTORY_PATTERNS, 'history');
    collect(MED_PATTERNS, 'medications');
    collect(ALLERGY_PATTERNS, 'allergies');
  }

  return Object.values(fields);
}