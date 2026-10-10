import type { BriefField, FieldKey } from '../../shared/types.ts';

const LABELS: Record<FieldKey, string> = {
  concern: 'Main concern', duration: 'Duration', history: 'Medical history',
  medications: 'Current medications', allergies: 'Allergies',
};

function provenanceBadge(field: BriefField) {
  if (field.value === null) return <span className="prov prov-missing">not yet asked</span>;
  if (field.verification === 'patient-confirmed') return <span className="prov prov-confirmed">✓ patient-confirmed</span>;
  return <span className="prov prov-reported">patient-reported</span>;
}

export function SummaryPanel({
  fields, onConfirm, onSource,
}: {
  fields: BriefField[];
  onConfirm: (key: string) => void;
  onSource: (messageId: string) => void;
}) {
  return (
    <section className="card">
      <header>
        Consultation briefing <span className="sub">every line shows its source</span>
      </header>
      <div className="body" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {fields.map(f => (
          <div key={f.key} className="field-row">
            <div className="field-head">
              <span className="field-label">{LABELS[f.key]}</span>
              {provenanceBadge(f)}
            </div>
            {f.value === null ? (
              <div className="field-value missing">Not yet asked — this is not the same as “none”.</div>
            ) : (
              <div className="field-value">{f.value}</div>
            )}
            <div className="row" style={{ marginTop: 4 }}>
              {f.sourceId && (
                <button className="source-link" onClick={() => onSource(f.sourceId!)}>
                  ↳ from what you said
                </button>
              )}
              {f.value !== null && f.verification === 'unverified' && (
                <button className="btn btn-ghost btn-sm" onClick={() => onConfirm(f.key)}>
                  I confirm this is accurate
                </button>
              )}
            </div>
          </div>
        ))}
        <p className="empty" style={{ marginBottom: 4 }}>
          Values are extracted from your own words. Nothing here is inferred or guessed. Confirm a line only if it matches what you meant.
        </p>
      </div>
    </section>
  );
}