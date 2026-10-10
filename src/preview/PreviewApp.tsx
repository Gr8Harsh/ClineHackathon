import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, ClipboardList, FileText, Languages, MessageCircle, Mic, Paperclip, Send, Settings, ShieldCheck, Terminal, Video, AlertTriangle, CalendarDays, CircleHelp, Home } from 'lucide-react';
import { Button } from '../components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog.tsx';
import { cn } from '../lib/utils.ts';
import { doctors, greetings, initialFields, questions, type ChatLine, type EvidenceField, type FieldId, type PreviewLanguage, type Scenario } from './fixtures.ts';
import { answerLabels, detailsPrompt, structuredAnswer, type AnswerAction } from './answers.ts';
import { ReportUpload, SourcePage } from './reports/ReportUpload.tsx';
import type { Observation, Report } from './reports/parser.ts';
import { VoiceScreen } from './VoiceScreen.tsx';
import { AppointmentCard, Avatar, DoctorDirectory, PatientHome, type PreviewDoctor } from './PatientScreens.tsx';
import { AssistantOrb } from './AssistantOrb.tsx';

type Booking = { doctor: typeof doctors[number]; time: string };

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-slate-200 bg-white p-5 sm:p-6', className)}>{children}</section>;
}
function Chip({ kind, children }: { kind: 'patient' | 'document' | 'missing'; children?: ReactNode }) {
  return <span className={cn('provenance-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium', kind === 'patient' ? 'bg-green-100' : kind === 'document' ? 'border border-green-700' : 'border border-dashed border-green-300')}>
    {kind === 'patient' ? <Check size={14} /> : kind === 'document' ? <FileText size={14} /> : <CircleHelp size={14} />}
    {children ?? (kind === 'patient' ? 'Patient reported' : kind === 'document' ? 'From document' : 'Not asked')}
  </span>;
}

