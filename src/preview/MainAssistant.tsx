import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, ClipboardList, FileText, Home, MessageCircle, Mic, Paperclip, Send, Settings, Stethoscope } from 'lucide-react';
import type { AvailableDoctor, Language, Proposal, Slot } from '../../shared/types.ts';
import { useConversation } from '../hooks/useConversation.ts';
import { AssistantOrb } from './AssistantOrb.tsx';
import { VoiceScreen } from './VoiceScreen.tsx';
import { ScreeningPanel } from '../components/ScreeningPanel.tsx';
import { TemporaryRelief } from '../components/TemporaryRelief.tsx';
import { api } from '../api.ts';
import { Button } from '../components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog.tsx';
import type { PreviewLanguage } from './fixtures.ts';
import { ReportUpload } from './reports/ReportUpload.tsx';
import type { Report } from './reports/parser.ts';
import { AppointmentReceipt, AssistantAppointment, Card, ClinicianWorkspace, DemoTools, DoctorProfile, DoctorQuestionCard, OliveDirectory, OliveHome, OliveNotes, ReviewBody } from './OliveScreens.tsx';

type Screen = 'home' | 'directory' | 'notes' | 'appointment';

export function MainAssistant() {
  const [role, setRole] = useState<'patient' | 'doctor'>('patient');
  const [tab, setTab] = useState<'assistant' | 'patient'>('assistant');
  const [screen, setScreen] = useState<Screen>('home');
  const [language, setLanguage] = useState<Language>('en');
  const [input, setInput] = useState('');
  const [voice, setVoice] = useState(false);
  const [error, setError] = useState('');
  const [screeningBusy, setScreeningBusy] = useState(false);
  const [optionalField, setOptionalField] = useState('age');
  const [optionalValue, setOptionalValue] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportShared, setReportShared] = useState(false);
  const [doctors, setDoctors] = useState<AvailableDoctor[]>([]);
  const [doctorError, setDoctorError] = useState('');
  const [profile, setProfile] = useState<AvailableDoctor | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [bookingError, setBookingError] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const chat = useConversation(language);
  const end = useRef<HTMLDivElement>(null);
  const welcome = !chat.snapshot && !chat.pending.length;
  const enc = chat.snapshot?.encounter;
  const emergency = chat.snapshot?.decision.route === 'emergency';
  const last = chat.messages.filter(m => m.role === 'assistant').at(-1);
  const doctorQuestion = enc?.clarification && !enc.clarification.answer ? enc.clarification : null;
  const idle = !chat.busy && !chat.pending.length;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    end.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'instant' : 'smooth' });
  }, [chat.messages.length, chat.pending, chat.busy, tab]);
  useEffect(() => { if (enc) setLanguage(enc.language); }, [enc?.id]);

  async function loadDoctors() {
    setDoctorError('');
    try { setDoctors(await api.doctors()); } catch (e) { setDoctorError(`Doctors could not be loaded: ${(e as Error).message}`); }
  }
  useEffect(() => { void loadDoctors(); }, [chat.snapshot?.booking?.id]);
  // Pick up a doctor's question while the patient keeps the app open.
  useEffect(() => {
    if (!enc || !idle || role !== 'patient') return;
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void chat.refresh(); }, 5000);
    return () => clearInterval(t);
  }, [enc?.id, idle, role]);

  function send(text: string) { chat.send(text); setInput(''); }
  function openPatient(next: Screen) { setRole('patient'); setTab('patient'); setScreen(next); setMenuOpen(false); }

  async function pick(slot: Slot) {
    if (!enc || bookingBusy) return;
    setBookingBusy(true); setBookingError('');
    try {
      const res = await api.createProposal(enc.id, slot.id);
      chat.updateSnapshot(res.snapshot); setProfile(null); setProposal(res.proposal);
    } catch (e) { setBookingError((e as Error).message); }
    finally { setBookingBusy(false); }
  }
  async function confirmBooking() {
    if (!enc || !proposal || bookingBusy) return;
    setBookingBusy(true); setBookingError('');
    try {
      const approved = await api.confirmProposal(proposal.id, enc.id);
      const booked = await api.bookProposal(proposal.id, enc.id, approved.token);
      chat.updateSnapshot(booked.snapshot); setProposal(null); openPatient('appointment');
    } catch (e) {
      // A lost response is not proof the write failed: reconcile, never rebook automatically.
      await chat.refresh();
      setBookingError((e as Error).message);
    } finally { setBookingBusy(false); }
  }
  async function shareReport() {
    if (!enc || !report) return;
    const text = report.observations.map(o => `${o.name}: ${o.value} ${o.unit}`.trim()).join('\n');
    if (!text) { setError('No values were extracted, so there is nothing to share.'); return; }
    try { const res = await api.uploadDocument(enc.id, report.name, text); chat.updateSnapshot(res.snapshot); setReportShared(true); }
    catch (e) { setError((e as Error).message); }
  }

  if (role === 'doctor') return <div className="sehat-preview clinician-preview">
    <header className="screen-header"><button className="round-control" aria-label="Back to patient view" onClick={() => setRole('patient')}><ArrowLeft size={20} /></button><h1>Clinician workspace</h1><button className="round-control" aria-label="Open profile menu" onClick={() => setMenuOpen(true)}><Settings size={19} /></button></header>
    <ClinicianWorkspace />
    <footer className="preview-footer"><p>Synthetic data · real server · not a diagnostic tool.</p><button onClick={() => setToolsOpen(true)}>Demo tools</button></footer>
    {menu()}{tools()}
  </div>;

  return <div className="sehat-preview patient-preview">
    <div className="primary-tabs" role="tablist" aria-label="Main views">{(['assistant', 'patient'] as const).map(t => <button key={t} id={`${t}-tab`} role="tab" aria-selected={t === tab} tabIndex={t === tab ? 0 : -1} aria-controls="main-view-panel" onClick={() => setTab(t)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); const next = e.key === 'Home' ? 'assistant' : e.key === 'End' ? 'patient' : t === 'assistant' ? 'patient' : 'assistant';
      setTab(next); document.getElementById(`${next}-tab`)?.focus();
    }}>{t === 'assistant' ? <MessageCircle size={16} /> : <Home size={16} />}{t === 'assistant' ? 'AI assistant' : 'Patient'}</button>)}</div>
    <header className="screen-header">
      {tab === 'patient' && screen !== 'home' ? <button className="round-control" aria-label="Back to home" onClick={() => setScreen('home')}><ArrowLeft size={20} /></button> : <span className="header-spacer" aria-hidden="true" />}
      <h1>{tab === 'assistant' ? 'Sehat Sathi' : screen === 'directory' ? 'Make an appointment' : screen === 'notes' ? 'Your consultation notes' : screen === 'appointment' ? 'Your appointment' : 'SEHAT OS'}</h1>
      <select className="header-language" aria-label="Patient language" value={language} disabled={Boolean(chat.snapshot || chat.pending.length)} onChange={e => setLanguage(e.target.value as Language)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="as">অসমীয়া</option></select>
      <button className="round-control" aria-label="Open profile menu" onClick={() => setMenuOpen(true)}><Settings size={19} /></button>
    </header>
    <main className="patient-shell" id="main-view-panel" role="tabpanel" aria-labelledby={`${tab}-tab`}>
      <p className="main-demo-notice">Synthetic demo only. Do not enter real medical information. This assistant does not diagnose or prescribe.</p>
      <div hidden={tab !== 'assistant'}>
        {emergency && <section className="mb-4 rounded-2xl bg-red-700 p-6 text-white" role="alert"><AlertTriangle size={40} strokeWidth={1.5} className="mb-3" /><h2 className="text-2xl font-semibold">Seek emergency care now.</h2><p className="mt-3 text-red-50">{chat.snapshot!.decision.explanation}</p><p className="mt-3 rounded-xl bg-red-800/50 p-3 text-sm text-red-100">Routine booking is switched off. SEHAT OS cannot diagnose or rule out an emergency.</p></section>}
        {doctorQuestion && enc && <div className="mb-4"><DoctorQuestionCard encounter={enc} onAnswered={chat.updateSnapshot} /></div>}
        <section className={`assistant-conversation ${welcome ? 'assistant-welcome' : ''}`}>
          <div className="chat-scroll" aria-live="polite">
            {welcome && <div className="assistant-welcome-content"><AssistantOrb /><h2>How are you feeling?</h2><p>Share your symptoms. We’ll prepare your consultation, one question at a time.</p></div>}
            {chat.messages.map(m => <div className={`chat-message ${m.role}`} key={m.id}><div className="message-bubble"><p lang={m.language}>{m.text}</p>{m.english && m.role === 'patient' && <p lang="en" className="text-xs opacity-80">English · {m.translation === 'fixture' ? 'phrasebook' : 'unverified'}: {m.english}</p>}<small>{m.role === 'patient' ? (enc?.clarification?.answer?.id === m.id ? 'You · answer to your doctor' : 'You · original message') : m.replyOrigin === 'cline' ? 'Sehat Sathi · Cline' : m.replyOrigin === 'safety' ? 'Server safety response' : 'Application response'}</small>{m.replyOrigin === 'fixture' && <small className="fixture-badge" title={m.fallbackReason}>fixture · {m.fallbackReason?.replaceAll('_', ' ')}</small>}</div></div>)}
            {chat.pending.map(m => <div key={m.id} className="chat-message patient"><div className="message-bubble"><p lang={m.language}>{m.text}</p><small>{m.status}</small>{m.status === 'failed' && <><p role="alert">{m.error}</p><button onClick={() => chat.retry(m.id)}>Tap to retry</button></>}</div></div>)}
            {chat.busy && <div className="chat-message assistant" role="status" aria-label="Assistant is typing"><div className="message-bubble typing-dots"><span /><span /><span /><span className="sr-only">Assistant is typing</span></div></div>}
            {chat.snapshot?.booking && <AssistantAppointment snapshot={chat.snapshot} onOpen={() => openPatient('appointment')} />}
            <div ref={end} />
          </div>
          <div className="chat-composer-area">
            {idle && !emergency && <div className="answer-choices">{last?.quickReplies?.map(q => <Button variant="outline" key={q} onClick={() => send(q)}>{q}</Button>)}</div>}
            {idle && !emergency && enc?.conversation?.intakeComplete && !chat.snapshot?.booking && <div className="answer-choices"><Button variant="outline" onClick={() => openPatient('notes')}><ClipboardList />Review notes and safety check</Button><Button variant="outline" onClick={() => openPatient('directory')}><CalendarDays />Find a doctor</Button></div>}
            <form className="chat-composer" onSubmit={e => { e.preventDefault(); send(input); }}><div className="composer-input"><input aria-label="Your answer" maxLength={4000} value={input} onChange={e => setInput(e.target.value)} placeholder={welcome ? 'Tell me how you’re feeling…' : 'Your answer…'} /><small>{input.length}/4000</small></div><div className="composer-actions"><Button variant="ghost" aria-label="Attach a text report" onClick={() => setReportOpen(true)}><Paperclip />Attach file</Button><Button variant="ghost" onClick={() => openPatient('notes')}><ClipboardList />Notes</Button><Button variant="ghost" aria-label="Start voice input" onClick={() => setVoice(true)}><Mic /></Button><Button type="submit" aria-label="Send answer" disabled={!input.trim()}><Send /></Button></div></form>
          </div>
        </section>
        {chat.snapshot && !emergency && <TemporaryRelief snapshot={chat.snapshot} onSnapshot={chat.updateSnapshot} disabled={chat.busy || chat.pending.length > 0 || screeningBusy} />}
      </div>

      <div hidden={tab !== 'patient'}>
        {screen === 'home' && <OliveHome doctors={doctors} snapshot={chat.snapshot} hasNotice={Boolean(doctorQuestion)} onChat={() => setTab('assistant')} onDirectory={() => setScreen('directory')} onNotes={() => setScreen('notes')} onNotifications={() => setNoticeOpen(true)} onDoctor={d => { setBookingError(''); setProfile(d); }} />}
        {screen === 'directory' && <div className="space-y-5">
          {chat.snapshot?.booking && <AppointmentReceipt snapshot={chat.snapshot} />}
          <OliveDirectory doctors={doctors} error={doctorError} onRetry={() => void loadDoctors()} onDoctor={d => { setBookingError(''); setProfile(d); }} />
        </div>}
        {screen === 'appointment' && <div className="space-y-5">
          {chat.snapshot?.booking ? <AppointmentReceipt snapshot={chat.snapshot} /> : <Card><p>No appointment yet.</p><Button className="mt-3" onClick={() => setScreen('directory')}>Find a doctor <ArrowRight /></Button></Card>}
          {enc?.clarification && <DoctorQuestionCard encounter={enc} onAnswered={chat.updateSnapshot} />}
        </div>}
        {screen === 'notes' && <div className="space-y-5">
          {!enc && <Card><p>Describe your symptoms in the AI assistant to start your notes.</p><Button className="mt-3" onClick={() => setTab('assistant')}>Open AI assistant <ArrowRight /></Button></Card>}
          {enc && <>
            {enc.clarification && <DoctorQuestionCard encounter={enc} onAnswered={chat.updateSnapshot} />}
            <OliveNotes encounter={enc} documents={<>
              {report && <Card><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">Report: {report.name}</h3><FileText size={18} /></div><p className="text-sm text-slate-500">Unverified extraction, no medical interpretation.</p>{report.observations.map(o => <p key={o.id} className="mt-2">{o.name} <strong>{o.value} {o.unit}</strong> <span className="text-xs text-slate-400">page {o.source.page}, line {o.source.line}</span></p>)}
                <div className="mt-3 flex flex-wrap gap-2">{reportShared ? <p className="text-sm text-green-800" role="status">Shared with your doctor (still unverified).</p> : <Button variant="outline" onClick={() => void shareReport()}>Share values with doctor</Button>}<Button variant="ghost" onClick={() => { setReport(null); setReportShared(false); }}>Remove</Button></div></Card>}
            </>} />
            <form className="relief-card" onSubmit={e => { e.preventDefault(); chat.send(`${optionalField}: ${optionalValue}`); setOptionalValue(''); }}>
              <h2>Optional information</h2><p>Age, medicines, allergies and history do not block consultation. For age, use a number (years), “2 months”, or “prefer not to say”.</p>
              <select aria-label="Optional field" value={optionalField} onChange={e => setOptionalField(e.target.value)}><option value="age">How old is the patient?</option><option value="medications">Current medicines</option><option value="allergies">Allergies</option><option value="history">Relevant history</option></select>
              <input aria-label="Optional information answer" value={optionalValue} maxLength={1000} onChange={e => setOptionalValue(e.target.value)} />
              <button disabled={!optionalValue.trim()}>Record optional information</button>
            </form>
            <Card><h2 className="mb-1 text-lg font-semibold">Safety check</h2><p className="mb-3 text-sm text-slate-500">These questions come from server rules, not the AI. “Not sure” is never treated as “no”.</p>
              {error && <p role="alert" className="mb-2 text-sm text-amber-900">{error}</p>}
              <ScreeningPanel screening={enc.screening} busy={chat.busy || chat.pending.length > 0 || screeningBusy} onChange={body => {
                setScreeningBusy(true); setError('');
                api.setScreening(enc.id, body).then(chat.updateSnapshot).catch(e => setError((e as Error).message)).finally(() => setScreeningBusy(false));
              }} /></Card>
            <Card><p className="text-sm">Care route: <strong>{chat.snapshot!.decision.title}</strong></p><p className="mt-1 text-sm text-slate-500">{chat.snapshot!.decision.explanation}</p>
              <p className="mt-2 text-sm">Intake: {enc.conversation?.intakeComplete ? 'complete' : 'in progress'} · Booking: {enc.conversation?.bookingReady ? 'ready' : 'awaiting safety or consultation details'}</p>
              {enc.conversation?.bookingReady && !chat.snapshot?.booking && <Button className="mt-3" onClick={() => setScreen('directory')}>Choose a doctor <ArrowRight /></Button>}</Card>
          </>}
        </div>}
      </div>
      <p className="chat-safety">Not a diagnosis. If you think this is an emergency, seek help now.</p>
    </main>
    <footer className="preview-footer"><p>Real server · synthetic data · not a diagnostic tool.</p><button onClick={() => setToolsOpen(true)}>Demo tools</button></footer>

    {voice && <VoiceScreen language={{ en: 'EN', hi: 'HI', as: 'AS' }[language] as PreviewLanguage} onLanguage={l => { if (!chat.snapshot) setLanguage({ EN: 'en', HI: 'hi', AS: 'as' }[l] as Language); }} onClose={() => setVoice(false)} onText={text => { setInput(text); setVoice(false); }} />}
    <ReportUpload open={reportOpen} onClose={() => setReportOpen(false)} onSave={value => { setReport(value); setReportShared(false); setReportOpen(false); openPatient('notes'); }} />
    <Dialog open={Boolean(profile)} onOpenChange={open => { if (!open) setProfile(null); }}><DialogContent className="bottom-sheet"><DialogTitle>Doctor profile</DialogTitle><DialogDescription>Fictional profile · real open slots</DialogDescription>
      {profile && <DoctorProfile doctor={profile} doctors={doctors} snapshot={chat.snapshot} busy={bookingBusy} onPick={slot => void pick(slot)} />}
      {bookingError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{bookingError}</p>}
      {chat.snapshot && !enc?.conversation?.bookingReady && !chat.snapshot.booking && <Button variant="outline" onClick={() => { setProfile(null); openPatient('notes'); }}>Complete notes and safety check</Button>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(proposal)} onOpenChange={open => { if (!open && !bookingBusy) setProposal(null); }}><DialogContent className="bottom-sheet"><DialogTitle className="pr-8 text-xl font-semibold">Review your appointment</DialogTitle><DialogDescription className="text-sm text-slate-500">Explicit approval is required. The AI can never book on its own.</DialogDescription>
      {proposal && <ReviewBody proposal={proposal} error={bookingError} busy={bookingBusy} onConfirm={() => void confirmBooking()} onCancel={() => setProposal(null)} />}
    </DialogContent></Dialog>
    <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}><DialogContent><DialogTitle>Notifications</DialogTitle><DialogDescription>Updates from your doctor and appointments</DialogDescription>
      <p>{doctorQuestion ? 'Your doctor has sent you a question.' : chat.snapshot?.booking ? `Appointment booked with ${chat.snapshot.booking.doctorName}.` : 'You’re all caught up.'}</p>
      {doctorQuestion && <Button onClick={() => { setNoticeOpen(false); setTab('assistant'); }}>Answer now</Button>}
    </DialogContent></Dialog>
    {menu()}{tools()}
  </div>;

  function menu() {
    return <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent className="bottom-sheet"><DialogTitle>Profile & views</DialogTitle><DialogDescription>Synthetic demo workspace</DialogDescription>
      <Button onClick={() => { setRole('patient'); setTab('assistant'); setMenuOpen(false); }}><MessageCircle />AI assistant</Button>
      <Button variant="outline" onClick={() => openPatient('notes')}><ClipboardList />My notes</Button>
      <Button variant="outline" onClick={() => openPatient('appointment')}><CalendarDays />My appointment</Button>
      <Button variant="outline" onClick={() => { setMenuOpen(false); setReportOpen(true); }}><FileText />Add report</Button>
      <Button variant="outline" onClick={() => { setRole('doctor'); setMenuOpen(false); }}><Stethoscope />Doctor view</Button>
      <Button variant="ghost" disabled={chat.busy} onClick={() => { chat.reset(); setReport(null); setProposal(null); setRole('patient'); setTab('assistant'); setMenuOpen(false); }}>Start a new conversation</Button>
      <a href="/?live=1">Judge workspace (evaluation scoreboard)</a>
    </DialogContent></Dialog>;
  }
  function tools() {
    return <Dialog open={toolsOpen} onOpenChange={setToolsOpen}><DialogContent className="bottom-sheet"><DialogTitle>Demo tools · agent trace</DialogTitle><DialogDescription>Real events from the server. Nothing here is simulated.</DialogDescription>
      {toolsOpen && <DemoTools encounterId={enc && !chat.snapshot?.booking && !emergency ? enc.id : null} />}
    </DialogContent></Dialog>;
  }
}
