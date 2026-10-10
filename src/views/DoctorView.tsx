import { useEffect, useRef, useState } from 'react';
import type { Language, Snapshot } from '../../shared/types.ts';
import { FIELD_LABELS } from '../../shared/types.ts';
import { api } from '../api.ts';
import { SummaryPanel } from '../components/SummaryPanel.tsx';
import { CareRouteBanner } from '../components/CareRouteBanner.tsx';
import { DocumentEvidence } from '../components/DocumentPanel.tsx';
import { MessageEvidence } from '../components/MessageEvidence.tsx';
import { focusEvidence } from '../ui.ts';

const LANG_LABEL: Record<Language, string> = { en: 'English', hi: 'Hindi', as: 'Assamese' };
type Meta = { id: string; name: string; language: Language; createdAt: string };

export function DoctorView() {
  const [list, setList] = useState<Meta[]>([]);
  const [listState, setListState] = useState<'loading' | 'success' | 'error'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [highlight, setHighlight] = useState('');
  const selection = useRef<string | null>(null);
  const request = useRef(0);
  const asking = useRef(false);
  const [listError, setListError] = useState('');

  async function loadList() {
    setListState('loading'); setListError('');
    try { setList(await api.listEncounters()); setListState('success'); }
    catch (e) { setListState('error'); setListError((e as Error).message); }
  }

  async function loadEncounter(id: string) {
    const serial = ++request.current;
    setLoading(true); setError('');
    try { const value = await api.getEncounter(id); if (serial === request.current && selection.current === id) setSnapshot(value); }
    catch (e) { if (serial === request.current) { setError((e as Error).message); setSnapshot(null); } }
    finally { if (serial === request.current) setLoading(false); }
  }

  useEffect(() => { void loadList(); }, []);
  useEffect(() => {
    setSnapshot(null); setQuestion(''); setHighlight('');
    if (selected) void loadEncounter(selected);
    return () => { ++request.current; };
  }, [selected]);

  async function ask() {
    if (!selected || !question.trim() || asking.current || loading || snapshot?.encounter.id !== selected || snapshot.encounter.clarification) return;
    const id = selected;
    asking.current = true;
    setBusy(true); setError('');
    try { const value = await api.askClarification(id, question.trim()); if (selection.current === id) { setSnapshot(value); setQuestion(''); } }
    catch (e) { if (selection.current === id) { setError(`${(e as Error).message}. Refresh before retrying; the question may have been saved.`); setSnapshot(null); } }
    finally { asking.current = false; setBusy(false); }
  }

  function showSource(messageId: string) {
    const id = `doctor-msg-${messageId}`;
    setHighlight(id); focusEvidence(id);
  }

  const enc = snapshot?.encounter.id === selected ? snapshot.encounter : undefined;
  const missing = enc?.fields.filter(f => f.value === null) ?? [];

  return <>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="grid-2 doctor-grid">
      <section className="card">
        <header>Encounters <span className="sub">synthetic · not an appointment feed</span></header>
        <div className="body stack">
          <button className="btn btn-ghost btn-sm" disabled={listState === 'loading'} onClick={loadList}>
            {listState === 'loading' ? 'Loading…' : 'Refresh list'}
          </button>
          {listState === 'success' && list.length === 0 && <p className="empty">No encounters yet. Start one in the Patient tab.</p>}
          {listState === 'error' && <p className="notice" role="alert">The encounter list could not be loaded: {listError}</p>}
          {list.map(e => <button key={e.id} className={`encounter-row ${selected === e.id ? 'selected' : ''}`}
            aria-pressed={selected === e.id} disabled={busy} onClick={() => { selection.current = e.id; ++request.current; setSnapshot(null); setSelected(e.id); }}>
            <span className="avatar" aria-hidden="true">{e.name.slice(0, 1)}</span>
            <span className="info">
              <span className="name">{e.name} · {e.id.slice(0, 8)}</span>
              <span className="spec">{LANG_LABEL[e.language]} · {new Date(e.createdAt).toLocaleString()}</span>
            </span>
          </button>)}
        </div>
      </section>

      <div className="stack">
        {!selected && <section className="card"><div className="body"><p className="empty">Select an encounter to see its briefing.</p></div></section>}
        {loading && <p role="status">Loading briefing…</p>}
        {selected && !loading && !enc && <button className="btn btn-ghost" disabled={busy} onClick={() => loadEncounter(selected)}>Retry selected encounter</button>}
        {snapshot && enc && <>
          <div className="row">
            <button className="btn btn-ghost btn-sm" disabled={loading || busy} onClick={() => loadEncounter(enc.id)}>Refresh briefing</button>
            <span className="empty">Patient language: {LANG_LABEL[enc.language]}</span>
          </div>
          <CareRouteBanner decision={snapshot.decision} booking={snapshot.booking} />
          {!snapshot.booking && <p className="empty">No booking recorded for this encounter.</p>}
          {missing.length > 0 && <div className="notice">
            <strong>{missing.length} field(s) not recorded:</strong> {missing.map(f => FIELD_LABELS[f.key]).join(', ')}.
            Not recorded is not the same as “none”.
          </div>}
          {/* Read-only: the doctor cannot mark fields as patient-confirmed. */}
          <SummaryPanel fields={enc.fields} messages={enc.messages} onSource={showSource} />

          <details className="card">
            <summary>Original conversation ({enc.messages.length} messages)</summary>
            <div className="body stack">
              {enc.messages.map(m => <div key={m.id} id={`doctor-msg-${m.id}`} tabIndex={-1} lang={m.language}
                className={`msg ${m.role} wide ${highlight === `doctor-msg-${m.id}` ? 'msg-hl' : ''}`}>
                <MessageEvidence message={m} />
              </div>)}
            </div>
          </details>

          <section className="card">
            <header>Documents <span className="sub">patient-supplied · unverified</span></header>
            <div className="body"><DocumentEvidence documents={enc.documents} prefix="doctor-document" /></div>
          </section>

          <section className="card">
            <header>Clarifying question <span className="sub">one per encounter</span></header>
            <div className="body stack">
              {!enc.clarification && <form className="row" onSubmit={e => { e.preventDefault(); void ask(); }}>
                <label className="sr-only" htmlFor="doctor-question">Question for the patient</label>
                <input id="doctor-question" className="grow" maxLength={500} value={question} disabled={busy || loading}
                  placeholder="Any blood thinners?" onChange={e => setQuestion(e.target.value)} />
                <button className="btn btn-primary" disabled={busy || loading || !question.trim()}>Send to patient</button>
              </form>}
              {enc.clarification && <>
                <div className="msg assistant wide" lang="en">
                  {enc.clarification.question}
                  <span className="meta">You asked · {new Date(enc.clarification.askedAt).toLocaleString()} · sent in English, not translated</span>
                </div>
                {enc.clarification.answer
                  ? <div className="msg patient wide" lang={enc.clarification.answer.language}><MessageEvidence message={enc.clarification.answer} /></div>
                  : <p className="empty">Waiting for the patient. Use “Refresh briefing” to check for an answer.</p>}
              </>}
            </div>
          </section>
        </>}
      </div>
    </div>
  </>;
}