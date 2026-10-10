import { useState } from 'react';
import type { LabDocument } from '../../shared/types.ts';
import { focusEvidence } from '../ui.ts';

export function DocumentEvidence({ documents, prefix }: { documents: LabDocument[]; prefix: string }) {
  const [highlight, setHighlight] = useState('');
  return <div className="stack">
    {documents.length === 0 && <p className="empty">No reports recorded.</p>}
    {documents.map(doc => <section key={doc.id} className="document-evidence">
      <h3>{doc.name}</h3>
      <p className="empty">Plain-text extraction only, not OCR or medical interpretation. Values remain unverified.</p>
      <div className="doc-layout">
        <div className="doc-lines" aria-label={`Original report: ${doc.name}`}>
          {doc.text.split(/\r?\n/).map((line, index) => {
            const id = `${prefix}-${doc.id}-${index + 1}`;
            return <div id={id} key={id} tabIndex={-1} className={`doc-line ${highlight === id ? 'hl' : ''}`}>{index + 1} │ {line || ' '}</div>;
          })}
        </div>
        <div>
          {!doc.observations.length && <p className="notice">No supported observations extracted. This is not a normal-result assessment; review the original report.</p>}
          {doc.observations.map(o => <div key={o.id} className="obs">
            <span>{o.name}</span><span className="val">{o.value} {o.unit}</span>
            <span className="prov prov-extracted">Extracted from document</span>
            <span className="prov prov-missing">Unverified</span>
            <button className="source-link" onClick={() => {
              const id = `${prefix}-${doc.id}-${o.line}`;
              setHighlight(id); focusEvidence(id);
            }}>View source line {o.line}</button>
          </div>)}
        </div>
      </div>
    </section>)}
  </div>;
}

export function DocumentPanel({ documents, busy, onUpload }: {
  documents: LabDocument[]; busy: boolean; onUpload: (name: string, text: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('lab-report.txt');
  const [text, setText] = useState('');
  return <section className="card">
    <header>Lab reports <span className="sub">exact source lines · unverified values</span></header>
    <div className="body stack">
      <form className="stack" onSubmit={async e => {
        e.preventDefault();
        if (await onUpload(name.trim(), text.trim())) setText('');
      }}>
        <label className="input-label" htmlFor="report-name">Report name</label>
        <input id="report-name" maxLength={120} required value={name} disabled={busy} onChange={e => setName(e.target.value)} />
        <label className="input-label" htmlFor="report-text">Paste a synthetic plain-text lab report</label>
        <textarea id="report-text" required rows={5} maxLength={20000} value={text} disabled={busy} onChange={e => setText(e.target.value)} placeholder="Haemoglobin: 13.2 g/dL" />
        <div className="row">
          <button className="btn btn-primary" disabled={busy || !name.trim() || !text.trim()}>Extract values</button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setName('synthetic-example.txt'); setText('SYNTHETIC DEMO REPORT\nHaemoglobin: 13.2 g/dL\nFasting glucose: 118 mg/dL\nHbA1c: 7.4 %'); }}>Fill synthetic example</button>
        </div>
        <p className="empty">PDFs, images and handwritten reports are not supported. Adding another report preserves previous sources.</p>
      </form>
      <DocumentEvidence documents={documents} prefix="patient-document" />
    </div>
  </section>;
}