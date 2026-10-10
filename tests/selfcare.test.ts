import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { answerSelfCare, createSelfCareSession, evaluateSelfCare, matchSelfCareTopics, SELFCARE_REFUSAL, SELFCARE_TOPICS } from '../server/domain/selfcare.ts';
import { emptyScreening } from '../server/rules/redFlags.ts';
import { decideCareRoute } from '../server/rules/careRoute.ts';
import { SelfCarePanel } from '../src/components/SelfCarePanel.tsx';
import type { Encounter, Snapshot } from '../shared/types.ts';

function encounter(text = 'I have a fever'): Encounter {
  const screening = emptyScreening();
  for (const key of Object.keys(screening.answers)) screening.answers[key] = 'no';
  screening.adult = 'yes'; screening.physicalExam = 'no';
  return { id: 'synthetic', name: 'Synthetic patient', language: 'en', version: 1, createdAt: '2026-10-10',
    messages: [{ id: 'original', text, role: 'patient', language: 'en', translation: 'original', createdAt: '2026-10-10' }],
    screening, fields: [], documents: [] };
}
function completed(enc: Encounter) {
  const session = createSelfCareSession(enc);
  for (let turn = 0; turn < 40; turn++) {
    const result = evaluateSelfCare(enc, session);
    if (result.status !== 'question') return session;
    const q = result.nextQuestion!;
    const value = q.id === 'risk.age' || q.id === 'topic.age' ? '360' : q.kind === 'number' ? '1' : q.kind === 'yesno' ? 'no' : 'Synthetic patient answer';
    answerSelfCare(enc, session, q.id, value);
  }
  throw new Error('Question loop did not finish');
}

test('catalogue has nine sourced draft topics, no fabricated reviews or translations', () => {
  assert.equal(SELFCARE_TOPICS.length, 9);
  for (const t of SELFCARE_TOPICS) {
    assert.equal(t.reviewed_by, null); assert.equal(t.reviewed_on, null);
    assert.equal(t.review_status, 'needs_clinician_review');
    for (const s of [t.title, ...t.ask_first, ...t.comfort_measures, ...t.avoid, ...t.see_doctor_if, ...t.go_now_if, t.care_time_limit]) {
      assert.equal(s.hi, 'TODO_TRANSLATE'); assert.equal(s.as, 'TODO_TRANSLATE');
    }
    assert.deepEqual(t.excluded_groups, ['infant', 'under5', 'pregnant', 'over65', 'chronic']);
  }
});
test('emergency blocks self-care including an unsupported topic', () => {
  const enc = encounter('I cannot breathe and want dental guidance');
  const result = evaluateSelfCare(enc, createSelfCareSession(enc));
  assert.equal(result.status, 'emergency'); assert.equal(result.guidance, undefined);
});
test('infant with fever goes now; pregnancy, children, elderly and chronic illness skip self-care', () => {
  for (const [id, value, expected] of [['risk.age','2','emergency'], ['risk.age','48','doctor'], ['risk.age','160','doctor'], ['risk.age','800','doctor'], ['risk.pregnant','yes','doctor'], ['risk.chronic','yes','doctor']] as const) {
    const enc = encounter(); const session = createSelfCareSession(enc);
    session.answers[id] = { sourceId: 'patient-answer', text: value };
    assert.equal(evaluateSelfCare(enc, session).status, expected);
    assert.equal(evaluateSelfCare(enc, session).guidance, undefined);
  }
  const enc = encounter('I am pregnant and have a headache');
  assert.equal(evaluateSelfCare(enc, createSelfCareSession(enc)).status, 'doctor');
});
test('unknown topics refuse, negated topics do not match, ambiguous matches require selection', () => {
  const enc = encounter('Please advise about toothache');
  const result = evaluateSelfCare(enc, createSelfCareSession(enc));
  assert.equal(result.status, 'refused'); assert.equal(result.message, SELFCARE_REFUSAL);
  assert.equal(matchSelfCareTopics('no fever').length, 0);
  assert.equal(matchSelfCareTopics('fever and cough').length, 2);
});
test('missing safety and demographic answers never become negative; unknown reasks same question', () => {
  const enc = encounter(); enc.screening.answers.chestPressure = 'unknown';
  assert.equal(evaluateSelfCare(enc, createSelfCareSession(enc)).status, 'screening_required');
  enc.screening.answers.chestPressure = 'no';
  const session = createSelfCareSession(enc);
  const first = evaluateSelfCare(enc, session);
  assert.equal(first.nextQuestion?.id, 'risk.age');
  assert.equal(first.questions[1].status, 'not_asked');
  const after = answerSelfCare(enc, session, 'risk.age', 'unknown');
  assert.equal(after.nextQuestion?.id, 'risk.age');
  assert.throws(() => answerSelfCare(enc, session, 'risk.pregnant', 'no'), /current question/);
  assert.throws(() => answerSelfCare(enc, session, 'risk.age', '-1'), /nonnegative/);
});
test('questions precede draft-review block, no advice enters messages or briefing', () => {
  const enc = encounter(); const before = JSON.stringify(enc);
  const session = completed(enc);
  const result = evaluateSelfCare(enc, session);
  assert.equal(result.status, 'review_required'); assert.equal(result.guidance, undefined);
  assert.equal(JSON.stringify(enc), before);
  assert.ok(result.evidence.every(e => e.tag === 'Patient reported'));
});
test('reviewed test fixture returns only catalogue text with source footer and deadline', () => {
  const enc = encounter(); const session = completed(enc);
  // Synthetic test-only review metadata is never saved to the real catalogue.
  const topics = structuredClone(SELFCARE_TOPICS);
  topics[0].review_status = 'reviewed'; topics[0].reviewed_by = 'TEST FIXTURE ONLY'; topics[0].reviewed_on = '2026-10-10'; topics[0].translation_reviewed.en = true;
  const result = evaluateSelfCare(enc, session, topics);
  assert.equal(result.status, 'guidance');
  assert.deepEqual(result.guidance?.comfort_measures, topics[0].comfort_measures.map(s => s.en));
  assert.deepEqual(result.guidance?.avoid, topics[0].avoid.map(s => s.en));
  assert.match(result.guidance!.footer, /2 days/);
  topics[0].reviewed_by = null;
  assert.equal(evaluateSelfCare(enc, session, topics).status, 'review_required');
});
test('TODO translations and stale sessions block; new red flags take priority', () => {
  const enc = encounter(); enc.language = 'as';
  assert.equal(evaluateSelfCare(enc, createSelfCareSession(enc)).status, 'translation_unavailable');
  enc.language = 'en'; const session = completed(enc); enc.version++;
  assert.equal(evaluateSelfCare(enc, session).status, 'screening_required');
  enc.messages[0].text = 'chemical burn';
  assert.equal(evaluateSelfCare(enc, session).status, 'emergency');
});
test('patient emergency answer latches routing and suppresses panel after restart', () => {
  const enc = encounter(); const session = createSelfCareSession(enc);
  answerSelfCare(enc, session, 'risk.age', '360');
  answerSelfCare(enc, session, 'risk.pregnant', 'no');
  answerSelfCare(enc, session, 'risk.chronic', 'no');
  const result = answerSelfCare(enc, session, 'safety.breath', 'yes');
  assert.equal(result.status, 'emergency'); assert.equal(enc.messages.length, 1);
  const decision = decideCareRoute(enc.screening, [], { video: true, inPerson: true });
  assert.equal(decision.route, 'emergency');
  assert.equal(evaluateSelfCare(enc, createSelfCareSession(enc)).status, 'emergency');
  const snapshot = { encounter: enc, decision, booking: null, proposal: null } as Snapshot;
  assert.equal(renderToStaticMarkup(createElement(SelfCarePanel, { snapshot, disabled: false, onSnapshot: () => {} })), '');
});
test('supplemental draft signs block before topic matching; negation stays negative', () => {
  for (const text of ['snake bite', 'bloody stool', 'no urine for 8 hours', 'sunken eyes', 'worst headache', 'throat swelling', 'trouble breathing']) {
    const enc = encounter(text); assert.equal(evaluateSelfCare(enc, createSelfCareSession(enc)).status, 'emergency', text);
  }
  const enc = encounter('no trouble breathing but fever');
  assert.equal(evaluateSelfCare(enc, createSelfCareSession(enc)).status, 'question');
});

