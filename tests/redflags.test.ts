import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRedFlags, emptyScreening, RED_FLAG_RULES } from '../server/rules/redFlags.ts';
import { decideCareRoute } from '../server/rules/careRoute.ts';

const sc = (answers: Record<string, string>) => {
  const s = emptyScreening();
  for (const [k, v] of Object.entries(answers)) s.answers[k] = v as never;
  return s;
};
const complete = () => ({ ...emptyScreening(), adult: 'yes' as const,
  answers: Object.fromEntries(Object.keys(emptyScreening().answers).map(k => [k, 'no' as const])) });

test('rule set has between 15 and 20 rules, each with a citation', () => {
  assert.ok(RED_FLAG_RULES.length >= 15 && RED_FLAG_RULES.length <= 20, `expected 15-20 rules, got ${RED_FLAG_RULES.length}`);
  for (const r of RED_FLAG_RULES) {
    assert.ok(r.citation.length > 10, `${r.id} missing citation`);
    assert.ok(r.citationUrl.startsWith('https://'), `${r.id} missing citation URL`);
  }
});

test('explicit yes triggers emergency; explicit no does not', () => {
  const yes = evaluateRedFlags(sc({ breathlessSevere: 'yes' }), []);
  assert.equal(yes.triggered.some(t => t.id === 'RF-03'), true);
  const no = evaluateRedFlags(sc({ breathlessSevere: 'no' }), []);
  assert.equal(no.triggered.some(t => t.id === 'RF-03'), false);
});

test('missing (unknown) safety answers never trigger a rule', () => {
  const result = evaluateRedFlags(emptyScreening(), []);
  assert.equal(result.triggered.length, 0, 'no rule should fire when everything is unknown');
  assert.ok(result.missingSafety.length > 0, 'missing safety answers must be reported');
});

test('free-text red flags are detected even before structured answers', () => {
  const result = evaluateRedFlags(emptyScreening(), ['I am vomiting blood']);
  assert.equal(result.triggered.some(t => t.id === 'RF-15'), true);
});

test('negated symptom text does not trigger a red flag', () => {
  const result = evaluateRedFlags(emptyScreening(), ['I do not have chest pain, I have a sore throat']);
  assert.equal(result.triggered.some(t => t.id === 'RF-01'), false);
});

test('care route: emergency always wins over routine routing', () => {
  const d = decideCareRoute(sc({ breathlessSevere: 'yes' }), ['chest pain'], { video: true, inPerson: true });
  assert.equal(d.route, 'emergency');
});

test('care route: no exam needed + video available -> video', () => {
  const d = decideCareRoute({ ...complete(), physicalExam: 'no' }, ['cough'], { video: true, inPerson: true });
  assert.equal(d.route, 'video');
});

test('care route: exam unknown -> clarification, never a guess', () => {
  const d = decideCareRoute({ ...emptyScreening(), physicalExam: 'unknown' }, [], { video: true, inPerson: true });
  assert.equal(d.route, 'clarification');
});

test('care route: unavailable requested mode remains unresolved', () => {
  const d = decideCareRoute({ ...complete(), physicalExam: 'no' }, ['cough'], { video: false, inPerson: true });
  assert.equal(d.route, 'clarification');
});

test('all missing safety answers block routine routing even with exam preference', () => {
  const d = decideCareRoute({ ...emptyScreening(), adult: 'yes', physicalExam: 'no' }, [], { video: true, inPerson: true });
  assert.equal(d.route, 'clarification');
  assert.equal(evaluateRedFlags(emptyScreening()).missingSafety.length, 18);
});

test('adult eligibility and every individual unknown block routine routing', () => {
  const s = { ...complete(), physicalExam: 'no' as const };
  assert.equal(decideCareRoute({ ...s, adult: 'no' }, [], { video: true, inPerson: true }).route, 'clarification');
  for (const key of Object.keys(s.answers)) {
    assert.equal(decideCareRoute({ ...s, answers: { ...s.answers, [key]: 'unknown' } }, [], { video: true, inPerson: true }).route, 'clarification', key);
  }
});

test('negation in another clause does not suppress an emergency mention', () => {
  for (const text of ['No fever, but chest pain', 'No chest pain but I cannot breathe', 'No chest pain; chest pressure now']) {
    assert.ok(evaluateRedFlags(emptyScreening(), [text]).triggered.length > 0, text);
  }
});

test('structured positive overrides negated text', () => {
  assert.equal(decideCareRoute(sc({ chestPressure: 'yes' }), ['no chest pain'], { video: true, inPerson: true }).route, 'emergency');
});