import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/types.ts';
import type { SelfCareRequest, SelfCareResponse } from '../../shared/selfcare.ts';
import { api } from '../api.ts';

export function SelfCarePanel({ snapshot, disabled, onSnapshot }: { snapshot: Snapshot; disabled: boolean; onSnapshot: (value: Snapshot) => void }) {
  const [result, setResult] = useState<SelfCareResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const emergency = snapshot.decision.route === 'emergency';
  useEffect(() => {
    request.current++;
    setResult(null); setAnswer(''); setBusy(false); setError('');
    return () => { request.current++; };
  }, [snapshot.encounter.id, snapshot.encounter.version]);
  async function submit(body: SelfCareRequest) {
    if (disabled || busy || emergency) return;
    const id = ++request.current;
    setBusy(true); setError('');
    try {
      const value = await api.selfcare(snapshot.encounter.id, body);
      if (id !== request.current) return;
      setResult(value.selfcare); setAnswer('');
      if (value.snapshot.encounter.version !== snapshot.encounter.version || value.snapshot.decision.route === 'emergency') onSnapshot(value.snapshot);
    } catch (error) { if (id === request.current) { setResult(null); setError((error as Error).message); } }
    finally { if (id === request.current) setBusy(false); }
  }
  if (emergency) return null;
  const question = result?.nextQuestion;
  const guidance = result?.guidance;
  return <section className="card" aria-label="Self-care guidance">
    <header>Temporary relief <span className="sub">Needs clinician review — not for patient use</span></header>
    <div className="body stack">
      <p className="notice">Synthetic draft. Not a diagnostic tool. No comfort measures are available until clinician review is recorded. Hindi and Assamese translations are pending.</p>
      {error && <p role="alert">{error}</p>}
      {!result ? <button className="btn btn-ghost" disabled={disabled || busy} onClick={() => void submit({ reset: true })}>Check self-care eligibility</button> : <>
        <p role={result.status === 'emergency' ? 'alert' : 'status'}>{result.message}</p>
        {question && <form className="stack" onSubmit={e => { e.preventDefault(); void submit({ questionId: question.id, answer }); }}>
          <label className="input-label" htmlFor="selfcare-answer">{question.text}</label>
          {question.kind === 'yesno' ? <select id="selfcare-answer" value={answer} disabled={disabled || busy} onChange={e => setAnswer(e.target.value)}>
            <option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Not sure</option>
          </select> : <input id="selfcare-answer" value={answer} maxLength={1000} disabled={disabled || busy} onChange={e => setAnswer(e.target.value)} placeholder={question.kind === 'number' ? 'Number, or unknown' : 'Your own words, or unknown'} />}
          <button className="btn btn-primary" disabled={disabled || busy || !answer.trim()}>Answer self-care question</button>
        </form>}
        {!!result.questions.length && <details><summary>Question status</summary><ul>{result.questions.map(q => <li key={q.id}>{q.text} · {q.status === 'not_asked' ? 'Not yet asked' : q.status === 'unanswered' ? 'Asked, unanswered or unsure' : 'Patient reported'}</li>)}</ul></details>}
        {guidance && <>
          <p>{guidance.tag} · {guidance.title}</p>
          <h3>Based on what you told me</h3><ul>{result.evidence.map(e => <li key={e.sourceId}>{e.text} <span className="meta">Patient reported · source {e.sourceId}</span></li>)}</ul>
          <h3>While you wait to see a doctor, these may help:</h3><ul>{guidance.comfort_measures.map(text => <li key={text}>{text}</li>)}</ul>
          <h3>Please avoid:</h3><ul>{guidance.avoid.map(text => <li key={text}>{text}</li>)}</ul>
          <div className="notice" role="alert"><h3>Get help urgently if:</h3><ul>{guidance.go_now_if.map(text => <li key={text}>{text}</li>)}</ul></div>
          <h3>Seek a doctor if:</h3><ul>{guidance.see_doctor_if.map(text => <li key={text}>{text}</li>)}</ul>
          <p>{guidance.footer}</p>
        </>}
        <a className="btn btn-ghost" href="#selfcare-care-flow">Continue to doctor care options</a>
        <p className="empty">Booking still requires complete safety screening and your explicit confirmation. Guidance is not stored in your medical record.</p>
        <button className="btn btn-ghost btn-sm" disabled={disabled || busy} onClick={() => void submit({ reset: true })}>Restart self-care questions</button>
      </>}
      {busy && <p role="status">Checking current safety information…</p>}
    </div>
  </section>;
}