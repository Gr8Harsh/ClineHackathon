import { Fragment, useEffect, useState } from 'react';
import type { Screening, Answer } from '../../shared/types.ts';
import { api } from '../api.ts';

type QuestionCatalog = Awaited<ReturnType<typeof api.screeningQuestions>>;

function Toggle({ value, onChange, label, disabled }: { value: Answer; onChange: (a: Answer) => void; label: string; disabled: boolean }) {
  return (
    <span className="answer-toggle" role="group" aria-label={label}>
      {(['yes', 'no', 'unknown'] as Answer[]).map(a => (
        <button
          key={a}
          disabled={disabled}
          aria-pressed={value === a}
          className={value === a ? `on-${a}` : ''}
          onClick={() => onChange(a)}
        >
            {a === 'yes' ? 'Yes' : a === 'no' ? 'No' : 'Not sure'}
        </button>
      ))}
    </span>
  );
}

export function ScreeningPanel({
  screening, onChange, busy = false, initialCatalog,
}: {
  screening: Screening;
  onChange: (body: Parameters<typeof api.setScreening>[1]) => void;
  busy?: boolean;
  initialCatalog?: QuestionCatalog;
}) {
  const [catalog, setCatalog] = useState<QuestionCatalog | null>(initialCatalog ?? null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError('');
    api.screeningQuestions().then(value => { if (!cancelled) setCatalog(value); })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [retry]);
  const questions = catalog?.questions ?? [];
  const answered = questions.filter(q => ['yes', 'no'].includes(screening.answers[q.key])).length;
  return (
    <section className="card">
      <header>
        Safety screening <span className="sub">{catalog ? `${answered}/${questions.length} answered · ${catalog.ruleVersion}` : 'Loading server questions…'}</span>
      </header>
      <div className="body" style={{ paddingTop: 8, paddingBottom: 8 }}>
        {error && <p className="notice" role="alert">Unable to load screening questions: {error} <button className="btn btn-ghost btn-sm" onClick={() => setRetry(r => r + 1)}>Retry screening questions</button></p>}
        <p className="empty">Questions are provided in English. Do not guess an answer if the wording is unclear; seek help understanding it. These illustrative questions do not establish medical clearance.</p>
        <label className="input-label" htmlFor="visit-purpose">Reason for consultation</label>
        <select id="visit-purpose" value={screening.purpose} disabled={busy} onChange={e => onChange({ purpose: e.target.value as Screening['purpose'] })}>
          <option value="new-concern">New concern</option><option value="report-review">Report review</option><option value="follow-up">Follow-up</option>
        </select>
        <p className="empty">Age is optional consultation information, not an eligibility gate. The application coordinates care mode; patients do not decide examination suitability.</p>
        <p className="empty" style={{ margin: '0 0 8px' }}>
          Answer “No” to a red-flag question only if it is truly absent. An unanswered question stays unknown and is shown as missing — it is never treated as “no”.
        </p>
        <div className="screening-grid">
          {questions.map(q => (
            <Fragment key={q.key}>
              <span className="q" style={{ fontSize: 13 }}>{q.text}</span>
              <Toggle
                label={q.text} disabled={busy}
                value={screening.answers[q.key] ?? 'unknown'}
                onChange={a => onChange({ key: q.key, answer: a })}
              />
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}