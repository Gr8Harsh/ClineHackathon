import type { BriefField, Clarification, FieldKey, Language, Message } from '../../shared/types.ts';

const LABELS: Record<FieldKey, string> = {
  concern: 'Main concern', duration: 'Duration', history: 'Medical history',
  medications: 'Current medications', allergies: 'Allergies',
};
const LANG_LABEL: Record<Language, string> = { en: 'English', hi: 'Hindi', as: 'Assamese' };

function provenanceBadge(field: BriefField, source: Message | undefined, asked: boolean, askTracked: boolean, clarification?: Clarification) {
  if (field.value === null) {
    if (clarification?.fieldKey === field.key && !clarification.answer) return <span className="prov prov-asked">doctor asked · awaiting answer</span>;
    if (asked) return <span className="prov prov-missing">asked · no answer recorded</span>;
    return askTracked
      ? <span className="prov prov-notasked">not asked</span>
      : <span className="prov prov-notasked" title="The AI assistant asks free-form questions; the app cannot tell whether this was asked.">not recorded</span>;
  }
  if (!source || source.role !== 'patient') return <span className="prov prov-missing">source unavailable</span>;
  const viaDoctor = clarification?.answer?.id === source.id;
  return <span className="prov prov-reported">
    patient-reported{viaDoctor ? ' · answered doctor' : ''}{source.enteredBy === 'health-worker' ? ' · entered by health worker' : ''}
  </span>;
}

export function SummaryPanel({
  fields, messages, onConfirm, onSource, onAsk, askedFields = [], askTracked = true, clarification, busy = false,
}: {
  fields: BriefField[];
  messages: Message[];
  onConfirm?: (key: string) => void;
  /** Doctor only: start a clarifying question for this missing field. */
  onAsk?: (key: FieldKey) => void;
  askedFields?: FieldKey[];
  /** False once a free-form agent turn happened: "not asked" can no longer be claimed. */
  askTracked?: boolean;
  clarification?: Clarification;
  busy?: boolean;
  onSource: (messageId: string) => void;
}) {
  return (
    <section className="card">
      <header>
        Consultation briefing <span className="sub">every line shows its source</span>
      </header>
      <div className="body" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {fields.map(f => {
          const source = messages.find(m => m.id === f.sourceId);
          const asked = askedFields.includes(f.key);
          return (
            <div key={f.key} className={`field-row ${f.value === null && !asked ? 'field-notasked' : ''}`}>
              <div className="field-head">
                <span className="field-label">{LABELS[f.key]}</span>
                {provenanceBadge(f, source, asked, askTracked, clarification)}
              </div>
              {f.value === null ? (
                <div className="field-value missing">{asked ? 'Asked, but no answer recorded' : askTracked ? 'Not yet asked' : 'Not recorded'} — this is not the same as “none”.</div>
              ) : f.transformation === 'translation' && source && source.text !== f.value ? (
                <div className="side-by-side">
                  <div lang={source.language}><span className="meta">Original · {LANG_LABEL[source.language]}</span>“{source.text}”</div>
                  <div lang="en"><span className="meta">English · {source.translation === 'fixture' ? 'synthetic phrasebook, not live translation' : 'machine-translated, unverified'}</span>{f.value}</div>
                </div>
              ) : (
                <div className="field-value">{f.value}</div>
              )}
              <div className="row" style={{ marginTop: 4 }}>
                {f.value !== null && <><span className={`prov ${f.verification === 'patient-confirmed' ? 'prov-confirmed' : 'prov-missing'}`}>{f.verification === 'patient-confirmed' ? 'Patient confirmed wording' : 'Unverified'}</span><span className="meta">{f.transformation === 'translation' ? 'Translated · check original' : 'No translation recorded'}</span></>}
                {f.sourceId && source && (
                  <button className="source-link" onClick={() => onSource(f.sourceId!)}>
                    View original message
                  </button>
                )}
                {onConfirm && f.value !== null && source?.role === 'patient' && f.verification === 'unverified' && (
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onConfirm(f.key)}>
                    Confirm recorded wording
                  </button>
                )}
                {onAsk && f.value === null && !clarification && (
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAsk(f.key)}>
                    Ask patient about this
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <p className="empty" style={{ marginBottom: 4 }}>
          Missing fields may not have been asked or captured. Extraction and translation can be wrong. Patient confirmation checks wording, not medical accuracy.
        </p>
      </div>
    </section>
  );
}