test('duration thresholds, ambiguous-topic selection and non-minor burns fail closed', () => {
  const enc = encounter('fever and cough'); const session = createSelfCareSession(enc);
  session.answers['risk.age'] = { sourceId: 'age', text: '360' };
  session.answers['risk.pregnant'] = { sourceId: 'pregnancy', text: 'no' };
  session.answers['risk.chronic'] = { sourceId: 'chronic', text: 'no' };
  for (const id of ['breath','neurology','bleeding','exposure','allergy','pregnancy','infant','dehydration','selfharm']) session.answers[`safety.${id}`] = { sourceId: id, text: 'no' };
  assert.equal(evaluateSelfCare(enc, session).nextQuestion?.id, 'topic.choice');
  assert.equal(answerSelfCare(enc, session, 'topic.choice', 'invented').nextQuestion?.id, 'topic.choice');
  assert.equal(answerSelfCare(enc, session, 'topic.choice', 'fever').nextQuestion?.id, 'topic.age');
  answerSelfCare(enc, session, 'topic.age', '360');
  assert.equal(answerSelfCare(enc, session, 'topic.duration', '3').status, 'doctor');
  const burns = encounter('burn'); const burnSession = createSelfCareSession(burns);
  burnSession.answers['risk.age'] = { sourceId: 'age', text: '48' };
  assert.equal(evaluateSelfCare(burns, burnSession).status, 'emergency');
});

test('medicine requests refuse and uncertainty is not a completed free-text answer', () => {
  const enc = encounter('fever: what medicine and dose should I use?');
  assert.equal(evaluateSelfCare(enc, createSelfCareSession(enc)).status, 'refused');
  const cuts = encounter('cut'); const session = createSelfCareSession(cuts);
  session.answers['risk.age'] = { sourceId: 'age', text: '360' };
  session.answers['risk.pregnant'] = { sourceId: 'pregnant', text: 'no' };
  session.answers['risk.chronic'] = { sourceId: 'chronic', text: 'no' };
  for (const id of ['breath','neurology','bleeding','exposure','allergy','pregnancy','infant','dehydration','selfharm']) session.answers[`safety.${id}`] = { sourceId: id, text: 'no' };
  answerSelfCare(cuts, session, 'topic.deep', 'no');
  answerSelfCare(cuts, session, 'topic.stopping', 'yes');
  answerSelfCare(cuts, session, 'topic.dirty', 'no');
  assert.equal(answerSelfCare(cuts, session, 'topic.tetanus', 'not sure').nextQuestion?.id, 'topic.tetanus');
});

test('emergency has priority over exclusions and session expiry', () => {
  const enc = encounter(); const session = createSelfCareSession(enc);
  session.answers['risk.pregnant'] = { sourceId: 'pregnant', text: 'yes' };
  session.answers['safety.breath'] = { sourceId: 'warning', text: 'yes' };
  session.expiresAt = 0;
  assert.equal(evaluateSelfCare(enc, session).status, 'emergency');
});