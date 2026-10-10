import type { Encounter } from '../../shared/types.ts';

export function IntakeBriefing({ encounter }: { encounter: Encounter }) {
  const fields = encounter.conversation?.fields ?? [];
  const age = fields.find(f => f.id === 'age' && f.status === 'answered');
  const value = age?.value?.match(/^(\d+(?:\.\d+)?)\s*(months?|years?|वर्ष|साल|মাহ|বছৰ)?$/iu);
  const years = value ? Number(value[1]) / (/month|মাহ/i.test(value[2] ?? '') ? 12 : 1) : null;
  return <section className="relief-card" aria-label="Consultation details">
    <h2>Consultation details</h2>
    {years !== null && years < 18 && <p className="notice">Patient is a minor, guardian should attend · Patient-reported age · source {age!.sourceId}</p>}
    {fields.map(f => <div className="intake-field" key={f.id}>
      <strong>{f.label}{!f.required && ' (optional)'}</strong>
      <p>{f.status === 'unknown' ? 'Patient did not know' : f.status === 'declined' ? 'Patient preferred not to say' : f.value ?? (f.status === 'not_asked' ? 'Not asked' : 'Asked, unanswered')}</p>
      {f.sourceId && <details><summary>Patient-reported source · unverified</summary><p lang={encounter.language}>{f.quote}</p><small>Message {f.sourceId}</small></details>}
    </div>)}
    <p>These are recorded words, not a diagnosis. Missing is not “none”.</p>
  </section>;
}