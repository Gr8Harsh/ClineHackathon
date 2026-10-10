import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, FileText, HeartPulse, Languages, MapPin, MessageCircle, Mic, Paperclip, Send, ShieldCheck, Square, Terminal, Video, AlertTriangle, CalendarDays } from 'lucide-react';
import { Button } from '../components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog.tsx';
import { cn } from '../lib/utils.ts';
import { doctors, greetings, initialFields, questions, speechLocales, syntheticReport, type ChatLine, type EvidenceField, type FieldId, type PreviewLanguage, type Scenario } from './fixtures.ts';

type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type Booking = { doctor: typeof doctors[number]; time: string };

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-slate-200 bg-white p-5 sm:p-6', className)}>{children}</section>;
}
function Chip({ kind, children }: { kind: 'patient' | 'document' | 'missing'; children?: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', kind === 'patient' ? 'bg-emerald-50 text-emerald-800' : kind === 'document' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800')}>
    <span className={cn('size-1.5 rounded-full', kind === 'patient' ? 'bg-emerald-600' : kind === 'document' ? 'bg-blue-600' : 'bg-amber-600')} />
    {children ?? (kind === 'patient' ? 'Patient reported' : kind === 'document' ? 'From document' : 'Not asked')}
  </span>;
}

export function PreviewApp() {
  const [role, setRole] = useState<'patient' | 'doctor'>('patient');
  const [language, setLanguage] = useState<PreviewLanguage>('EN');
  const [step, setStep] = useState<'chat' | 'summary' | 'care'>('chat');
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
  const [reportInput, setReportInput] = useState('');
  const [report, setReport] = useState('');
  const [proposal, setProposal] = useState<Booking | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [bookingError, setBookingError] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [clarification, setClarification] = useState<{ question: string; answer: string | null } | null>(null);
  const [clarificationInput, setClarificationInput] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setVoiceSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => { recognition.current?.abort(); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [lines, step]);
  useEffect(() => { recognition.current?.abort(); setRecording(false); }, [role, step, language, emergency]);

  function event(text: string) { setEvents(e => [...e.slice(-19), `${new Date().toLocaleTimeString()}  fixture.${text}`]); }
  function addLine(role: ChatLine['role'], text: string, lang: PreviewLanguage = 'EN') {
    const id = crypto.randomUUID();
    setLines(l => [...l, { id, role, text, language: lang }]); return id;
  }
  function reset(next: Scenario = 'routine') {
    recognition.current?.abort();
    setScenario(next); setEmergency(next === 'emergency'); setStep('chat'); setIndex(0); setInput('');
    setFields(initialFields.map(f => ({ ...f }))); setAsked(['concern']); setEditing(null); setReport(''); setReportInput('');
    setBooking(null); setProposal(null); setBookingError(''); setClarification(null); setEvents([]);
    setLines([{ id: 'greeting', role: 'assistant', text: greetings[language] + ' ' + questions[0].text, language: 'EN' }]);
  }
  function changeLanguage(next: PreviewLanguage) {
    setLanguage(next); setVoiceError('');
    if (lines.length === 1) setLines([{ id: 'greeting', role: 'assistant', text: greetings[next] + ' ' + questions[0].text, language: 'EN' }]);
  }
  function advance() {
    if (index < questions.length - 1) {
      const next = questions[index + 1]; setIndex(i => i + 1);
      if (next.key !== 'document') setAsked(a => [...new Set([...a, next.key as FieldId])]);
      addLine('assistant', next.text);
    } else { setIndex(questions.length); addLine('assistant', 'Your notes are ready to review. Anything unanswered stays visible as missing.'); }
  }
  function answer(value: string) {
    if (!value.trim() || emergency) return;
    const key = editing ?? questions[index]?.key;
    if (!key) return;
    if (key === 'document' && value === 'Add a text report') { setReportOpen(true); return; }
    const id = addLine('patient', value.trim(), language); setInput('');
    if (key !== 'document') {
      setFields(f => f.map(item => item.key === key ? { ...item, value: value === 'Skip for now' ? null : value.trim(), sourceId: value === 'Skip for now' ? null : id } : item));
      setAsked(a => [...new Set([...a, key])]); event(`capture_${key}  patient source recorded; unverified`);
    }
    if (editing) { setEditing(null); setStep('summary'); } else advance();
  }
  function editField(key: FieldId) {
    setEditing(key); setStep('chat'); addLine('assistant', questions.find(q => q.key === key)!.text);
    setTimeout(() => inputRef.current?.focus(), 100);
  }
  function mic() {
    if (recording) { recognition.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Constructor) { setVoiceError('Voice input is not available in this browser. You can always type.'); return; }
    setVoiceError('');
    const r = new Constructor(); recognition.current = r; r.lang = speechLocales[language]; r.interimResults = false;
    r.onresult = e => { setInput(e.results[0][0].transcript); inputRef.current?.focus(); };
    r.onerror = e => { setVoiceError(`Voice input stopped: ${e.error}. Type your answer instead.`); setRecording(false); };
    r.onend = () => setRecording(false);
    try { r.start(); setRecording(true); } catch { setVoiceError('Could not start the microphone. Check browser permissions or type instead.'); }
  }
  function fieldSource(f: EvidenceField) { const line = lines.find(l => l.id === f.sourceId); if (line) setSource({ title: `${f.label} · original patient message`, text: line.text }); }
  const hasReportValue = report.split(/\r?\n/).some(line => /^Haemoglobin:\s*13\.2\s*g\/dL\s*$/i.test(line));
  const reportLine = report.split(/\r?\n/).findIndex(line => /^Haemoglobin:\s*13\.2\s*g\/dL\s*$/i.test(line)) + 1;

  function summary() { return <div className="space-y-4">
    <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><ClipboardList size={22} /></div><div><h2 className="text-xl font-semibold tracking-tight">Your consultation notes</h2><p className="text-sm text-slate-500">Your words. Their sources. Nothing filled in for you.</p></div></div>
    <Card className="!p-0 overflow-hidden"><div className="divide-y divide-slate-100">{fields.map(f => <div key={f.key} className="p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-slate-500">{f.label}</span><Chip kind={f.value !== null ? 'patient' : 'missing'}>{f.value !== null ? 'Patient reported' : asked.includes(f.key) ? 'Unanswered' : 'Not asked'}</Chip></div>
      <p className={cn('evidence-line text-base', f.value === null && 'text-slate-400')}>{f.value ?? (asked.includes(f.key) ? 'Not recorded — not the same as “none”.' : 'We haven’t asked this yet.')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">{f.sourceId && <Button variant="ghost" size="sm" className="!px-0 text-teal-700" onClick={() => fieldSource(f)}>View source <ChevronRight /></Button>}
        {role === 'patient' && <Button variant="ghost" size="sm" onClick={() => editField(f.key)}>{f.value ? 'Correct answer' : 'Answer in chat'}</Button>}
        {f.value && <span className="text-xs text-slate-400">Original wording · unverified</span>}</div>
    </div>)}</div></Card>
    {report && <Card><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">Attached report</h3><Chip kind="document" /></div>
      {hasReportValue ? <><p>Haemoglobin <strong className="ml-2">13.2 g/dL</strong></p><p className="mt-1 text-xs text-slate-500">Unverified extraction · no medical interpretation</p><Button className="mt-2 !px-0 text-teal-700" variant="ghost" onClick={() => setSource({ title: `Report · exact source line ${reportLine}`, text: report.split(/\r?\n/).map((l, i) => `${i + 1} │ ${l}`).join('\n') })}>View source line {reportLine} <ChevronRight /></Button></> : <p className="text-sm text-amber-700">No supported fixture observation found. Review the original; this is not a normal result assessment.</p>}
    </Card>}
    <div className="flex gap-3 rounded-xl bg-teal-50 p-4 text-sm text-teal-800"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p>Source labels show where information came from, not whether it is medically correct. Non-English originals are not translated in this preview.</p></div>
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

  return <div className="sehat-preview">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white"><HeartPulse size={21} /></span><div><span className="text-lg font-bold tracking-tight">sehat<span className="ml-1 font-normal text-teal-700">OS</span></span><p className="text-[11px] text-slate-400">Care, with clarity.</p></div></div>
        <nav className="flex gap-1 rounded-xl bg-slate-50 p-1" aria-label="Preview views"><Button size="sm" variant="ghost" className={role === 'patient' ? '!bg-white !text-teal-800 shadow-sm' : ''} onClick={() => setRole('patient')}>Patient</Button><Button size="sm" variant="ghost" className={role === 'doctor' ? '!bg-white !text-teal-800 shadow-sm' : ''} onClick={() => setRole('doctor')}>Doctor</Button></nav>
        {role === 'patient' && <div className="flex items-center gap-1" role="group" aria-label="Patient language"><Languages size={16} className="mr-1 text-slate-400" />{(['EN', 'HI', 'AS'] as PreviewLanguage[]).map(l => <Button key={l} size="sm" variant="ghost" aria-pressed={language === l} className={cn('!px-3', language === l && '!bg-teal-50 !text-teal-800')} onClick={() => changeLanguage(l)}>{l}</Button>)}</div>}
      </div>
    </header>
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-amber-500" /><strong>UI preview</strong> · synthetic fixtures, no AI calls or real bookings</span><a href="/?live=1" className="font-medium text-teal-700 underline underline-offset-4">Open existing live workflow ↗</a></div>

    {role === 'patient' ? <main className="mx-auto max-w-2xl px-4 pb-8 pt-4 sm:px-6">
      <div className="mb-7 flex items-center justify-center gap-3 text-xs text-slate-400">{[['chat', 'Tell us'], ['summary', 'Review notes'], ['care', 'Find care']].map(([s, label], i) => <div key={s} className="flex items-center gap-3"><button type="button" onClick={() => setStep(s as typeof step)} aria-current={step === s ? 'step' : undefined} className={cn('flex min-h-11 items-center gap-2 border-0 bg-transparent text-xs', step === s && 'font-semibold text-teal-800')}><span className={cn('flex size-6 items-center justify-center rounded-full bg-slate-100', step === s && '!bg-teal-700 text-white')}>{i + 1}</span>{label}</button>{i < 2 && <span className="h-px w-5 bg-slate-200" />}</div>)}</div>
      {step === 'chat' && <>
        <div className="mb-5 text-center"><h1 className="text-2xl font-semibold tracking-tight">Let’s prepare for your visit.</h1><p className="mt-1 text-sm text-slate-500">One question at a time. At your pace.</p></div>
        {language !== 'EN' && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">{language === 'AS' ? 'অসমীয়া' : 'हिन्दी'} input selected. Scripted questions remain in English. Translation unavailable; greeting copy needs native-speaker review.</p>}
        <Card className="!p-0 overflow-hidden">
          <div className="chat-scroll flex max-h-[48dvh] min-h-64 flex-col gap-5 overflow-y-auto p-5 sm:p-6" aria-live="polite">{lines.map(line => <div key={line.id} className={cn('message-enter flex gap-3', line.role === 'patient' && 'justify-end')}>
            {line.role === 'assistant' && <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700"><HeartPulse size={16} /></span>}
            <div className={cn('max-w-[85%] rounded-2xl px-4 py-3', line.role === 'patient' ? 'bg-teal-700 text-white' : 'bg-slate-50 text-slate-700')}><p lang={line.role === 'patient' ? { EN: 'en', HI: 'hi', AS: 'as' }[line.language] : 'en'} className="evidence-line text-sm">{line.text}</p><span className={cn('mt-2 block text-[10px]', line.role === 'patient' ? 'text-teal-100' : 'text-slate-400')}>{line.role === 'patient' ? 'You · original message' : 'Scripted assistant · UI fixture'}</span></div>
          </div>)}<div ref={end} /></div>
          <div className="border-t border-slate-100 bg-white p-4 sm:p-5">
            {index < questions.length || editing ? <>
              <div className="mb-4 flex flex-wrap gap-2">{(editing ? questions.find(q => q.key === editing)!.chips : questions[index].chips).map(c => <Button key={c} variant="outline" size="sm" className="!rounded-full !text-xs" onClick={() => answer(c)}>{c}</Button>)}</div>
              <form onSubmit={e => { e.preventDefault(); answer(input); }} className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Attach a text report" onClick={() => setReportOpen(true)}><Paperclip /></Button><input ref={inputRef} value={input} maxLength={4000} onChange={e => setInput(e.target.value)} aria-label="Your answer" placeholder="Type your answer…" className="!min-w-0 !flex-1 !rounded-xl !border-slate-200 !bg-slate-50 !px-3 !py-3 text-sm" /><Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send answer"><Send /></Button></form>
              <div className="mt-4 flex items-center justify-center gap-3"><Button onClick={mic} aria-label={recording ? 'Stop recording' : 'Start voice input'} aria-pressed={recording} className={cn('!size-16 !rounded-full !p-0 shadow-sm [&_svg]:!size-6', recording && '!border-red-600 !bg-red-600')}>{recording ? <Square /> : <Mic />}</Button><div className="text-xs text-slate-500"><strong className="block text-slate-600">{recording ? 'Listening… tap to stop' : 'Prefer to speak?'}</strong>{voiceSupported ? 'Tap the microphone. Review before sending.' : 'Voice is unavailable here. Text always works.'}</div></div>
              <p className="mt-3 text-center text-[10px] text-slate-400">Browser speech may be processed externally. Assamese recognition is not guaranteed.</p>
              {voiceError && <p role="alert" className="mt-3 text-xs text-red-700">{voiceError}</p>}
            </> : <Button className="w-full" onClick={() => setStep('summary')}>Review my notes <ArrowRight /></Button>}
          </div>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-400">Not a diagnosis. If you think this is an emergency, seek help now.</p>
      </>}
      {step === 'summary' && <>{summary()}<div className="mt-6 flex gap-3"><Button variant="outline" onClick={() => setStep('chat')}><ArrowLeft /> Back to chat</Button><Button className="flex-1" onClick={() => setStep('care')}>Explore care <ArrowRight /></Button></div><p className="mt-3 text-center text-xs text-slate-400">Next screen uses a pre-screened synthetic route, not a decision about your answers.</p></>}
      {step === 'care' && <div className="space-y-5">
        <div><h1 className="text-2xl font-semibold tracking-tight">The next step, made clearer.</h1><p className="mt-1 text-sm text-slate-500">Review your options. Nothing is booked without you.</p></div>
        <Card className="!border-teal-200 !bg-teal-50"><div className="flex gap-4"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700"><Video /></div><div><span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Pre-screened routine fixture</span><h2 className="mt-1 text-lg font-semibold text-teal-900">Video consultation</h2><p className="mt-2 text-sm text-teal-800">This mock scenario has completed screening. A clinician must assess suitability. Your chat answers do not determine this fixture route.</p></div></div></Card>
        {booking ? <Card className="text-center"><CheckCircle2 className="mx-auto mb-3 text-teal-600" size={40} /><h2 className="text-xl font-semibold">Preview appointment selected</h2><p className="mt-2 text-slate-600">{booking.doctor.name} · Tomorrow, {booking.time} IST</p><p className="mt-1 text-sm text-slate-500">Video · ₹{booking.doctor.fee}</p><p className="my-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Synthetic receipt DEMO-001. No database booking or patient confirmation record was created.</p><Button variant="outline" onClick={() => setRole('doctor')}>Open doctor preview <ArrowRight /></Button></Card> : <>
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Available doctors</h2><span className="text-xs text-slate-400">Fictional · example times</span></div>
          {scenario === 'no-slots' ? <Card><CalendarDays className="mb-3 text-slate-400" /><h3 className="font-semibold">No appointments in this fixture</h3><p className="mt-2 text-sm text-slate-500">Nothing has been booked. Contact a clinic directly or try again later.</p><Button variant="outline" className="mt-4" onClick={() => reset()}>Reset to routine fixture</Button></Card> : doctors.map(d => <Card key={d.id}><div className="flex gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 font-semibold text-slate-600">{d.initials}</span><div className="flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{d.name}</h3><span className="text-sm font-semibold text-slate-600">₹{d.fee}</span></div><p className="text-sm text-slate-500">{d.specialty}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin size={12} />{d.location} · {d.languages}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{d.times.map(time => <Button variant="outline" size="sm" key={time} className="!text-xs hover:!border-teal-500 hover:!text-teal-700" onClick={() => { setProposal({ doctor: d, time }); setBookingError(''); }}>{time}</Button>)}</div></Card>)}
        </>}
        <Button variant="ghost" onClick={() => setStep('summary')}><ArrowLeft /> Review notes</Button>
      </div>}
      {clarification && <Card className="mt-6 !border-teal-200"><span className="text-xs font-semibold uppercase tracking-wider text-teal-700">A question from your doctor · fixture</span><h3 className="mt-2 font-semibold">{clarification.question}</h3>{clarification.answer ? <p className="mt-3 text-sm text-slate-500">Your original answer: {clarification.answer}</p> : <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); if (!clarificationInput.trim()) return; setClarification(c => c ? { ...c, answer: clarificationInput.trim() } : c); event('clarification_answer  original text; no translation'); setClarificationInput(''); }}><input id="preview-answer-doctor" value={clarificationInput} onChange={e => setClarificationInput(e.target.value)} aria-label="Answer your doctor" placeholder="Answer in your own words…" maxLength={4000} className="!border-slate-200" /><Button type="submit" size="icon" disabled={!clarificationInput.trim()} aria-label="Send clarification answer"><Send /></Button></form>}</Card>}
    </main> : <main className="mx-auto max-w-6xl px-5 py-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-teal-700">Clinician workspace · synthetic preview</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">A clearer start to your consultation.</h1></div><span className="flex items-center gap-2 text-sm text-slate-500"><CalendarDays size={17} />Example schedule</span></div>
      <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]"><Card className="!p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Appointments</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{booking ? '1' : '0'}</span></div>
        {booking ? <button className="w-full rounded-xl border border-teal-200 bg-teal-50 p-4 text-left" aria-pressed="true"><span className="text-xs text-teal-700">Tomorrow · {booking.time} IST</span><strong className="mt-1 block">Synthetic patient</strong><span className="mt-1 flex items-center gap-2 text-xs text-slate-500"><Video size={13} />Video consultation · {language}</span></button> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No preview appointment selected yet.</p>}
        <div className="mt-6 border-t border-slate-100 pt-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Unbooked preview encounter</h3><p className="text-sm">Current chat · {fields.filter(f => f.value !== null).length} recorded fields</p><p className="mt-2 text-xs text-slate-400">The briefing at right shows the current in-memory patient scenario.</p></div></Card>
        <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Synthetic patient</h2><p className="text-sm text-slate-500">Patient language: {language} · Original evidence preserved</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500">{booking ? 'Preview appointment' : 'Unbooked encounter'}</span></div>{language !== 'EN' && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">English rendering unavailable. Original {language === 'AS' ? 'Assamese' : 'Hindi'} text is shown, not a fabricated English briefing.</p>}{summary()}
          <Card><div className="mb-3 flex items-center gap-2"><MessageCircle size={18} className="text-teal-700" /><h3 className="font-semibold">One clarifying question</h3></div>{clarification ? <div><p>{clarification.question}</p><p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{clarification.answer ? `Original patient answer: ${clarification.answer}` : 'Waiting for the patient’s answer. Switch to Patient to reply.'}</p><p className="mt-2 text-xs text-slate-400">Question sent in English · answer untranslated · synthetic exchange</p></div> : <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); if (!questionInput.trim()) return; setClarification({ question: questionInput.trim(), answer: null }); setQuestionInput(''); event('clarification_question  in-memory exchange'); }}><input id="preview-question-doctor" maxLength={500} value={questionInput} onChange={e => setQuestionInput(e.target.value)} aria-label="Question for patient" placeholder="For example: Any blood thinners?" className="!min-w-0 !flex-1 !border-slate-200" /><Button type="submit" disabled={!questionInput.trim()}>Send question <Send /></Button></form>}</Card>
        </div>
      </div>
    </main>}

    <footer className="mx-auto max-w-2xl px-5 pb-8 pt-4">
      <details className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-4 py-3 text-xs text-slate-500">Preview scenarios & developer tools</summary><div className="border-t border-slate-100 p-4"><label className="mb-2 block text-xs font-medium text-slate-500" htmlFor="preview-scenario">Synthetic scenario (resets preview)</label><select id="preview-scenario" value={scenario} onChange={e => reset(e.target.value as Scenario)} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="routine">Routine conversation</option><option value="emergency">Emergency interruption</option><option value="no-slots">No available slots</option><option value="conflict">Booking conflict</option><option value="expired">Expired proposal</option></select></div></details>
      <button className="mt-3 flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 text-xs text-slate-300" aria-expanded={traceOpen} onClick={() => setTraceOpen(o => !o)}><span className="flex items-center gap-2"><Terminal size={15} />Agent trace · fixture only</span><ChevronDown size={16} className={traceOpen ? 'rotate-180' : ''} /></button>
      {traceOpen && <div className="rounded-b-xl bg-slate-950 p-4 font-mono text-xs text-slate-300"><p className="mb-3 text-amber-300">SIMULATED UI EVENTS — no Cline SDK execution</p>{events.length ? events.map((e, i) => <p key={i} className="mb-2 break-words">{e}</p>) : <p className="text-slate-500">No fixture interactions recorded yet.</p>}<a href="/?live=1" className="mt-3 block text-teal-300 underline">Open live workflow for actual backend traces</a></div>}
      <p className="mt-5 text-center text-[11px] text-slate-400">Synthetic data only. Not a diagnostic tool or production healthcare service.</p>
    </footer>

    <Dialog open={Boolean(proposal)} onOpenChange={open => { if (!open) setProposal(null); }}><DialogContent><DialogTitle className="pr-8 text-xl font-semibold">Review your appointment</DialogTitle><DialogDescription className="text-sm text-slate-500">Explicit approval is required. This is a synthetic UI preview; no real slot is held.</DialogDescription>{proposal && <><div className="space-y-3 rounded-2xl bg-slate-50 p-4"><p className="font-semibold">{proposal.doctor.name}</p><p className="flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={16} />Tomorrow · {proposal.time} IST (UTC+05:30)</p><p className="flex items-center gap-2 text-sm text-slate-600"><Video size={16} />Video consultation</p><p className="text-sm text-slate-600">Fee <strong className="float-right">₹{proposal.doctor.fee}</strong></p></div>{bookingError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{bookingError}</p>}<Button onClick={() => {
      if (scenario === 'conflict') { setBookingError('Synthetic conflict: this example slot was taken. Nothing is booked. Close this dialog and reset the scenario to try again.'); return; }
      if (scenario === 'expired') { setBookingError('Synthetic expiry: this proposal has expired. Nothing is booked. Close this dialog and select another scenario.'); return; }
      setBooking(proposal); setProposal(null); event('confirm_booking  fixture receipt; no server write');
    }}>Confirm preview appointment <Check /></Button><Button variant="outline" onClick={() => setProposal(null)}>Not now</Button><p className="text-center text-[10px] text-slate-400">Live bookings must use the server’s scoped confirmation record.</p></>}</DialogContent></Dialog>
    <Dialog open={Boolean(source)} onOpenChange={open => { if (!open) setSource(null); }}><DialogContent><DialogTitle className="pr-7 text-lg font-semibold">{source?.title}</DialogTitle><DialogDescription className="text-sm text-slate-500">Original synthetic evidence. Unverified; not medical interpretation.</DialogDescription><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm">{source?.text}</pre></DialogContent></Dialog>
    <Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent><DialogTitle className="text-xl font-semibold">Add your report</DialogTitle><DialogDescription className="text-sm text-slate-500">Paste synthetic plain text. PDF/image OCR is not supported. You can skip this.</DialogDescription><label htmlFor="preview-report" className="text-sm font-medium">Report text</label><textarea id="preview-report" rows={5} maxLength={20000} value={reportInput} onChange={e => setReportInput(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" /><Button variant="outline" onClick={() => setReportInput(syntheticReport)}><FileText />Fill synthetic example</Button><Button disabled={!reportInput.trim()} onClick={() => { setReport(reportInput); setReportOpen(false); addLine('patient', 'Attached a synthetic text report.', language); event('document_source  original text retained; unverified'); if (index === questions.length - 1 && !editing) advance(); }}>Attach to my notes <Paperclip /></Button></DialogContent></Dialog>
  </div>;
}