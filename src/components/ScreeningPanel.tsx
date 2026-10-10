import { Fragment } from 'react';
import type { Screening, Answer } from '../../shared/types.ts';
import type { api } from '../api.ts';

const QUESTIONS: { key: string; label: string }[] = [
  { key: 'chestPressure', label: 'Chest pain described as squeezing or pressure?' },
  { key: 'radiatingChestPain', label: 'Chest pain spreading to arm, neck or jaw?' },
  { key: 'breathlessSevere', label: 'Severe difficulty breathing / gasping?' },
  { key: 'oneSidedWeakness', label: 'Weakness or numbness on one side?' },
  { key: 'faceDroop', label: 'Face drooping on one side?' },
  { key: 'speechSlurred', label: 'Slurred or confused speech?' },
  { key: 'strokeLast24h', label: 'Stroke-like signs in the last 24h?' },
  { key: 'fainted', label: 'Passed out or lost consciousness?' },
  { key: 'bluePale', label: 'Blue, grey or very pale skin/lips?' },
  { key: 'shiveringFever', label: 'Uncontrollable shivering + fever?' },
  { key: 'confusion', label: 'New confusion with infection?' },
  { key: 'noUrine', label: 'Not passed urine all day?' },
  { key: 'nonFadingRash', label: 'Rash that does not fade when pressed?' },
  { key: 'seizure', label: 'Fit or seizure?' },
  { key: 'vomitingBlood', label: 'Vomiting or coughing blood?' },
  { key: 'selfHarm', label: 'Thoughts of self-harm?' },
  { key: 'headInjury', label: 'Severe head injury?' },
  { key: 'overdose', label: 'Poisoning or overdose?' },
];

const EXAM: { key: 'yes' | 'no' | 'unknown'; label: string }[] = [
  { key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }, { key: 'unknown', label: 'Not sure' },
];

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
  screening, onChange, busy = false,
}: {
  screening: Screening;
  onChange: (body: Parameters<typeof api.setScreening>[1]) => void;
  busy?: boolean;
}) {
  const answered = QUESTIONS.filter(q => ['yes', 'no'].includes(screening.answers[q.key])).length;
  return (
    <section className="card">
      <header>
        Safety screening <span className="sub">deterministic · {answered}/{QUESTIONS.length} answered</span>
      </header>
      <div className="body" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <label className="input-label" htmlFor="visit-purpose">Reason for consultation</label>
        <select id="visit-purpose" value={screening.purpose} disabled={busy} onChange={e => onChange({ purpose: e.target.value as Screening['purpose'] })}>
          <option value="new-concern">New concern</option><option value="report-review">Report review</option><option value="follow-up">Follow-up</option>
        </select>
        <div className="screening-grid">
          <span className="q">Is the patient an adult?</span>
          <Toggle label="Is the patient an adult?" value={screening.adult} disabled={busy} onChange={adult => onChange({ adult })} />
        </div>
        <div className="screening-grid" style={{ marginBottom: 10 }}>
          <span className="q">Might a doctor need to examine you in person?</span>
          <span className="answer-toggle" role="group" aria-label="Might a doctor need to examine you in person?">
            {EXAM.map(o => (
              <button
                key={o.key}
                disabled={busy}
                aria-pressed={screening.physicalExam === o.key}
                className={screening.physicalExam === o.key ? `on-${o.key}` : ''}
                onClick={() => onChange({ physicalExam: o.key })}
              >
                {o.label}
              </button>
            ))}
          </span>
        </div>
        <p className="empty" style={{ margin: '0 0 8px' }}>
          Answer “No” to a red-flag question only if it is truly absent. An unanswered question stays unknown and is shown as missing — it is never treated as “no”.
        </p>
        <div className="screening-grid">
          {QUESTIONS.map(q => (
            <Fragment key={q.key}>
              <span className="q" style={{ fontSize: 13 }}>{q.label}</span>
              <Toggle
                label={q.label} disabled={busy}
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