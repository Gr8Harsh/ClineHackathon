import { useEffect, useRef, useState } from 'react';
import type { ClarificationDraft, FieldKey, Language, Snapshot } from '../../shared/types.ts';
import { FIELD_LABELS } from '../../shared/types.ts';
import { api, type EncounterMeta } from '../api.ts';
import { SummaryPanel } from '../components/SummaryPanel.tsx';
import { CareRouteBanner } from '../components/CareRouteBanner.tsx';
import { DocumentEvidence } from '../components/DocumentPanel.tsx';
import { MessageEvidence } from '../components/MessageEvidence.tsx';
import { IntakeBriefing } from '../components/IntakeBriefing.tsx';
import { focusEvidence } from '../ui.ts';

const LANG_LABEL: Record<Language, string> = { en: 'English', hi: 'Hindi', as: 'Assamese' };
type Meta = EncounterMeta;
// Quick prompts when the doctor clicks "Ask patient about this" on a missing field.
const ASK_PROMPTS: Record<FieldKey, string> = {
  medications: 'Any blood thinners?',
  allergies: 'Any allergies to medicines?',
  history: 'Any long-term conditions, like diabetes or high blood pressure?',
  duration: 'How long have you had this problem?',
  concern: 'What is the main problem you want to discuss?',
};

