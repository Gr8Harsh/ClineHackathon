import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardList, FileText, MessageCircle, Search, Send, ShieldCheck, SlidersHorizontal, Sparkles, Sprout, Video } from 'lucide-react';
import type { AvailableDoctor, Encounter, FieldKey, Language, Message, Proposal, Slot, Snapshot, TraceEvent } from '../../shared/types.ts';
import { FIELD_LABELS } from '../../shared/types.ts';
import { api, type EncounterMeta, type GateProbeResult } from '../api.ts';
import { Button } from '../components/ui/button.tsx';
import { cn } from '../lib/utils.ts';
import { formatAppointment } from '../ui.ts';
import { Avatar } from './PatientScreens.tsx';

const LANG_LABEL: Record<Language, string> = { en: 'English', hi: 'Hindi', as: 'Assamese' };

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-slate-200 bg-white p-5 sm:p-6', className)}>{children}</section>;
}
export function Chip({ kind, children }: { kind: 'patient' | 'document' | 'missing' | 'asked'; children: ReactNode }) {
  return <span className={cn('provenance-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium',
    kind === 'patient' ? 'bg-green-100' : kind === 'document' ? 'border border-green-700' : kind === 'missing' ? 'bg-amber-100 text-amber-900' : 'border border-dashed border-green-300')}>
    {kind === 'patient' ? <Check size={14} /> : kind === 'document' ? <FileText size={14} /> : <CircleHelp size={14} />}{children}
  </span>;
}

