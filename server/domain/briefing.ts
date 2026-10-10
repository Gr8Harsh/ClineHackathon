import type { BriefField, FieldKey } from '../../shared/types.ts';

/** Only explicit, attributable evidence becomes a briefing field. No keyword-based medical inferences. */
export function extractFields(messages: { id: string; text: string; english?: string; role: string }[]): BriefField[] {
  const patient = messages.filter(m => m.role === 'patient');
  return (['concern', 'duration', 'history', 'medications', 'allergies'] as FieldKey[]).map(key => {
    let source = key === 'concern' ? patient[0] : undefined;
    let value: string | null = source ? source.english ?? source.text : null;
    if (key !== 'concern') {
      for (const msg of patient) {
        const text = msg.english ?? msg.text;
        const explicit = text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'i'));
        if (explicit) { value = explicit[1]; source = msg; }
        else if (key === 'duration' && !value) {
          const duration = text.match(/\b(?:for|since)\s+\d+\s+(?:hours?|days?|weeks?|months?)\b/i);
          if (duration) { value = duration[0]; source = msg; }
        }
      }
    }
    return { key, value, sourceId: source?.id ?? null, verification: 'unverified', transformation: source?.english ? 'translation' : 'none' };
  });
}