export function PreviewApp() {
  const [role, setRole] = useState<'patient' | 'doctor'>('patient');
  const [language, setLanguage] = useState<PreviewLanguage>('EN');
  const [step, setStep] = useState<'chat' | 'summary' | 'care'>('chat');
  const [home, setHome] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [profile, setProfile] = useState<PreviewDoctor | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatAppointment, setChatAppointment] = useState<Booking | null>(null);
  const [detailsFor, setDetailsFor] = useState<{ key: FieldId; choiceSourceId: string } | null>(null);
  const [index, setIndex] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([{ id: 'greeting', role: 'assistant', text: greetings.EN + ' ' + questions[0].text, language: 'EN' }]);
  const [fields, setFields] = useState<EvidenceField[]>(initialFields.map(f => ({ ...f })));
  const [asked, setAsked] = useState<FieldId[]>(['concern']);
  const [editing, setEditing] = useState<FieldId | null>(null);
  const [input, setInput] = useState('');
  const [scenario, setScenario] = useState<Scenario>('routine');
  const [emergency, setEmergency] = useState(false);
  const [source, setSource] = useState<{ title: string; text: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const [report, setReport] = useState<Report | null>(null);
  const [reportSource, setReportSource] = useState<Observation | null>(null);
  const [proposal, setProposal] = useState<Booking | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [bookingError, setBookingError] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [clarification, setClarification] = useState<{ question: string; answer: string | null } | null>(null);
  const [clarificationInput, setClarificationInput] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const assistantActive = !home && step === 'chat';
  const welcome = lines.length === 1 && !chatAppointment && !editing;
  function selectTab(tab: 'assistant' | 'patient') {
    setHome(tab === 'patient');
    if (tab === 'assistant') setStep('chat');
  }
  useEffect(() => { if (lines.length > 1 || chatAppointment) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [lines, step, chatAppointment]);
  function event(text: string) { setEvents(e => [...e.slice(-19), `${new Date().toLocaleTimeString()}  fixture.${text}`]); }
  function addLine(role: ChatLine['role'], text: string, lang: PreviewLanguage = 'EN') {
    const id = crypto.randomUUID();
    setLines(l => [...l, { id, role, text, language: lang }]); return id;
  }
  function reset(next: Scenario = 'routine') {

    setScenario(next); setEmergency(next === 'emergency'); setStep('chat'); setIndex(0); setInput('');
    setFields(initialFields.map(f => ({ ...f }))); setAsked(['concern']); setEditing(null); setDetailsFor(null); setReport(null);  setReportSource(null); setHome(false); setVoiceOpen(false);
    setBooking(null); setProposal(null); setBookingError(''); setClarification(null); setEvents([]); setChatAppointment(null); setProfile(null); setReportOpen(false);
    setLines([{ id: 'greeting', role: 'assistant', text: greetings[language] + ' ' + questions[0].text, language: 'EN' }]);
  }
  function changeLanguage(next: PreviewLanguage) {
    setLanguage(next);
    if (lines.length === 1) setLines([{ id: 'greeting', role: 'assistant', text: greetings[next] + ' ' + questions[0].text, language: 'EN' }]);
  }
  function advance() {
    if (index < questions.length - 1) {
      const next = questions[index + 1]; setIndex(i => i + 1);
      if (next.key !== 'document') setAsked(a => [...new Set([...a, next.key as FieldId])]);
      addLine('assistant', next.text);
    } else { setIndex(questions.length); addLine('assistant', 'Your notes are ready to review. Anything unanswered stays visible as missing.'); }
  }
  function answer(value: string, action?: AnswerAction) {
    if (!value.trim() || emergency) return;
    const key = detailsFor?.key ?? editing ?? questions[index]?.key;
    if (!key) return;
    if (key === 'document' && value === 'Add a text report') { setReportOpen(true); return; }
    const id = addLine('patient', value.trim(), language); setInput('');
    if (action === 'yes' && key !== 'document') {
      setDetailsFor({ key, choiceSourceId: id });
      addLine('assistant', detailsPrompt[language], language);
      return;
    }
    if (key !== 'document') {
      const stored = action ? structuredAnswer(key, action) : value.trim();
      setFields(f => f.map(item => item.key === key ? { ...item, value: stored, sourceId: stored === null ? null : id, choiceSourceId: detailsFor?.choiceSourceId } : item));
      setAsked(a => [...new Set([...a, key])]); event(`capture_${key}  patient source recorded; unverified`);
    }
    setDetailsFor(null);
    if (editing) { setEditing(null); setStep('summary'); } else advance();
  }
  function editField(key: FieldId) {
    setEditing(key); setDetailsFor(null); setHome(false); setStep('chat'); addLine('assistant', questions.find(q => q.key === key)!.text);
    setTimeout(() => inputRef.current?.focus(), 100);
  }
  function fieldSource(f: EvidenceField) { const evidence = [f.choiceSourceId, f.sourceId].filter(Boolean).map(id => lines.find(l => l.id === id)?.text).filter(Boolean); if (evidence.length) setSource({ title: `${f.label} · original patient message`, text: evidence.join('\n') }); }
  const currentKey = editing ?? questions[index]?.key;
  const structuredKey = currentKey === 'medications' || currentKey === 'history' || currentKey === 'allergies' ? currentKey : null;

  function summary() { return <div className="space-y-4">
    <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-green-50 text-green-700"><ClipboardList size={22} /></div><div><h2 className="text-xl font-semibold tracking-tight">Your consultation notes</h2><p className="text-sm text-slate-500">Your words. Their sources. Nothing filled in for you.</p></div></div>
    <Card className="!p-0 overflow-hidden"><div className="divide-y divide-slate-100">{fields.map(f => <div key={f.key} className="p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-slate-500">{f.label}</span><Chip kind={f.value !== null ? 'patient' : 'missing'}>{f.value !== null ? 'Patient reported' : asked.includes(f.key) ? 'Unanswered' : 'Not asked'}</Chip></div>
      <p className={cn('evidence-line text-base', f.value === null && 'text-slate-400')}>{f.value ?? 'Not recorded, not the same as none.'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">{f.sourceId && <Button variant="ghost" size="sm" className="!px-0 text-green-700" onClick={() => fieldSource(f)}>View source <ChevronRight /></Button>}
        {role === 'patient' && <Button variant="ghost" size="sm" onClick={() => editField(f.key)}>{f.value !== null ? 'Correct answer' : 'Answer in chat'}</Button>}
        {f.value && <span className="text-sm text-slate-400">{f.value === lines.find(l => l.id === f.sourceId)?.text ? 'Original wording' : 'Structured from patient answer'} · unverified</span>}</div>
    </div>)}</div></Card>
    {report && <Card><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">Attached report</h3><Chip kind="document" /></div>
      <p>Unverified extraction, no medical interpretation</p>
      {report.observations.length ? report.observations.map(o => <div key={o.id} className="mt-4"><p>{o.name} <strong>{o.value} {o.unit}</strong></p>{o.corrected && <p className="text-sm">Patient-edited · original extraction preserved</p>}<Button variant="outline" className="mt-2" onClick={() => setReportSource(o)}>View source line {o.source.line}</Button></div>) : <p>No values recorded. Nothing has been invented.</p>}
    </Card>}
    <div className="flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-800"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p>Source labels show where information came from, not whether it is medically correct. Non-English originals are not translated in this preview.</p></div>
  </div>; }

  if (emergency && role === 'patient') return <div className="sehat-preview !bg-red-700 !text-white" role="alert">
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-7 py-10">
      <span className="mb-10 text-xs uppercase tracking-widest text-red-100">Synthetic emergency fixture · not live screening</span>
      <AlertTriangle size={52} strokeWidth={1.5} className="mb-6" /><h1 className="text-4xl font-semibold tracking-tight">Seek emergency<br />care now.</h1>
      <p className="mt-6 text-lg text-red-50">An emergency warning sign is shown in this synthetic scenario. Call your local emergency number or go to the nearest emergency department.</p>
      <div className="my-7 rounded-2xl border border-red-400 bg-red-800/50 p-5"><strong>Do not wait for an appointment.</strong><p className="mt-2 text-red-100">SEHAT OS cannot diagnose or rule out an emergency. Routine booking is not available on this screen.</p></div>
      <Button variant="outline" className="mt-5 !bg-white !text-red-800" onClick={() => reset()}>Reset synthetic scenario</Button>
    </div>
  </div>;

  return <div className={cn('sehat-preview', role === 'patient' ? 'patient-preview' : 'clinician-preview', role === 'patient' && !home && step === 'care' && 'care-view', role === 'patient' && !home && step === 'chat' && 'assistant-view')}>
    {role === 'patient' && <div className="primary-tabs" role="tablist" aria-label="Main views">{(['assistant', 'patient'] as const).map(tab => {
      const active = tab === 'assistant' ? assistantActive : !assistantActive;
      return <button key={tab} id={`${tab}-tab`} role="tab" aria-selected={active} aria-controls="patient-view-panel" tabIndex={active ? 0 : -1} onClick={() => selectTab(tab)} onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const next = e.key === 'Home' ? 'assistant' : e.key === 'End' ? 'patient' : tab === 'assistant' ? 'patient' : 'assistant';
        selectTab(next); document.getElementById(`${next}-tab`)?.focus();
      }}>{tab === 'assistant' ? <MessageCircle size={16} /> : <Home size={16} />}{tab === 'assistant' ? 'AI assistant' : 'Patient'}</button>;
    })}</div>}
    {(role === 'doctor' || !home) && <header className="screen-header">{role === 'patient' && assistantActive ? <span className="header-spacer" aria-hidden="true" /> : <button className="round-control" aria-label="Back to home" onClick={() => { setRole('patient'); setHome(true); }}><ArrowLeft size={20} /></button>}<h1>{role === 'doctor' ? 'Clinician workspace' : step === 'chat' ? 'SEHAT OS' : step === 'care' ? 'Make an appointment' : 'Your consultation notes'}</h1><button className="round-control" aria-label="Open profile menu" onClick={() => setMenuOpen(true)}><Settings size={19} /></button></header>}

    {role === 'patient' ? <main className="patient-shell" id="patient-view-panel" role="tabpanel" aria-labelledby={assistantActive ? 'assistant-tab' : 'patient-tab'}>
      {home && <PatientHome onChat={() => { setHome(false); setStep('chat'); }} onCare={() => { setHome(false); setStep('care'); }} onNotes={() => { setHome(false); setStep('summary'); }} onProfile={() => setMenuOpen(true)} onNotifications={() => setNotificationsOpen(true)} onDoctor={setProfile} />}
      {!home && step === 'chat' && <>
        {language !== 'EN' && <p className="mb-3 rounded-xl bg-green-50 px-4 py-3 text-xs text-green-800">{language === 'AS' ? 'অসমীয়া' : 'हिन्दी'} input selected. Scripted questions remain in English. Translation unavailable; greeting copy needs native-speaker review.</p>}
        <section className={cn('assistant-conversation', welcome && 'assistant-welcome')}>
          <div className="chat-scroll" aria-live="polite">{welcome ? <div className="assistant-welcome-content"><AssistantOrb /><h2>How are you feeling?</h2><p>A little space to share what’s on your mind.</p></div> : lines.map(line => <div key={line.id} className={cn('message-enter chat-message', line.role)}>
            {line.role === 'assistant' && <span className="assistant-ring" aria-hidden="true" />}
            <div className="message-bubble"><p lang={line.role === 'patient' ? { EN: 'en', HI: 'hi', AS: 'as' }[line.language] : 'en'} className="evidence-line">{line.text}</p><small>{line.role === 'patient' ? 'You · original message' : 'Scripted assistant · UI fixture'}</small>{import.meta.env.DEV && line.role === 'assistant' && <small>fixture</small>}</div>
            {line.role === 'patient' && <Avatar patient />}
          </div>)}{chatAppointment && scenario !== 'no-slots' && <div className="chat-message assistant"><span className="assistant-ring" /><div className="message-bubble"><p>Your selected example appointment. Review the details before confirming.</p><AppointmentCard doctor={chatAppointment.doctor} time={chatAppointment.time} onBook={() => { setProposal(chatAppointment); setBookingError(''); }} /></div></div>}<div ref={end} /></div>
          <div className="chat-composer-area">
            {index < questions.length || editing ? <>
              {!welcome && <div className="answer-choices">{detailsFor ? <p>{detailsPrompt[language]}</p> : structuredKey ? <>{answerLabels[language][structuredKey].slice(0, 3).map((c, i) => <Button key={i} variant="outline" onClick={() => answer(c, (['yes', 'no', 'unsure'] as const)[i])}>{c}</Button>)}<button className="skip-answer" onClick={() => answer(answerLabels[language][structuredKey][3], 'skip')}>{answerLabels[language][structuredKey][3]}</button></> : (editing ? questions.find(q => q.key === editing)!.chips : questions[index].chips).map(c => <Button key={c} variant="outline" onClick={() => answer(c)}>{c}</Button>)}</div>}
              <form onSubmit={e => { e.preventDefault(); answer(input); }} className="chat-composer"><div className="composer-input"><input ref={inputRef} value={input} maxLength={4000} onChange={e => setInput(e.target.value)} aria-label="Your answer" placeholder={welcome ? 'Tell me how you’re feeling…' : 'Your answer…'} /><small>{input.length}/4000</small></div><div className="composer-actions"><Button variant="ghost" aria-label="Attach a text report" onClick={() => setReportOpen(true)}><Paperclip />Attach file</Button><Button variant="ghost" onClick={() => setStep('summary')}><ClipboardList />Notes</Button><Button variant="ghost" size="icon" aria-label="Start voice input" onClick={() => setVoiceOpen(true)}><Mic /></Button><Button type="submit" variant="ghost" size="icon" disabled={!input.trim()} aria-label="Send answer"><Send /></Button></div></form>

            </> : <Button className="w-full" onClick={() => setStep('summary')}>Review my notes <ArrowRight /></Button>}
          </div>
        </section>
        <p className="chat-safety">Not a diagnosis. If you think this is an emergency, seek help now.</p>
      </>}
      {!home && step === 'summary' && <>{summary()}<div className="notes-action mt-6 flex gap-3"><Button variant="outline" onClick={() => setStep('chat')}><ArrowLeft /> Chat</Button><Button className="flex-1" onClick={() => setStep('care')}>Explore care <ArrowRight /></Button></div><p className="mt-3 text-center">Next screen uses a pre-screened synthetic route, not a decision about your answers.</p></>}
      {!home && step === 'care' && <div className="space-y-5">
        {booking ? <Card className="text-center"><CheckCircle2 className="mx-auto mb-3 text-green-600" size={40} /><h2 className="text-xl font-semibold">Preview appointment selected</h2><p className="mt-2 text-slate-600">{booking.doctor.name} · Tomorrow, {booking.time} IST</p><p className="mt-1 text-sm text-slate-500">Video · ₹{booking.doctor.fee}</p><p className="my-4 rounded-xl bg-green-50 p-3 text-xs text-green-800">Synthetic receipt DEMO-001. No database booking or patient confirmation record was created.</p><Button variant="outline" onClick={() => setRole('doctor')}>Open doctor preview <ArrowRight /></Button></Card> : <>
          <DoctorDirectory noSlots={scenario === 'no-slots'} onDoctor={setProfile} onReset={() => reset()} />
        </>}
        <Button variant="ghost" onClick={() => setStep('summary')}><ArrowLeft /> Review notes</Button>
      </div>}
      {clarification && <Card className="mt-6 !border-green-200"><span className="text-xs font-semibold uppercase tracking-wider text-green-700">A question from your doctor · fixture</span><h3 className="mt-2 font-semibold">{clarification.question}</h3>{clarification.answer ? <p className="mt-3 text-sm text-slate-500">Your original answer: {clarification.answer}</p> : <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); if (!clarificationInput.trim()) return; setClarification(c => c ? { ...c, answer: clarificationInput.trim() } : c); event('clarification_answer  original text; no translation'); setClarificationInput(''); }}><input id="preview-answer-doctor" value={clarificationInput} onChange={e => setClarificationInput(e.target.value)} aria-label="Answer your doctor" placeholder="Answer in your own words…" maxLength={4000} className="!border-slate-200" /><Button type="submit" size="icon" disabled={!clarificationInput.trim()} aria-label="Send clarification answer"><Send /></Button></form>}</Card>}
    </main> : <main className="doctor-workspace mx-auto max-w-6xl px-5 py-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-green-700">Clinician workspace · synthetic preview</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">A clearer start to your consultation.</h1></div><span className="flex items-center gap-2 text-sm text-slate-500"><CalendarDays size={17} />Example schedule</span></div>
      <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]"><Card className="!p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Appointments</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{booking ? '1' : '0'}</span></div>
        {booking ? <button className="w-full rounded-xl border border-green-200 bg-green-50 p-4 text-left" aria-pressed="true"><span className="text-xs text-green-700">Tomorrow · {booking.time} IST</span><strong className="mt-1 block">Synthetic patient</strong><span className="mt-1 flex items-center gap-2 text-xs text-slate-500"><Video size={13} />Video consultation · {language}</span></button> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No preview appointment selected yet.</p>}
        <div className="mt-6 border-t border-slate-100 pt-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Unbooked preview encounter</h3><p className="text-sm">Current chat · {fields.filter(f => f.value !== null).length} recorded fields</p><p className="mt-2 text-xs text-slate-400">The briefing at right shows the current in-memory patient scenario.</p></div></Card>
        <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Synthetic patient</h2><p className="text-sm text-slate-500">Patient language: {language} · Original evidence preserved</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500">{booking ? 'Preview appointment' : 'Unbooked encounter'}</span></div>{language !== 'EN' && <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">English rendering unavailable. Original {language === 'AS' ? 'Assamese' : 'Hindi'} text is shown, not a fabricated English briefing.</p>}{summary()}
          <Card><div className="mb-3 flex items-center gap-2"><MessageCircle size={18} className="text-green-700" /><h3 className="font-semibold">One clarifying question</h3></div>{clarification ? <div><p>{clarification.question}</p><p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{clarification.answer ? `Original patient answer: ${clarification.answer}` : 'Waiting for the patient’s answer. Switch to Patient to reply.'}</p><p className="mt-2 text-xs text-slate-400">Question sent in English · answer untranslated · synthetic exchange</p></div> : <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); if (!questionInput.trim()) return; setClarification({ question: questionInput.trim(), answer: null }); setQuestionInput(''); event('clarification_question  in-memory exchange'); }}><input id="preview-question-doctor" maxLength={500} value={questionInput} onChange={e => setQuestionInput(e.target.value)} aria-label="Question for patient" placeholder="For example: Any blood thinners?" className="!min-w-0 !flex-1 !border-slate-200" /><Button type="submit" disabled={!questionInput.trim()}>Send question <Send /></Button></form>}</Card>
        </div>
      </div>
    </main>}

    <footer className="preview-footer"><p>Synthetic preview · no AI calls or real bookings.<br />Not a diagnostic tool.</p><button onClick={() => setTraceOpen(true)}>Demo tools</button></footer>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent className="bottom-sheet"><DialogTitle>Profile & views</DialogTitle><DialogDescription>Synthetic preview workspace</DialogDescription><div className="flex items-center gap-2" role="group" aria-label="Patient language"><Languages size={18} />{(['EN', 'HI', 'AS'] as PreviewLanguage[]).map(l => <Button key={l} variant="outline" aria-pressed={language === l} onClick={() => changeLanguage(l)}>{l}</Button>)}</div><Button onClick={() => { setRole('patient'); setMenuOpen(false); }}>Patient</Button><Button variant="outline" onClick={() => { setRole('doctor'); setMenuOpen(false); }}>Doctor</Button><Button variant="outline" onClick={() => { setRole('patient'); setHome(false); setStep('summary'); setMenuOpen(false); }}><ClipboardList />My notes</Button><Button variant="outline" onClick={() => { setRole('patient'); setHome(false); setStep('care'); setMenuOpen(false); }}><CalendarDays />My appointments</Button><Button variant="outline" onClick={() => { setMenuOpen(false); setReportOpen(true); }}><FileText />Add report</Button><Button variant="ghost" onClick={() => { setHome(true); setRole('patient'); setMenuOpen(false); }}><Home />Home</Button><a href="/?live=1">Open existing live workflow</a></DialogContent></Dialog>
    <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}><DialogContent><DialogTitle>Notifications</DialogTitle><DialogDescription>Synthetic preview updates</DialogDescription><p>{clarification && !clarification.answer ? 'A doctor has sent you a question. Open your notes to reply.' : booking ? `Preview appointment selected with ${booking.doctor.name}. No real booking was made.` : 'You’re all caught up. No appointment or doctor messages yet.'}</p><Button onClick={() => { setNotificationsOpen(false); setHome(false); setStep('summary'); }}>View my notes</Button></DialogContent></Dialog>
    <Dialog open={Boolean(profile)} onOpenChange={open => { if (!open) setProfile(null); }}><DialogContent className="bottom-sheet"><DialogTitle>Doctor profile</DialogTitle><DialogDescription>Fictional profile · example availability only</DialogDescription>{profile && <><div className="profile-doctor"><Avatar index={doctors.indexOf(profile)} /><div><h2>{profile.name}</h2><p>{profile.specialty}</p></div></div><p>{profile.location} · {profile.languages}</p><p>Example video consultation · ₹{profile.fee}</p><p>This preview uses a pre-screened synthetic route. Your answers do not determine suitability or availability.</p><h3>Example times · tomorrow, IST</h3>{scenario === 'no-slots' ? <p>No appointments in this fixture.</p> : <div className="profile-times">{profile.times.map(time => <Button variant="outline" key={time} onClick={() => { setChatAppointment({ doctor: profile, time }); setProfile(null); setHome(false); setStep('chat'); }}>{time}</Button>)}</div>}</>}</DialogContent></Dialog>
    <Dialog open={traceOpen} onOpenChange={setTraceOpen}><DialogContent className="bottom-sheet"><DialogTitle>Preview scenarios & agent trace</DialogTitle><DialogDescription>Fixture events only. No SDK execution is claimed.</DialogDescription><label htmlFor="preview-scenario">Synthetic scenario (resets preview)</label><select id="preview-scenario" value={scenario} onChange={e => { reset(e.target.value as Scenario); setTraceOpen(false); }}><option value="routine">Routine conversation</option><option value="emergency">Emergency interruption</option><option value="no-slots">No available slots</option><option value="conflict">Booking conflict</option><option value="expired">Expired proposal</option></select><div className="trace-panel"><p>SIMULATED UI EVENTS — no Cline SDK execution</p>{events.length ? events.map((e, i) => <p key={i}>{e}</p>) : <p>No fixture interactions yet.</p>}<a href="/?live=1">Open live workflow for actual traces</a></div></DialogContent></Dialog>
    <Dialog open={Boolean(proposal)} onOpenChange={open => { if (!open) setProposal(null); }}><DialogContent className="bottom-sheet"><DialogTitle className="pr-8 text-xl font-semibold">Review your appointment</DialogTitle><DialogDescription className="text-sm text-slate-500">Explicit approval is required. This is a synthetic UI preview; no real slot is held.</DialogDescription>{proposal && <><div className="space-y-3 rounded-2xl bg-slate-50 p-4"><p className="font-semibold">{proposal.doctor.name}</p><p className="flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={16} />Tomorrow · {proposal.time} IST (UTC+05:30)</p><p className="flex items-center gap-2 text-sm text-slate-600"><Video size={16} />Video consultation</p><p className="text-sm text-slate-600">Fee <strong className="float-right">₹{proposal.doctor.fee}</strong></p></div>{bookingError && <p role="alert" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{bookingError}</p>}<Button onClick={() => {
      if (scenario === 'conflict') { setBookingError('Synthetic conflict: this example slot was taken. Nothing is booked. Close this dialog and reset the scenario to try again.'); return; }
      if (scenario === 'expired') { setBookingError('Synthetic expiry: this proposal has expired. Nothing is booked. Close this dialog and select another scenario.'); return; }
      setBooking(proposal); setProposal(null); setHome(false); setStep('care'); event('confirm_booking  fixture receipt; no server write');
    }}>Confirm preview appointment <Check /></Button><Button variant="outline" onClick={() => setProposal(null)}>Not now</Button><p className="text-center text-[10px] text-slate-400">Live bookings must use the server’s scoped confirmation record.</p></>}</DialogContent></Dialog>
    <Dialog open={Boolean(source)} onOpenChange={open => { if (!open) setSource(null); }}><DialogContent><DialogTitle className="pr-7 text-lg font-semibold">{source?.title}</DialogTitle><DialogDescription className="text-sm text-slate-500">Original synthetic evidence. Unverified; not medical interpretation.</DialogDescription><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm">{source?.text}</pre></DialogContent></Dialog>
    <ReportUpload open={reportOpen} onClose={() => setReportOpen(false)} onSave={value => { setReport(value); setReportOpen(false); addLine('patient', 'Attached a reviewed synthetic report.', language); event('document_source  original retained; unverified'); if (index === questions.length - 1 && !editing) advance(); }} />
    <Dialog open={Boolean(reportSource)} onOpenChange={open => { if (!open) setReportSource(null); }}><DialogContent><DialogTitle>Original report source</DialogTitle><DialogDescription>Unverified extraction; original page and location.</DialogDescription>{report && reportSource && <SourcePage report={report} observation={reportSource} />}</DialogContent></Dialog>
    {voiceOpen && <VoiceScreen language={language} onLanguage={changeLanguage} onClose={() => setVoiceOpen(false)} onText={value => { setInput(value); setVoiceOpen(false); setHome(false); setStep('chat'); setTimeout(() => inputRef.current?.focus(), 100); }} />}  </div>;
}