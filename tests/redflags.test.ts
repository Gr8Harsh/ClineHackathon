import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRedFlags, emptyScreening, RED_FLAG_RULES } from '../server/rules/redFlags.ts';
import { decideCareRoute } from '../server/rules/careRoute.ts';

const sc = (answers: Record<string, string>) => {
  const s = emptyScreening();
  for (const [k, v] of Object.entries(answers)) s.answers[k] = v as never;
  return s;
};

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
  const d = decideCareRoute({ ...emptyScreening(), physicalExam: 'no' }, ['cough'], { video: true, inPerson: true });
  assert.equal(d.route, 'video');
});

test('care route: exam unknown -> clarification, never a guess', () => {
  const d = decideCareRoute({ ...emptyScreening(), physicalExam: 'unknown' }, [], { video: true, inPerson: true });
  assert.equal(d.route, 'clarification');
});

test('care route: no video slots falls back to in-person', () => {
  const d = decideCareRoute({ ...emptyScreening(), physicalExam: 'no' }, ['cough'], { video: false, inPerson: true });
  assert.equal(d.route, 'in-person');
});