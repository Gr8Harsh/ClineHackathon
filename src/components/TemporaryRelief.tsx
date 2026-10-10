import { useEffect, useRef, useState } from 'react';
import type { AvailableDoctor, Proposal, Snapshot } from '../../shared/types.ts';
import type { SelfCareResponse } from '../../shared/selfcare.ts';
import { api } from '../api.ts';
import { availableReliefDoctors, reliefExplanation } from '../preview/relief.ts';
import { formatAppointment } from '../ui.ts';

export function TemporaryRelief({ snapshot, onSnapshot, disabled }: { snapshot: Snapshot; onSnapshot: (s: Snapshot) => void; disabled: boolean }) {
  const [result, setResult] = useState<SelfCareResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [doctors, setDoctors] = useState<AvailableDoctor[]>([]);
  const [location, setLocation] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const current = useRef(snapshot); current.current = snapshot;
  const key = `${snapshot.encounter.id}:${snapshot.encounter.version}`;
  const emergency = snapshot.decision.route === 'emergency';
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const id = ++request.current;
    setResult(null); setProposal(null); setDoctors([]); setError(''); setBusy(false);
    if (!emergency && !disabled) {
      setBusy(true);
      Promise.all([api.selfcare(snapshot.encounter.id, { reset: true }), api.doctors()]).then(([care, docs]) => {
        if (id !== request.current) return;
        setResult(care.selfcare); setDoctors(docs);
        if (care.snapshot.decision.route === 'emergency') onSnapshot(care.snapshot);
      }).catch(e => { if (id === request.current) setError((e as Error).message); }).finally(() => { if (id === request.current) setBusy(false); });
    }
    return () => { ++request.current; };
  }, [key, emergency, disabled, reload]);
  async function perform(action: () => Promise<void>) {
    if (disabled || busy || emergency) return;
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (emergency) return null;
  const available = availableReliefDoctors(doctors, location, snapshot.decision.route);
  const ready = snapshot.encounter.conversation?.bookingReady && !snapshot.booking;
  return <div className="relief-stack">
    <section className="relief-card" aria-label="Temporary relief">
      <h2>Temporary relief</h2>
      <p className="relief-review">Comfort measures are awaiting clinician review. This demo cannot provide relief advice yet. You can still prepare your consultation and explore doctor options.</p>
      {error && <p role="alert">{error} <button onClick={() => setReload(v => v + 1)}>Retry relief and doctor options</button></p>}
      {busy && <p role="status">Checking server information…</p>}
      {result && <p role="status">{reliefExplanation(result)}</p>}
      {result?.status === 'question' && result.nextQuestion && <form onSubmit={e => { e.preventDefault(); void perform(async () => {
        const response = await api.selfcare(snapshot.encounter.id, { questionId: result.nextQuestion!.id, answer });
        setResult(response.selfcare); setAnswer('');
        if (response.snapshot.encounter.version !== snapshot.encounter.version || response.snapshot.decision.route === 'emergency') onSnapshot(response.snapshot);
      }); }}>
        <label htmlFor="temporary-relief-answer">Optional eligibility check: {result.nextQuestion.text}</label>
        <input id="temporary-relief-answer" value={answer} onChange={e => setAnswer(e.target.value)} disabled={disabled || busy} placeholder="Your answer, or unknown" />
        <button disabled={disabled || busy || !answer.trim()}>Continue eligibility check</button>
      </form>}
      {result?.guidance && <div>
        <h3>While you wait</h3><ul>{result.guidance.comfort_measures.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>Avoid</h3><ul>{result.guidance.avoid.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>Get help urgently if</h3><ul>{result.guidance.go_now_if.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>Seek a doctor if</h3><ul>{result.guidance.see_doctor_if.map(t => <li key={t}>{t}</li>)}</ul><p>{result.guidance.footer}</p>
      </div>}
    </section>
    <section className="relief-card" aria-label="Available doctors">
      <h2>Available doctors</h2><p>Fictional clinicians · actual database slots · earliest appointment first. Distance is unavailable; these are not verified nearest doctors.</p>
      <label htmlFor="doctor-location">Filter by location</label><input id="doctor-location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Town or clinic location" />
      {!ready && !snapshot.booking && <p>Explore options now. Booking requires complete consultation details and resolved safety screening.</p>}
      {snapshot.booking && <p role="status">Appointment booked: {snapshot.booking.doctorName} · {formatAppointment(snapshot.booking.startsAt)}</p>}
      {!busy && !available.length && <p>No matching available appointments. Try another location or contact a clinic directly.</p>}
      {available.slice(0, 5).map(d => <div className="intake-field" key={d.id}><strong>{d.name}</strong><p>{d.specialty} · {d.location} · ₹{d.fee}</p>
        {d.slots.slice(0, 2).map(s => <button key={s.id} disabled={disabled || busy || !ready} onClick={() => void perform(async () => {
          const value = await api.createProposal(snapshot.encounter.id, s.id);
          if (current.current.encounter.version !== snapshot.encounter.version) throw new Error('Patient information changed. Choose a slot again.');
          setProposal(value.proposal);
        })}>{formatAppointment(s.startsAt)} · {s.mode}</button>)}
      </div>)}
      {proposal && <div aria-label="Review appointment"><h3>Review before booking</h3><p>{proposal.doctorName} · {formatAppointment(proposal.startsAt)} · {proposal.mode} · ₹{proposal.fee}</p><p>Nothing is booked. Availability is rechecked on confirmation.</p>
        <button disabled={disabled || busy || Date.parse(proposal.expiresAt) <= Date.now()} onClick={() => void perform(async () => {
          const approved = await api.confirmProposal(proposal.id, snapshot.encounter.id);
          const booked = await api.bookProposal(proposal.id, snapshot.encounter.id, approved.token);
          onSnapshot(booked.snapshot); setProposal(null);
        })}>Confirm and book</button><button disabled={busy} onClick={() => setProposal(null)}>Cancel proposal</button>
      </div>}
    </section>
  </div>;
}