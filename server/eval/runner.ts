import { Answer, EvalReport, EvalResult, Screening } from '../../shared/types.ts';
import { decideCareRoute } from '../rules/careRoute.ts';
import { emptyScreening, RULE_VERSION } from '../rules/redFlags.ts';
import { trace } from '../trace.ts';
import { getDb } from '../db.ts';
import { nowIso } from '../lib/ids.ts';

interface EvalCase {
  name: string;
  expected: ReturnType<typeof decideCareRoute>['route'];
  screening: Partial<Screening>;
  text: string[];
}

const sc = (answers: Record<string, Answer>, extra: Partial<Screening> = {}): Partial<Screening> => ({
  ...emptyScreening(), answers: { ...emptyScreening().answers, ...answers }, ...extra,
});
const complete = (extra: Partial<Screening> = {}): Partial<Screening> => ({
  ...emptyScreening(), adult: 'yes',
  answers: Object.fromEntries(Object.keys(emptyScreening().answers).map(k => [k, 'no' as Answer])), ...extra,
});

/** 20 scripted cases: urgent, routine, and ambiguous. No LLM — tests deterministic logic only. */
export const EVAL_CASES: EvalCase[] = [
  { name: 'Chest pain + severe breathlessness', expected: 'emergency', screening: sc({ breathlessSevere: 'yes' }), text: ['crushing chest pain'] },
  { name: 'One-sided weakness + face droop', expected: 'emergency', screening: sc({ oneSidedWeakness: 'yes', faceDroop: 'yes' }), text: [] },
  { name: 'Slurred speech just now', expected: 'emergency', screening: sc({ speechSlurred: 'yes' }), text: [] },
  { name: 'Stroke signs 2 hours ago, stopped', expected: 'emergency', screening: sc({ strokeLast24h: 'yes' }), text: [] },
  { name: 'Fainted and unresponsive', expected: 'emergency', screening: sc({ fainted: 'yes' }), text: ['passed out'] },
  { name: 'Blue lips + confusion', expected: 'emergency', screening: sc({ bluePale: 'yes', confusion: 'yes' }), text: [] },
  { name: 'Rash does not fade when pressed', expected: 'emergency', screening: sc({}), text: ['rash that does not fade when pressed'] },
  { name: 'Seizure', expected: 'emergency', screening: sc({ seizure: 'yes' }), text: [] },
  { name: 'Vomiting blood', expected: 'emergency', screening: sc({}), text: ['I am vomiting blood'] },
  { name: 'Suicidal thoughts', expected: 'emergency', screening: sc({ selfHarm: 'yes' }), text: [] },
  { name: 'Overdose', expected: 'emergency', screening: sc({ overdose: 'yes' }), text: [] },
  { name: 'Routine headache, completed screening, exam needed', expected: 'in-person', screening: complete({ physicalExam: 'yes' }), text: ['headache for 2 days'] },
  { name: 'Routine cough, completed screening, no exam requested', expected: 'video', screening: complete({ physicalExam: 'no' }), text: ['dry cough for 3 days'] },
  { name: 'Routine follow-up, completed screening', expected: 'video', screening: complete({ purpose: 'follow-up', physicalExam: 'no' }), text: ['follow up on my sugar'] },
  { name: 'Exam unsure -> clarification', expected: 'clarification', screening: sc({}, { physicalExam: 'unknown' }), text: ['stomach pain'] },
  { name: 'Negated chest pain, completed screening', expected: 'video', screening: complete({ physicalExam: 'no' }), text: ['I do not have chest pain, just a sore throat'] },
  { name: 'Report review -> clarification', expected: 'clarification', screening: sc({}, { purpose: 'report-review', physicalExam: 'unknown' }), text: [] },
  { name: 'Safety answers missing despite no exam request -> clarification', expected: 'clarification', screening: sc({}, { adult: 'yes', physicalExam: 'no' }), text: ['I feel weak'] },
  { name: 'Rash + fever, completed screening, exam yes', expected: 'in-person', screening: complete({ physicalExam: 'yes' }), text: ['rash and fever for 1 day'] },
  { name: 'Chest pain spreading to arm', expected: 'emergency', screening: sc({}), text: ['chest pain spreading to my left arm'] },
];

export function runSync(): EvalReport {
  const results: EvalResult[] = EVAL_CASES.map(c => {
    const screening = { ...emptyScreening(), ...c.screening, answers: { ...emptyScreening().answers, ...(c.screening.answers ?? {}) } } as Screening;
    const decision = decideCareRoute(screening, c.text, { video: true, inPerson: true });
    return { name: c.name, expected: c.expected, actual: decision.route, passed: decision.route === c.expected };
  });
  const passed = results.filter(r => r.passed).length;
  const report: EvalReport = { generatedAt: nowIso(), ruleVersion: RULE_VERSION, results, passed, total: results.length };
  trace('eval.run', 'completed', `${passed}/${results.length} scripted cases passed`);
  try {
    getDb().prepare('INSERT INTO evaluations (generated_at, rule_version, passed, total, results) VALUES (?,?,?,?,?)')
      .run(report.generatedAt, report.ruleVersion, report.passed, report.total, JSON.stringify(report.results));
  } catch { /* eval still returns the report even if persistence fails */ }
  return report;
}

export async function runEvaluation(): Promise<EvalReport> { return runSync(); }

export function latestReport(): EvalReport | null {
  const row = getDb().prepare('SELECT * FROM evaluations WHERE rule_version = ? ORDER BY generated_at DESC LIMIT 1').get(RULE_VERSION) as
    { generated_at: string; rule_version: string; passed: number; total: number; results: string } | undefined;
  if (!row) return null;
  return { generatedAt: row.generated_at, ruleVersion: row.rule_version, passed: row.passed, total: row.total, results: JSON.parse(row.results) };
}