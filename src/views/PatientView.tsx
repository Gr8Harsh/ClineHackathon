import { useEffect, useRef, useState } from 'react';
import type { AvailableDoctor, Language, Proposal, Snapshot } from '../../shared/types.ts';
import { api } from '../api.ts';
import { SummaryPanel } from '../components/SummaryPanel.tsx';
import { ScreeningPanel } from '../components/ScreeningPanel.tsx';
import { CareRouteBanner } from '../components/CareRouteBanner.tsx';
import { DoctorPicker } from '../components/DoctorPicker.tsx';
import { DocumentPanel } from '../components/DocumentPanel.tsx';
import { TracePanel } from '../components/TracePanel.tsx';
import { MessageEvidence } from '../components/MessageEvidence.tsx';
import { canOfferBooking, focusEvidence, type LoadState } from '../ui.ts';

// Only the synthetic encounter ID is stored; medical content and confirmation tokens never are.
const STORAGE_KEY = 'sehat-demo-encounter-id';

const LANGS: { code: Language; label: string }[] = [
  { code: 'as', label: 'অসমীয়া (Assamese)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'en', label: 'English' },
];

// Synthetic demo prompts. Assamese/Hindi wording requires native-speaker review.
const STARTERS: Record<Language, string[]> = {
  as: ['মোৰ চাৰি দিনৰ পৰা মূৰ বিষাইছে', 'মই দুৰ্বল অনুভৱ কৰিছোঁ'],
  hi: ['मुझे चार दिन से सिरदर्द है', 'मैं कमज़ोर महसूस कर रहा हूँ'],
  en: ['I have had a headache for 4 days', 'I feel weak and tired'],
};

export function PatientView({ active }: { active: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [doctors, setDoctors] = useState<AvailableDoctor[]>([]);
  const [doctorState, setDoctorState] = useState<LoadState>('idle');
  const [doctorError, setDoctorError] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [highlight, setHighlight] = useState('');
  const [answer, setAnswer] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const encounterId = snapshot?.encounter.id ?? null;
  const bookable = snapshot ? canOfferBooking(snapshot) : false;
  const routeKey = snapshot ? `${snapshot.decision.route}|${snapshot.decision.missing.join(',')}|${snapshot.booking?.id ?? ''}` : '';

  // Restore the active encounter after a reload or when returning to this tab.
  useEffect(() => {
    if (!active) return;
    const id = encounterId ?? sessionStorage.getItem(STORAGE_KEY);
    if (!id) return;
    let cancelled = false;
    setRestoring(true);
    api.getEncounter(id)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch(e => {
        if (cancelled) return;
        if (!encounterId) sessionStorage.removeItem(STORAGE_KEY);
        setError(`Could not load the saved encounter: ${(e as Error).message}`);
      })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // A route change, emergency, missing safety answer, or booking invalidates slot choices.
  useEffect(() => {
    setProposal(null); setDoctors([]); setDoctorState('idle'); setDoctorError('');
  }, [routeKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [snapshot?.encounter.messages.length]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  function start(language: Language) {
    void run(async () => {
      const s = await api.createEncounter(language);
      sessionStorage.setItem(STORAGE_KEY, s.encounter.id);
      setSnapshot(s);
    });
  }

  function reset() {
    sessionStorage.removeItem(STORAGE_KEY);
    setSnapshot(null); setInput(''); setAnswer(''); setError('');
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!encounterId || !trimmed || busy) return;
    void run(async () => {
      const res = await api.sendMessage(encounterId, trimmed);
      setSnapshot(res.snapshot); setInput('');
    });
  }

  function showSource(messageId: string) {
    const id = `msg-${messageId}`;
    setHighlight(id); focusEvidence(id);
  }

  async function loadDoctors() {
    if (!snapshot || !bookable) return;
    const mode = snapshot.decision.route === 'video' ? 'video' : 'in-person';
    setDoctorState('loading'); setDoctorError(''); setProposal(null);
    try { setDoctors(await api.doctors(mode)); setDoctorState('success'); }
    catch (e) { setDoctorState('error'); setDoctorError((e as Error).message); }
  }

  function pickSlot(slotId: string) {
    if (!encounterId) return;
    void run(async () => {
      const res = await api.createProposal(encounterId, slotId);
      setSnapshot(res.snapshot); setProposal(res.proposal);
    });
  }

  // One explicit patient action. The token stays in this closure only.
  async function confirmAndBook() {
    if (!encounterId || !proposal) return;
    const ok = await run(async () => {
      const { token } = await api.confirmProposal(proposal.id, encounterId);
      const res = await api.bookProposal(proposal.id, encounterId, token);
      setSnapshot(res.snapshot); setProposal(null);
    });
    if (!ok) { setProposal(null); void loadDoctors(); }
  }

  async function uploadDoc(name: string, text: string) {
    if (!encounterId) return false;
    return run(async () => {
      const res = await api.uploadDocument(encounterId, name, text);
      setSnapshot(res.snapshot);
    });
  }

  if (!snapshot) {
    return <section className="card welcome">
      <div className="body stack">
        <h1>Prepare for a consultation</h1>
        <p>Choose a language. Messages stay in the original language. This guided demo does not provide general translation; any English rendering is labelled unverified.</p>
        <div className="lang-choices">
          {LANGS.map(l => <button key={l.code} lang={l.code} className="btn btn-primary" disabled={busy || restoring} onClick={() => start(l.code)}>{l.label}</button>)}
        </div>
        {(busy || restoring) && <p role="status">{restoring ? 'Restoring saved encounter…' : 'Creating encounter…'}</p>}
        {error && <p className="notice" role="alert">{error}</p>}
      </div>
    </section>;
  }

  const enc = snapshot.encounter;
  const emergency = snapshot.decision.route === 'emergency';
  const pendingQuestion = enc.clarification && !enc.clarification.answer ? enc.clarification : null;

  return <>
    <CareRouteBanner decision={snapshot.decision} booking={snapshot.booking} />
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="row">
      <span className="empty">Encounter {enc.id.slice(0, 8)} · {LANGS.find(l => l.code === enc.language)?.label}</span>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={reset}>Start a new synthetic encounter</button>
    </div>

    {pendingQuestion && <section className="card question-card">
      <header>Your doctor asked a question</header>
      <form className="body stack" onSubmit={e => {
        e.preventDefault();
        if (!answer.trim()) return;
        void run(async () => { setSnapshot(await api.answerClarification(enc.id, answer.trim())); setAnswer(''); });
      }}>
        <p lang="en"><strong>{pendingQuestion.question}</strong></p>
        <p className="empty">The question is shown in English as typed by the doctor; no translation was performed.</p>
        <label className="input-label" htmlFor="clarification-answer">Your answer, in your own language</label>
        <textarea id="clarification-answer" lang={enc.language} rows={3} maxLength={4000} value={answer} disabled={busy} onChange={e => setAnswer(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !answer.trim()}>Send answer to doctor</button>
      </form>
    </section>}

    <div className="grid-2">
      <div className="stack">
        <section className="card chat" aria-label="Intake conversation">
          <header>Intake conversation <span className="sub">original language shown</span></header>
          <div className="scroll" ref={scrollRef} aria-live="polite">
            {enc.messages.map(m => <div key={m.id} id={`msg-${m.id}`} tabIndex={-1} lang={m.language}
              className={`msg ${m.role} ${highlight === `msg-${m.id}` ? 'msg-hl' : ''}`}>
              <MessageEvidence message={m} />
            </div>)}
            {busy && <p className="empty" role="status">Working…</p>}
          </div>
          {!snapshot.booking && !emergency && <div className="chips" aria-label="Synthetic example messages">
            {STARTERS[enc.language].map(s => <button key={s} lang={enc.language} className="chip" disabled={busy} onClick={() => setInput(s)}>{s}</button>)}
          </div>}
          <form className="composer" onSubmit={e => { e.preventDefault(); send(input); }}>
            <label className="sr-only" htmlFor="intake-input">Describe what is wrong</label>
            <input id="intake-input" lang={enc.language} maxLength={4000} value={input} disabled={busy}
              placeholder="Describe what is wrong, in your own words…" onChange={e => setInput(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </section>

        {emergency ? <section className="card emergency-card" role="alert">
          <div className="body">
            <h2>Do not wait for an appointment</h2>
            <p>Call your local emergency number or go to the nearest emergency department now. Routine booking is unavailable while emergency warning signs are recorded.</p>
          </div>
        </section> : snapshot.booking ? null : bookable ? <DoctorPicker
          doctors={doctors} state={doctorState} error={doctorError} onLoad={loadDoctors} onPick={pickSlot}
          proposal={proposal} onConfirm={confirmAndBook} onCancel={() => setProposal(null)} busy={busy}
        /> : <section className="card"><div className="body"><p className="notice">
          Booking is unavailable until the routing questions are answered and the server returns a video or in-person route. Unanswered items are not treated as “no”.
        </p></div></section>}

        <DocumentPanel documents={enc.documents} busy={busy} onUpload={uploadDoc} />
      </div>

      <div className="stack">
        <SummaryPanel fields={enc.fields} messages={enc.messages} busy={busy} onSource={showSource}
          onConfirm={key => void run(async () => setSnapshot(await api.confirmField(enc.id, key)))} />
        <ScreeningPanel screening={enc.screening} busy={busy}
          onChange={body => void run(async () => setSnapshot(await api.setScreening(enc.id, body)))} />
        <TracePanel active={active} />
      </div>
    </div>
  </>;
}