export function DoctorView() {
  const [list, setList] = useState<Meta[]>([]);
  const [listState, setListState] = useState<'loading' | 'success' | 'error'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [fieldKey, setFieldKey] = useState<FieldKey | ''>('');
  const [draft, setDraft] = useState<ClarificationDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
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

  async function loadEncounter(id: string, silent = false) {
    // A silent poll never cancels a visible load; it only applies if nothing newer started.
    const serial = silent ? request.current : ++request.current;
    if (!silent) { setLoading(true); setError(''); }
    try { const value = await api.getEncounter(id); if (serial === request.current && selection.current === id) setSnapshot(value); }
    catch (e) { if (serial === request.current && !silent) { setError((e as Error).message); setSnapshot(null); } }
    finally { if (serial === request.current && !silent) setLoading(false); }
  }

  useEffect(() => { void loadList(); }, []);
  const waiting = Boolean(snapshot?.encounter.clarification && !snapshot.encounter.clarification.answer);
  useEffect(() => {
    if (!waiting || !selected) return;
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden' && !asking.current) void loadEncounter(selected, true); }, 4000);
    return () => clearInterval(timer);
  }, [waiting, selected]);
  useEffect(() => {
    setSnapshot(null); setQuestion(''); setHighlight(''); setFieldKey(''); setDraft(null);
    if (selected) void loadEncounter(selected);
    return () => { ++request.current; };
  }, [selected]);

  async function ask() {
    if (!selected || !question.trim() || asking.current || loading || snapshot?.encounter.id !== selected || snapshot.encounter.clarification) return;
    const id = selected;
    asking.current = true;
    setBusy(true); setError('');
    const draftedBy = draft && draft.question === question.trim() ? draft.draftedBy : 'doctor';
    try { const value = await api.askClarification(id, question.trim(), fieldKey || undefined, draftedBy); if (selection.current === id) { setSnapshot(value); setQuestion(''); setDraft(null); } }
    catch (e) { if (selection.current === id) { setError(`${(e as Error).message}. Refresh before retrying; the question may have been saved.`); setSnapshot(null); } }
    finally { asking.current = false; setBusy(false); }
  }

  async function draftWithAgent() {
    if (!selected || drafting) return;
    const id = selected;
    setDrafting(true); setError('');
    try {
      const value = await api.draftClarification(id);
      if (selection.current !== id) return;
      setDraft(value); setQuestion(value.question); setFieldKey(value.fieldKey ?? '');
    } catch (e) { setError(`Draft failed: ${(e as Error).message}`); }
    finally { setDrafting(false); }
  }

  function askAbout(key: FieldKey) {
    setFieldKey(key); setQuestion(ASK_PROMPTS[key]); setDraft(null);
    document.getElementById('doctor-question')?.focus();
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
              <span className="name">{e.name} · {e.id.slice(0, 8)} {e.booked && <span className="prov prov-reported">booked</span>}</span>
              <span className="spec">{LANG_LABEL[e.language]} · {new Date(e.createdAt).toLocaleString()}{e.assistedBy ? ` · assisted by ${e.assistedBy.role === 'asha' ? 'ASHA' : 'clinic'} worker` : ''}</span>
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
          {enc.conversation && <IntakeBriefing encounter={enc} />}
          {!snapshot.booking && <p className="empty">No booking recorded for this encounter.</p>}
          {enc.assistedBy && <div className="assisted-banner">Intake entered by {enc.assistedBy.role === 'asha' ? 'ASHA worker' : 'clinic staff'} <strong>{enc.assistedBy.name}</strong> on the patient’s behalf. Wording is the patient’s as relayed by the worker.</div>}
          {missing.length > 0 && <div className="notice">
            <strong>{missing.length} field(s) not recorded:</strong> {missing.map(f => FIELD_LABELS[f.key]).join(', ')}.
            Not recorded is not the same as “none”.{!enc.clarification && ' Use “Ask patient about this” to send one question.'}
          </div>}
          {/* Read-only: the doctor cannot mark fields as patient-confirmed. */}
          <SummaryPanel fields={enc.fields} messages={enc.messages} onSource={showSource}
            askedFields={enc.askedFields} askTracked={!enc.agentTurns} clarification={enc.clarification} onAsk={askAbout} busy={busy || loading} />

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
              {!enc.clarification && <>
                <div className="row">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy || loading || drafting || !missing.length} onClick={draftWithAgent}>
                    {drafting ? 'Drafting…' : 'Draft with Cline agent'}
                  </button>
                  {draft && <span className="meta">{draft.note}</span>}
                </div>
                <form className="stack" onSubmit={e => { e.preventDefault(); void ask(); }}>
                  <div className="row">
                    <label className="sr-only" htmlFor="doctor-question">Question for the patient</label>
                    <input id="doctor-question" className="grow" maxLength={500} value={question} disabled={busy || loading}
                      placeholder="Any blood thinners?" onChange={e => setQuestion(e.target.value)} />
                    <button className="btn btn-primary" disabled={busy || loading || !question.trim()}>Send to patient</button>
                  </div>
                  <label className="row meta">The answer fills:
                    <select value={fieldKey} disabled={busy || loading} onChange={e => setFieldKey(e.target.value as FieldKey | '')}>
                      <option value="">no briefing field (answer kept in conversation)</option>
                      {missing.map(f => <option key={f.key} value={f.key}>{FIELD_LABELS[f.key]} (missing)</option>)}
                    </select>
                  </label>
                </form>
              </>}
              {enc.clarification && <>
                <div className="msg assistant wide" lang="en">
                  {enc.clarification.question}
                  <span className="meta">You asked · {new Date(enc.clarification.askedAt).toLocaleString()}
                    {enc.clarification.draftedBy && enc.clarification.draftedBy !== 'doctor' ? ` · drafted by ${enc.clarification.draftedBy === 'cline-sdk' ? 'Cline agent' : 'template'}, sent by you` : ''}
                    {enc.clarification.fieldKey ? ` · fills “${FIELD_LABELS[enc.clarification.fieldKey]}”` : ''}</span>
                  {enc.clarification.questionForPatient
                    ? <div className="translation" lang={enc.language}><strong>Patient saw ({LANG_LABEL[enc.language]}) · {enc.clarification.questionForPatient.status === 'fixture' ? 'synthetic phrasebook' : 'machine-translated, unverified'}</strong><div>{enc.clarification.questionForPatient.text}</div></div>
                    : enc.language !== 'en' && <span className="meta">Sent in English; no {LANG_LABEL[enc.language]} rendering was available.</span>}
                </div>
                {enc.clarification.answer
                  ? <div className="msg patient wide" lang={enc.clarification.answer.language}><MessageEvidence message={enc.clarification.answer} /></div>
                  : <p className="empty" role="status">Waiting for the patient… this briefing refreshes every few seconds.</p>}
              </>}
            </div>
          </section>
        </>}
      </div>
    </div>
  </>;
}