/** Short IST label for slot buttons. */
export function slotLabel(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
const avatarIndex = (doctors: AvailableDoctor[], d: AvailableDoctor) => Math.max(0, doctors.findIndex(x => x.id === d.id));
const openSlots = (d: AvailableDoctor) => d.status === 'available' ? d.slots.length : 0;

// ---------- Patient home ----------
export function OliveHome({ doctors, snapshot, onChat, onDirectory, onNotes, onNotifications, onDoctor, hasNotice }: {
  doctors: AvailableDoctor[]; snapshot: Snapshot | null; hasNotice: boolean;
  onChat: () => void; onDirectory: () => void; onNotes: () => void; onNotifications: () => void; onDoctor: (d: AvailableDoctor) => void;
}) {
  const specialties = ['All Specialties', ...new Set(doctors.map(d => d.specialty))];
  const [specialty, setSpecialty] = useState('All Specialties');
  const visible = doctors.filter(d => specialty === 'All Specialties' || d.specialty === specialty);
  const filled = snapshot?.encounter.conversation?.fields.filter(f => f.status === 'answered').length ?? 0;
  return <div className="home-screen">
    <div className="home-greeting"><Avatar patient /><div><p>Namaste,</p><strong>{snapshot?.encounter.name ?? 'Synthetic patient'}</strong></div><button className="notification-button" aria-label="Notifications" onClick={onNotifications}><Bell size={19} />{hasNotice && <i />}</button></div>
    <h1>How are you feeling<br />today? <span aria-hidden="true">☀️</span></h1>
    <button className="wellness-banner" onClick={onNotes}><span className="wellness-tile"><small>Your health notes</small><strong>{snapshot ? `${filled} recorded` : 'Let’s begin'}</strong><Sprout aria-hidden="true" /></span><span className="wellness-copy"><strong>{snapshot?.booking ? 'Appointment booked' : 'Ready for your visit?'}</strong><span>{snapshot?.booking ? `${snapshot.booking.doctorName} · ${slotLabel(snapshot.booking.startsAt)}` : 'Your words, their sources, nothing filled in for you.'}</span><small>Open notes <ChevronRight size={12} /></small></span></button>
    <div className="consultation-cards"><section><h2>Online Doctor<br />Consultation</h2><p>Talk to Sehat Sathi and prepare your consultation notes.</p><Button onClick={onChat}>Start with AI</Button></section><section><h2>Visit a Doctor<br />Offline</h2><p>Fictional doctors with real open slots from the database.</p><Button onClick={onDirectory}>Appointment</Button></section></div>
    <div className="specialty-tabs" aria-label="Doctor specialties">{specialties.map(s => <button key={s} aria-pressed={specialty === s} onClick={() => setSpecialty(s)}>{s}</button>)}</div>
    <div className="section-heading"><h2>Available Doctors</h2><button onClick={onDirectory}>See all</button></div>
    <div className="home-doctors">{visible.map(d => <div className="home-doctor" key={d.id}><Avatar index={avatarIndex(doctors, d)} /><div><strong>{d.name}</strong><span>{d.specialty} · {openSlots(d) ? `${openSlots(d)} open slots` : 'offline'}</span></div><button onClick={() => onDoctor(d)}>View Profile</button></div>)}
      {!doctors.length && <p className="directory-empty">Loading doctors from the server…</p>}</div>
  </div>;
}

// ---------- Directory ----------
export function OliveDirectory({ doctors, error, onRetry, onDoctor }: { doctors: AvailableDoctor[]; error: string; onRetry: () => void; onDoctor: (d: AvailableDoctor) => void }) {
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [specialty, setSpecialty] = useState('All Specialties');
  const visible = doctors.filter(d => (specialty === 'All Specialties' || d.specialty === specialty) && `${d.name} ${d.specialty} ${d.location} ${d.languages}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className="directory-screen">
    <div className="doctor-search"><label><Search size={18} /><input aria-label="Search doctors" placeholder="Search name, town or language" value={search} onChange={e => setSearch(e.target.value)} /></label><button aria-label="Filter doctors" aria-expanded={filterOpen} onClick={() => setFilterOpen(v => !v)}><SlidersHorizontal size={18} /></button></div>
    {filterOpen && <label className="directory-filter">Specialty<select aria-label="Filter by specialty" value={specialty} onChange={e => setSpecialty(e.target.value)}>{['All Specialties', ...new Set(doctors.map(d => d.specialty))].map(s => <option key={s}>{s}</option>)}</select></label>}
    <h2>Doctors</h2>
    <p className="directory-disclaimer">Fictional clinicians · real database availability · not a clinical recommendation</p>
    {error && <div className="directory-empty" role="alert"><p>{error}</p><Button variant="outline" onClick={onRetry}>Retry</Button></div>}
    <div className="directory-list">{visible.map(d => <button className="directory-doctor" key={d.id} onClick={() => onDoctor(d)}><Avatar index={avatarIndex(doctors, d)} /><span className="directory-doctor-name"><strong>{d.name}</strong><span>{d.specialty} · {d.location}</span></span><span className="availability">{openSlots(d) ? <><i />{openSlots(d)} slots</> : 'Offline'}</span></button>)}
      {!visible.length && !error && <p className="directory-empty" role="status">No matching doctors. Try another name or specialty.</p>}</div>
    <p className="directory-disclaimer directory-bottom">A proposal never holds a slot. Availability is rechecked when you confirm.</p>
  </div>;
}

// ---------- Doctor profile body (inside a bottom sheet) ----------
export function DoctorProfile({ doctor, doctors, snapshot, onPick, busy }: { doctor: AvailableDoctor; doctors: AvailableDoctor[]; snapshot: Snapshot | null; onPick: (s: Slot) => void; busy: boolean }) {
  const ready = Boolean(snapshot?.encounter.conversation?.bookingReady) && !snapshot?.booking;
  const route = snapshot?.decision.route;
  const slots = doctor.status === 'available' ? doctor.slots.filter(s => route !== 'video' && route !== 'in-person' ? true : s.mode === route) : [];
  return <>
    <div className="profile-doctor"><Avatar index={avatarIndex(doctors, doctor)} /><div><h2>{doctor.name}</h2><p>{doctor.specialty}</p></div></div>
    <p>{doctor.location} · {doctor.languages}</p>
    <p>Fee ₹{doctor.fee} · {doctor.video ? 'video and in-person' : 'in-person only'} · {doctor.status === 'available' ? 'available' : 'offline'}</p>
    {!snapshot && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">Start with the AI assistant first. Booking needs your consultation details and the safety check.</p>}
    {snapshot && !ready && !snapshot.booking && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Booking opens after your consultation details and safety check are complete. Still needed: {snapshot.decision.missing.slice(0, 3).join('; ') || snapshot.decision.title}.</p>}
    {snapshot?.booking && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">You already have an appointment: {snapshot.booking.doctorName}, {slotLabel(snapshot.booking.startsAt)}.</p>}
    <h3>Open times · IST{route === 'video' || route === 'in-person' ? ` · ${route} (your care route)` : ''}</h3>
    {slots.length ? <div className="profile-times">{slots.slice(0, 6).map(s => <Button variant="outline" key={s.id} disabled={!ready || busy} onClick={() => onPick(s)}>{slotLabel(s.startsAt)} · {s.mode}</Button>)}</div>
      : <p>No open times for this doctor{route === 'video' || route === 'in-person' ? ` in ${route} mode` : ''}.</p>}
  </>;
}

export function ReviewBody({ proposal, error, busy, onConfirm, onCancel }: { proposal: Proposal; error: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const expired = Date.parse(proposal.expiresAt) <= now;
  return <>
    <div className="space-y-3 rounded-2xl bg-slate-50 p-4"><p className="font-semibold">{proposal.doctorName}</p><p className="flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={16} />{formatAppointment(proposal.startsAt)}</p><p className="flex items-center gap-2 text-sm text-slate-600"><Video size={16} />{proposal.mode} consultation</p><p className="text-sm text-slate-600">Fee <strong className="float-right">₹{proposal.fee}</strong></p></div>
    <p className="text-sm text-slate-500">Nothing is booked yet. The server rechecks availability when you confirm; another patient may book first.</p>
    {expired && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This proposal expired. Choose a time again.</p>}
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    <Button disabled={busy || expired} onClick={onConfirm}>{busy ? 'Booking…' : 'Confirm and book'} <Check /></Button>
    <Button variant="outline" disabled={busy} onClick={onCancel}>Not now</Button>
  </>;
}

export function AppointmentReceipt({ snapshot }: { snapshot: Snapshot }) {
  const b = snapshot.booking!;
  return <Card className="text-center"><CheckCircle2 className="mx-auto mb-3 text-green-600" size={40} /><h2 className="text-xl font-semibold">Appointment booked</h2><p className="mt-2 text-slate-600">{b.doctorName} · {slotLabel(b.startsAt)} IST</p><p className="mt-1 text-sm text-slate-500">{b.mode} · ₹{b.fee}</p><p className="my-4 rounded-xl bg-green-50 p-3 text-xs text-green-800">Booking ID {b.id.slice(0, 8)} · created atomically after your explicit confirmation.</p></Card>;
}

// ---------- Doctor question shown to the patient ----------
export function DoctorQuestionCard({ encounter, onAnswered }: { encounter: Encounter; onAnswered: (s: Snapshot) => void }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = encounter.clarification;
  if (!c) return null;
  return <Card className="!border-green-200"><span className="text-xs font-semibold uppercase tracking-wider text-green-700">A question from your doctor</span>
    {c.questionForPatient && <h3 className="mt-2 font-semibold" lang={encounter.language}>{c.questionForPatient.text}</h3>}
    <p className={cn(c.questionForPatient ? 'mt-1 text-sm text-slate-500' : 'mt-2 font-semibold')} lang="en">{c.questionForPatient ? `Doctor’s original (English): ${c.question}` : c.question}</p>
    <p className="mt-1 text-xs text-slate-400">{c.questionForPatient ? c.questionForPatient.status === 'fixture' ? 'Translation from the synthetic phrasebook' : 'Machine-translated, unverified' : 'Shown as the doctor typed it'}</p>
    {c.answer ? <p className="mt-3 text-sm text-slate-600">Your answer: <span lang={c.answer.language}>{c.answer.text}</span></p>
      : <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); if (!answer.trim() || busy) return; setBusy(true); setError('');
        api.answerClarification(encounter.id, answer.trim()).then(s => { onAnswered(s); setAnswer(''); }).catch(err => setError((err as Error).message)).finally(() => setBusy(false)); }}>
        <input value={answer} lang={encounter.language} onChange={e => setAnswer(e.target.value)} aria-label="Answer your doctor" placeholder="Answer in your own words…" maxLength={4000} className="!border-slate-200" />
        <Button type="submit" size="icon" disabled={busy || !answer.trim()} aria-label="Send answer to doctor"><Send /></Button></form>}
    {error && <p role="alert" className="mt-2 text-sm text-amber-900">{error}</p>}
  </Card>;
}

// ---------- Consultation notes (real conversation fields) ----------
export function OliveNotes({ encounter, documents }: { encounter: Encounter; documents?: ReactNode }) {
  const fields = encounter.conversation?.fields ?? [];
  const source = (id: string | null) => encounter.messages.find(m => m.id === id);
  return <div className="space-y-4">
    <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-green-50 text-green-700"><ClipboardList size={22} /></div><div><h2 className="text-xl font-semibold tracking-tight">Your consultation notes</h2><p className="text-sm text-slate-500">Your words. Their sources. Nothing filled in for you.</p></div></div>
    <Card className="!p-0 overflow-hidden"><div className="divide-y divide-slate-100">
      {fields.map(f => { const msg = source(f.sourceId); return <div key={f.id} className={cn('p-5', f.status === 'not_asked' && 'bg-amber-50/60')}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-slate-500">{f.label}{!f.required && ' (optional)'}</span>
          {f.status === 'answered' ? <Chip kind="patient">{msg?.role === 'patient' && encounter.clarification?.answer?.id === msg.id ? 'Patient reported · answered doctor' : 'Patient reported'}</Chip>
            : f.status === 'unknown' ? <Chip kind="asked">Patient did not know</Chip> : f.status === 'declined' ? <Chip kind="asked">Preferred not to say</Chip>
            : f.status === 'asked_unanswered' ? <Chip kind="asked">Asked · no answer</Chip> : <Chip kind="missing">Not asked</Chip>}</div>
        <p className={cn('evidence-line text-base', !f.value && 'text-slate-400')}>{f.value ?? 'Not recorded, not the same as none.'}</p>
        {msg && <details className="mt-2 text-sm text-slate-500"><summary>View source · original words</summary><p lang={msg.language} className="mt-1 text-slate-700">“{f.quote ?? msg.text}”</p>{msg.english && <p lang="en" className="mt-1">English · {msg.translation === 'fixture' ? 'phrasebook' : 'unverified'}: {msg.english}</p>}</details>}
      </div>; })}
      {!fields.length && <p className="p-5 text-slate-500">Start chatting with Sehat Sathi to build your notes.</p>}
    </div></Card>
    {documents}
    <div className="flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-800"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p>Labels show where information came from, not whether it is medically correct. Not a diagnosis.</p></div>
  </div>;
}

// ---------- Clinician workspace (real encounters) ----------
const ASK_PROMPTS: Record<FieldKey, string> = {
  medications: 'Any blood thinners?', allergies: 'Any allergies to medicines?', history: 'Any long-term conditions, like diabetes or high blood pressure?',
  duration: 'How long have you had this problem?', concern: 'What is the main problem you want to discuss?',
};
function Evidence({ message }: { message: Message }) {
  return <div className="rounded-xl bg-slate-50 p-4 text-sm">
    {message.english ? <div className="grid gap-3 sm:grid-cols-2"><div lang={message.language}><p className="text-xs text-slate-400">Original · {LANG_LABEL[message.language]}</p><p className="mt-1">“{message.text}”</p></div><div lang="en"><p className="text-xs text-slate-400">English · {message.translation === 'fixture' ? 'synthetic phrasebook' : 'machine-translated, unverified'}</p><p className="mt-1">{message.english}</p></div></div>
      : <><p lang={message.language}>“{message.text}”</p>{message.language !== 'en' && <p className="mt-1 text-xs text-slate-400">English rendering unavailable; original shown.</p>}</>}
  </div>;
}
export function ClinicianWorkspace() {
  const [list, setList] = useState<EncounterMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [question, setQuestion] = useState('');
  const [fieldKey, setFieldKey] = useState<FieldKey | ''>('');
  const [draftedBy, setDraftedBy] = useState<'doctor' | 'cline-sdk' | 'template'>('doctor');
  const [draftNote, setDraftNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selection = useRef<string | null>(null);
  async function loadList() { try { setList(await api.listEncounters()); } catch (e) { setError((e as Error).message); } }
  async function load(id: string) { try { const s = await api.getEncounter(id); if (selection.current === id) setSnap(s); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { void loadList(); }, []);
  useEffect(() => { selection.current = selected; setSnap(null); setQuestion(''); setFieldKey(''); setDraftNote(''); if (selected) void load(selected); }, [selected]);
  const waiting = Boolean(snap?.encounter.clarification && !snap.encounter.clarification.answer);
  useEffect(() => {
    if (!waiting || !selected) return;
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load(selected); }, 4000);
    return () => clearInterval(t);
  }, [waiting, selected]);
  const enc = snap?.encounter;
  const missing = enc?.fields.filter(f => f.value === null && f.key !== 'concern') ?? [];
  async function act(fn: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <main className="doctor-workspace mx-auto max-w-6xl px-5 py-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-green-700">Clinician workspace · synthetic data</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">A clearer start to your consultation.</h1></div><Button variant="outline" onClick={() => void loadList()}>Refresh list</Button></div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
      <Card className="!p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Patients</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{list.length}</span></div>
        <div className="space-y-2">{list.map(e => <button key={e.id} aria-pressed={selected === e.id} onClick={() => setSelected(e.id)} className={cn('w-full rounded-xl border p-4 text-left', selected === e.id ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white')}>
          <span className="text-xs text-green-700">{e.booked ? 'Appointment booked' : 'Not booked'}{e.assistedBy ? ' · assisted' : ''}</span><strong className="mt-1 block font-medium">{e.name} · {e.id.slice(0, 6)}</strong><span className="mt-1 block text-xs text-slate-500">{LANG_LABEL[e.language]} · {new Date(e.createdAt).toLocaleString()}</span></button>)}
          {!list.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No patients yet. Start a conversation in the patient view.</p>}</div></Card>
      <div className="space-y-5">
        {!enc && <Card><p className="text-slate-500">{selected ? 'Loading briefing…' : 'Select a patient to see their briefing.'}</p></Card>}
        {enc && snap && <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{enc.name}</h2><p className="text-sm text-slate-500">Patient language: {LANG_LABEL[enc.language]} · original evidence preserved</p></div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500">{snap.booking ? `${snap.booking.mode} · ${slotLabel(snap.booking.startsAt)}` : snap.decision.title}</span></div>
          {snap.decision.route === 'emergency' && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">Emergency warning signs recorded: {snap.decision.triggered.join('; ')}</p>}
          <OliveNotes encounter={enc} />
          {missing.length > 0 && <Card><h3 className="mb-2 font-semibold">Gaps in the briefing</h3><div className="flex flex-wrap gap-2">{missing.map(f => <Button key={f.key} variant="outline" disabled={Boolean(enc.clarification)} onClick={() => { setFieldKey(f.key); setQuestion(ASK_PROMPTS[f.key]); setDraftedBy('doctor'); setDraftNote(''); }}>Ask about {FIELD_LABELS[f.key].toLowerCase()}</Button>)}</div></Card>}
          <Card><div className="mb-3 flex items-center gap-2"><MessageCircle size={18} className="text-green-700" /><h3 className="font-semibold">One clarifying question</h3></div>
            {enc.clarification ? <div className="space-y-3">
              <p>{enc.clarification.question}</p>
              <p className="text-xs text-slate-400">{enc.clarification.draftedBy && enc.clarification.draftedBy !== 'doctor' ? `Drafted by ${enc.clarification.draftedBy === 'cline-sdk' ? 'the Cline agent' : 'template'}, sent by you` : 'Written by you'}{enc.clarification.fieldKey ? ` · fills “${FIELD_LABELS[enc.clarification.fieldKey]}”` : ''}{enc.clarification.questionForPatient ? ` · patient saw it in ${LANG_LABEL[enc.language]} (${enc.clarification.questionForPatient.status === 'fixture' ? 'phrasebook' : 'unverified'})` : ''}</p>
              {enc.clarification.answer ? <Evidence message={enc.clarification.answer} /> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600" role="status">Waiting for the patient… refreshes every few seconds.</p>}
            </div> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!question.trim()) return; void act(async () => {
              const s = await api.askClarification(enc.id, question.trim(), fieldKey || undefined, draftedBy); setSnap(s); setQuestion('');
            }); }}>
              <div className="flex flex-wrap gap-3"><input maxLength={500} value={question} onChange={e => { setQuestion(e.target.value); setDraftedBy('doctor'); }} aria-label="Question for patient" placeholder="For example: Any blood thinners?" className="!min-w-0 !flex-1 !border-slate-200" />
                <Button type="submit" disabled={busy || !question.trim()}>Send question <Send /></Button></div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <Button type="button" variant="outline" disabled={busy || !missing.length} onClick={() => void act(async () => { const d = await api.draftClarification(enc.id); setQuestion(d.question); setFieldKey(d.fieldKey ?? ''); setDraftedBy(d.draftedBy); setDraftNote(d.note); })}><Sparkles />Draft with Cline agent</Button>
                <label className="flex items-center gap-2">Answer fills <select value={fieldKey} onChange={e => setFieldKey(e.target.value as FieldKey | '')}><option value="">no field</option>{missing.map(f => <option key={f.key} value={f.key}>{FIELD_LABELS[f.key]}</option>)}</select></label>
              </div>
              {draftNote && <p className="text-xs text-slate-400">{draftNote}</p>}
            </form>}
          </Card>
          {enc.documents.length > 0 && <Card><h3 className="mb-2 font-semibold">Patient-shared reports · unverified</h3>{enc.documents.map(d => <div key={d.id} className="mt-2 text-sm"><strong>{d.name}</strong>{d.observations.map(o => <p key={o.id}>{o.name}: {o.value} {o.unit} · line {o.line}</p>)}</div>)}</Card>}
        </>}
      </div>
    </div>
  </main>;
}

// ---------- Demo tools: live traces + safety probe ----------
export function DemoTools({ encounterId }: { encounterId: string | null }) {
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState<GateProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const t = await api.traces(); if (!cancelled) { setTraces(t.slice(0, 40)); setError(''); } }
      catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) timer = setTimeout(poll, 3000); }
    }
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  return <>
    {encounterId && <div className="space-y-2"><p className="text-sm">Safety probe: try to book with no patient confirmation.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setBusy(true); api.gateProbe(encounterId, 'agent').then(setProbe).catch(e => setError((e as Error).message)).finally(() => setBusy(false)); }}>Ask the Cline agent to book</Button>
        <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); api.gateProbe(encounterId, 'direct').then(setProbe).catch(e => setError((e as Error).message)).finally(() => setBusy(false)); }}>Call book_slot directly</Button></div>
      {probe && <p role="status" className="rounded-xl bg-green-50 p-3 text-xs text-green-800">{probe.booking ? 'A booking exists for this encounter.' : 'No booking was created.'} {probe.via === 'cline-sdk' ? (probe.calledBookSlot ? 'The agent called book_slot.' : 'The agent chose not to call book_slot.') : 'Direct tool call (no LLM).'} {probe.outcome.slice(0, 240)}</p>}
    </div>}
    <div className="trace-panel"><p>ACTUAL EVENTS · Cline SDK and application · refreshes every 3 s</p>
      {error && <p role="alert">Trace refresh failed: {error}</p>}
      {traces.map(t => <p key={t.id}>{new Date(t.at).toLocaleTimeString()}  {t.origin === 'cline-sdk' ? 'cline' : 'app'}  {t.name}  {t.status}  {t.detail}</p>)}
      {!traces.length && <p>No events yet.</p>}
    </div>
  </>;
}

export function AssistantAppointment({ snapshot, onOpen }: { snapshot: Snapshot; onOpen: () => void }) {
  const b = snapshot.booking;
  if (!b) return null;
  return <div className="chat-message assistant"><span className="assistant-ring" /><div className="message-bubble"><div className="embedded-appointment"><p className="booking-card-label"><CalendarDays size={15} />Doctor Booking</p><div className="booking-card-content"><div className="booking-card-doctor"><Avatar /><div><strong>{b.doctorName}</strong><small>Booking {b.id.slice(0, 8)} · ₹{b.fee}</small></div></div><p><CalendarDays size={14} />{slotLabel(b.startsAt)} IST</p><p><Video size={14} />{b.mode}</p><Button onClick={onOpen}>View appointment <ArrowUpRight size={14} /></Button><small>Confirmed by you · created atomically</small></div></div></div></div>;
}
