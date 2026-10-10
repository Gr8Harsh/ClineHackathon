import type { LabDocument } from '../../shared/types.ts';

export function DocumentPanel({
  docText, docName, doc, highlightLine, onName, onText, onUpload, onHighlight,
}: {
  docText: string; docName: string; doc: LabDocument | undefined; highlightLine: number | null;
  onName: (s: string) => void; onText: (s: string) => void; onUpload: () => void; onHighlight: (n: number | null) => void;
}) {
  const lines = (doc?.text ?? '').split(/\r?\n/);

  return (
    <section className="card">
      <header>Lab report <span className="sub">values link back to their exact source line</span></header>
      <div className="body">
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            value={docName} onChange={e => onName(e.target.value)} aria-label="Document name"
            style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', width: 180 }}
          />
          <button className="btn btn-primary btn-sm" disabled={!docText.trim()} onClick={onUpload}>Extract values</button>
          <span className="empty">Paste a simple report like “Haemoglobin: 13.2 g/dL”.</span>
        </div>
        {!doc && (
          <textarea
            value={docText} onChange={e => onText(e.target.value)} rows={5}
            placeholder={'Haemoglobin: 13.2 g/dL\nFasting glucose: 118 mg/dL\nHbA1c: 7.4 %'}
            style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
          />
        )}

        {doc && (
          <div className="doc-layout">
            <div className="doc-lines">
              {lines.map((l, i) => (
                <div
                  key={i}
                  className={`doc-line ${highlightLine === i + 1 ? 'hl' : ''}`}
                  onClick={() => onHighlight(highlightLine === i + 1 ? null : i + 1)}
                >
                  {String(i + 1).padStart(2, ' ')} │ {l || ' '}
                </div>
              ))}
            </div>
            <div>
              <p className="empty" style={{ marginTop: 0 }}>Click any value to highlight its source line. All values are unverified.</p>
              {doc.observations.length === 0 ? (
                <p className="empty">No “label: value” lines found in this document.</p>
              ) : doc.observations.map(o => (
                <div key={o.id} className="obs">
                  <span>{o.name}</span>
                  <span className="val">{o.value} {o.unit}</span>
                  <button className="source-link" onClick={() => onHighlight(o.line)}>line {o.line}</button>
                  <span className="prov prov-missing">unverified</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}