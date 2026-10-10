import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language, Snapshot, AvailableDoctor, Proposal, TraceEvent, LabDocument } from '../../shared/types.ts';
import { api } from '../api.ts';
import { SummaryPanel } from '../components/SummaryPanel.tsx';
import { ScreeningPanel } from '../components/ScreeningPanel.tsx';
import { CareRouteBanner } from '../components/CareRouteBanner.tsx';
import { DoctorPicker } from '../components/DoctorPicker.tsx';
import { DocumentPanel } from '../components/DocumentPanel.tsx';
import { TracePanel } from '../components/TracePanel.tsx';

const LANGS: { code: Language; label: string }[] = [
  { code: 'as', label: 'অসমীয়া (Assamese)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'en', label: 'English' },
];

const STARTERS: Record<Language, string[]> = {
  as: ['মইবাক পাইছো, চাৰি দিনহ’ল', 'মই দুর্বল অনুভৱ কৰিছোঁ', 'চিনিৰ ৰোগ আছে'],
  hi: ['मुझे सीने में दर्द है, चार दिन से', 'मैं कमज़ोर महसूस कर रहा हूँ', 'मुझे डायबिटीज है'],
  en: ['Crushing chest pain for 4 days', 'I feel weak and tired', 'I have diabetes'],
};

export function PatientView() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [lang, setLang] = useState<Language | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<AvailableDoctor[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [docText, setDocText] = useState('');
  const [docName, setDocName] = useState('lab-report.txt');
  const scrollRef = useRef<HTMLDivElement>(null);
  const encounterId = snapshot?.encounter.id ?? null;

  const refreshTraces = useCallback(() => { api.traces().then(setTraces).catch(() => {}); }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [snapshot?.encounter.messages.length]);

  async function start(l: Language) {
    setLang(l); setBusy(true); setError(null);
    try { setSnapshot(await api.createEncounter(l)); refreshTraces(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function send(text: string) {
    if (!encounterId || !text.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api.sendMessage(encounterId, text.trim());
      setSnapshot(res.snapshot); setInput(''); refreshTraces();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function setScreening(body: Parameters<typeof api.setScreening>[1]) {
    if (!encounterId) return;
    try { setSnapshot(await api.setScreening(encounterId, body)); refreshTraces(); }
    catch (e) { setError((e as Error).message); }
  }

  async function confirmField(key: string) {
    if (!encounterId) return;
    try { setSnapshot(await api.confirmField(encounterId, key)); refreshTraces(); }
    catch (e) { setError((e as Error).message); }
  }

  async function loadDoctors() {
    if (!snapshot) return;
    const mode = snapshot.decision.route === 'video' ? 'video' : snapshot.decision.route === 'in-person' ? 'in-person' : undefined;
    try { setDoctors(await api.doctors(mode)); } catch (e) { setError((e as Error).message); }
  }

  async function pickSlot(slotId: string) {
    if (!encounterId) return;
    try {
      const res = await api.createProposal(encounterId, slotId);
      setProposal(res.proposal); setPendingToken(null); setSnapshot(res.snapshot); refreshTraces();
    } catch (e) { setError((e as Error).message); }
  }

  async function confirmBooking() {
    if (!proposal || !encounterId) return;
    try {
      const res = await api.confirmProposal(proposal.id, encounterId);
      setPendingToken(res.token); refreshTraces();
    } catch (e) { setError((e as Error).message); }
  }

  async function finalizeBooking() {
    if (!proposal || !encounterId || !pendingToken) return;
    setBusy(true);
    try {
      const res = await api.bookProposal(proposal.id, encounterId, pendingToken);
      setSnapshot(res.snapshot); setProposal(null); setPendingToken(null); refreshTraces();
    } catch (e) { setError((e as Error).message); refreshTraces(); }
    finally { setBusy(false); }
  }

  async function uploadDoc() {
    if (!encounterId || !docText.trim()) return;
    try {
      const res = await api.uploadDocument(encounterId, docName, docText);
      setSnapshot(res.snapshot); setHighlightLine(null); refreshTraces();
    } catch (e) { setError((e as Error).message); }
  }

  const latestDoc: LabDocument | undefined = snapshot?.encounter.documents.at(-1);
  if (!lang) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
        <header>Start a consultation · এটা পৰামৰ্শ আৰম্ভ কৰক</header>
        <div className="body">
          <p style={{ marginTop: 0, color: 'var(--muted)' }}>
            Choose the language you think in. The doctor’s briefing is prepared in English —
            every translated line is labelled unverified until a human confirms it.
          </p>
          <div className="lang-picker" style={{ flexDirection: 'column' }}>
            {LANGS.map(l => (
              <button key={l.code} className="btn btn-primary" style={{ textAlign: 'left' }} disabled={busy} onClick={() => start(l.code)}>
                {l.label}
              </button>
            ))}
          </div>
          {error && <p className="notice" style={{ marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <>
      {snapshot && <CareRouteBanner decision={snapshot.decision} booking={snapshot.booking} />}
      {error && <div className="notice">{error}</div>}

      <div className="grid-2">
        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card chat">
            <header>Intake conversation <span className="sub">in {LANGS.find(l => l.code === lang)?.label}</span></header>
            <div className="scroll" ref={scrollRef}>
              {snapshot?.encounter.messages.map(m => (
                <div key={m.id} className={`msg ${m.role}`}>
                  {m.text}
                  <span className="meta">
                    {m.role === 'patient' ? 'You' : 'SEHAT assistant'} · {m.translation === 'original' ? 'original language' : m.translation}
                  </span>
                </div>
              ))}
            </div>
            {snapshot && !snapshot.booking && (
              <div className="chips">
                {STARTERS[lang].map(s => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            <div className="composer">
              <input
                value={input}
                placeholder={busy ? 'Thinking…' : 'Describe what is wrong, in your own words…'}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send(input)}
              />
              <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={() => send(input)}>Send</button>
            </div>
          </section>

          {snapshot && (
            <DoctorPicker
              decision={snapshot.decision} doctors={doctors} loading={!doctors.length}
              onLoad={loadDoctors} onPick={pickSlot} proposal={proposal} pendingToken={pendingToken}
              onConfirm={confirmBooking} onFinalize={finalizeBooking} busy={busy}
            />
          )}

          {snapshot && (
            <DocumentPanel
              docText={docText} docName={docName} doc={latestDoc} highlightLine={highlightLine}
              onName={setDocName} onText={setDocText} onUpload={uploadDoc} onHighlight={setHighlightLine}
            />
          )}
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          {snapshot && (
            <SummaryPanel
              fields={snapshot.encounter.fields}
              onConfirm={confirmField}
              onSource={msgId => {
                const idx = snapshot.encounter.messages.findIndex(m => m.id === msgId);
                if (idx >= 0) scrollRef.current?.scrollTo({ top: idx * 60, behavior: 'smooth' });
              }}
            />
          )}
          {snapshot && <ScreeningPanel screening={snapshot.encounter.screening} onChange={setScreening} />}
          <TracePanel traces={traces} />
        </div>
      </div>
    </>
  );
}

