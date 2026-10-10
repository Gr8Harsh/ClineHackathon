import { useEffect, useState } from 'react';
import type { Snapshot, Language } from '../../shared/types.ts';
import { api } from '../api.ts';
import { SummaryPanel } from '../components/SummaryPanel.tsx';
import { CareRouteBanner } from '../components/CareRouteBanner.tsx';

const LANG_LABEL: Record<Language, string> = { en: 'English', hi: 'Hindi', as: 'Assamese' };

export function DoctorView() {
  const [list, setList] = useState<{ id: string; name: string; language: Language; createdAt: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.listEncounters().then(setList).catch(e => setError(e.message)); }, []);

  useEffect(() => {
    if (!selected) return;
    api.getEncounter(selected).then(setSnapshot).catch(e => setError(e.message));
  }, [selected]);

  async function ask() {
    if (!selected || !question.trim()) return;
    try { setSnapshot(await api.askClarification(selected, question.trim())); setQuestion(''); }
    catch (e) { setError((e as Error).message); }
  }

  const enc = snapshot?.encounter;
  const missing = enc?.fields.filter(f => f.value === null) ?? [];

  return (
    <>
      {error && <div className="notice">{error}</div>}
      <div className="grid-2">
        <section className="card">
          <header>Encounters <span className="sub">synthetic data</span></header>
          <div className="body" style={{ paddingTop: 8, paddingBottom: 8 }}>
            {list.length === 0 && <p className="empty">No consultations yet. Start one in the Patient tab.</p>}
            {list.map(e => (
              <div key={e.id} className="doctor-row" style={{ cursor: 'pointer' }} onClick={() => setSelected(e.id)}>
                <div className="avatar">{e.name.slice(0, 1)}</div>
                <div className="info">
                  <div className="name">{e.name} {selected === e.id && <span className="prov prov-reported">open</span>}</div>
                  <div className="spec">{LANG_LABEL[e.language]} · {new Date(e.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'grid', gap: 18 }}>
          {!snapshot && <section className="card"><div className="body"><p className="empty">Select an encounter to see its briefing.</p></div></section>}
          {snapshot && enc && (
            <>
              <CareRouteBanner decision={snapshot.decision} booking={snapshot.booking} />
              {missing.length > 0 && (
                <div className="notice">
                  <strong>{missing.length} field(s) still missing:</strong> {missing.map(f => f.key).join(', ')}. These were never asked — they are not “none”.
                </div>
              )}
              <SummaryPanel fields={enc.fields} onConfirm={() => {}} onSource={() => {}} />

              <section className="card">
                <header>Documents <span className="sub">patient-uploaded · unverified</span></header>
                <div className="body">
                  {enc.documents.length === 0 && <p className="empty">No documents uploaded.</p>}
                  {enc.documents.map(d => (
                    <div key={d.id} style={{ marginBottom: 10 }}>
                      <strong>{d.name}</strong>
                      {d.observations.map(o => (
                        <div key={o.id} className="obs">
                          <span>{o.name}</span><span className="val">{o.value} {o.unit}</span>
                          <span className="src">line {o.line}: {o.sourceText}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <header>Ask the patient one clarifying question</header>
                <div className="body">
                  <div className="row">
                    <input
                      value={question} onChange={e => setQuestion(e.target.value)}
                      placeholder="Any blood thinners?" style={{ flex: 1, minWidth: 200, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px' }}
                      onKeyDown={e => e.key === 'Enter' && ask()}
                    />
                    <button className="btn btn-primary" disabled={!question.trim()} onClick={ask}>Send to patient</button>
                  </div>
                  {enc.clarification && (
                    <div style={{ marginTop: 12 }}>
                      <div className="msg assistant" style={{ maxWidth: '100%' }}>
                        {enc.clarification.question}
                        <span className="meta">You asked · {new Date(enc.clarification.askedAt).toLocaleString()}</span>
                      </div>
                      {enc.clarification.answer ? (
                        <div className="msg patient" style={{ maxWidth: '100%', marginTop: 8 }}>
                          {enc.clarification.answer.text}
                          <span className="meta">
                            Patient ({LANG_LABEL[enc.clarification.answer.language]}) · shown to you as-is; translation is not performed in guided mode
                          </span>
                        </div>
                      ) : (
                        <p className="empty" style={{ marginTop: 8 }}>Waiting for the patient to answer in their own language.</p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}