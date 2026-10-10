import { useEffect, useState } from 'react';
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

  async function loadList() {
    setListState('loading');
    try { setList(await api.listEncounters()); setListState('success'); }
    catch (e) { setListState('error'); setError((e as Error).message); }
  }

  async function loadEncounter(id: string) {
    setLoading(true); setError('');
    try { setSnapshot(await api.getEncounter(id)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadList(); }, []);
  useEffect(() => { setSnapshot(null); if (selected) void loadEncounter(selected); }, [selected]);

  async function ask() {
    if (!selected || !question.trim()) return;
    setBusy(true); setError('');
    try { setSnapshot(await api.askClarification(selected, question.trim())); setQuestion(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function showSource(messageId: string) {
    const id = `doctor-msg-${messageId}`;
    setHighlight(id); focusEvidence(id);
  }

  const enc = snapshot?.encounter;
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
          {listState === 'error' && <p className="empty">The encounter list could not be loaded.</p>}
          {list.map(e => <button key={e.id} className={`encounter-row ${selected === e.id ? 'selected' : ''}`}
            aria-pressed={selected === e.id} onClick={() => setSelected(e.id)}>
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
        {snapshot && enc && <>
          <div className="row">
            <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => loadEncounter(enc.id)}>Refresh briefing</button>
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
            <summary>Original patient messages ({enc.messages.filter(m => m.role === 'patient').length})</summary>
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
                <input id="doctor-question" className="grow" maxLength={500} value={question} disabled={busy}
                  placeholder="Any blood thinners?" onChange={e => setQuestion(e.target.value)} />
                <button className="btn btn-primary" disabled={busy || !question.trim()}>Send to patient</button>
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