import type { BriefField, FieldKey, Message } from '../../shared/types.ts';

const LABELS: Record<FieldKey, string> = {
  concern: 'Main concern', duration: 'Duration', history: 'Medical history',
  medications: 'Current medications', allergies: 'Allergies',
};

function provenanceBadge(field: BriefField, messages: Message[]) {
  if (field.value === null) return <span className="prov prov-missing">not recorded</span>;
  if (!messages.some(m => m.id === field.sourceId && m.role === 'patient')) return <span className="prov prov-missing">source unavailable</span>;
  return <span className="prov prov-reported">patient-reported</span>;
}

export function SummaryPanel({
  fields, messages, onConfirm, onSource, busy = false,
}: {
  fields: BriefField[];
  messages: Message[];
  onConfirm?: (key: string) => void;
  busy?: boolean;
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
              {provenanceBadge(f, messages)}
            </div>
            {f.value === null ? (
              <div className="field-value missing">Not yet recorded — this is not the same as “none”.</div>
            ) : (
              <div className="field-value">{f.value}</div>
            )}
            <div className="row" style={{ marginTop: 4 }}>
              {f.value !== null && <><span className={`prov ${f.verification === 'patient-confirmed' ? 'prov-confirmed' : 'prov-missing'}`}>{f.verification === 'patient-confirmed' ? 'Patient confirmed wording' : 'Unverified'}</span><span className="meta">{f.transformation === 'translation' ? 'Translated · check original' : 'No translation recorded'}</span></>}
              {f.sourceId && messages.some(m => m.id === f.sourceId) && (
                <button className="source-link" onClick={() => onSource(f.sourceId!)}>
                  View original message
                </button>
              )}
              {onConfirm && f.value !== null && messages.some(m => m.id === f.sourceId && m.role === 'patient') && f.verification === 'unverified' && (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onConfirm(f.key)}>
                  Confirm recorded wording
                </button>
              )}
            </div>
          </div>
        ))}
        <p className="empty" style={{ marginBottom: 4 }}>
          Missing fields may not have been asked or captured. Extraction and translation can be wrong. Patient confirmation checks wording, not medical accuracy.
        </p>
      </div>
    </section>
  );
}