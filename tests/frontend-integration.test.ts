import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScreeningPanel } from '../src/components/ScreeningPanel.tsx';
import { CareRouteBanner } from '../src/components/CareRouteBanner.tsx';
import { SummaryPanel } from '../src/components/SummaryPanel.tsx';
import { emptyScreening, RED_FLAG_RULES } from '../server/rules/redFlags.ts';
import { canOfferBooking } from '../src/ui.ts';
import type { Snapshot } from '../shared/types.ts';

test('frontend renders a control for every backend screening rule plus adult eligibility', () => {
  // Static rendering cannot run the browser API-loading effect. Supply the
  // backend's actual rule catalog explicitly; do not duplicate a UI rule list.
  const html = renderToStaticMarkup(createElement(ScreeningPanel, {
    screening: emptyScreening(), onChange: () => {},
    initialCatalog: { ruleVersion: 'test', adultRequired: true, questions: RED_FLAG_RULES.map(rule => ({ key: rule.screeningKey!, text: rule.label })) },
  }));
  assert.match(html, /0\/18 answered/);
  assert.match(html, /Is the patient an adult/);
  assert.match(html, /Chest pain described as squeezing/);
  assert.match(html, /Chest pain spreading to arm/);
  const groups = html.match(/role="group"/g) ?? [];
  assert.equal(groups.length, RED_FLAG_RULES.length + 2);
});

test('presentation booking gate rejects emergency, unknowns and existing booking', () => {
  const snapshot = { booking: null, decision: { route: 'video', missing: [] } } as unknown as Snapshot;
  assert.equal(canOfferBooking(snapshot), true);
  assert.equal(canOfferBooking({ ...snapshot, decision: { ...snapshot.decision, route: 'emergency' } }), false);
  assert.equal(canOfferBooking({ ...snapshot, decision: { ...snapshot.decision, missing: ['unanswered'] } }), false);
  assert.equal(canOfferBooking({ ...snapshot, booking: { id: 'existing' } as Snapshot['booking'] }), false);
});

test('emergency heading is not overwritten by a previous booking', () => {
  const html = renderToStaticMarkup(createElement(CareRouteBanner, {
    decision: { route: 'emergency', title: 'Emergency care now', explanation: 'Seek urgent help', triggered: [], missing: [], ruleVersion: 'test' },
    booking: { id: 'old', encounterId: 'demo', slotId: 'slot', doctorName: 'Fictional doctor', startsAt: new Date().toISOString(), mode: 'video', fee: 500, createdAt: new Date().toISOString() },
  }));
  assert.match(html, /Emergency care now/);
  assert.doesNotMatch(html, /Appointment booked —/);
});

test('doctor briefing is read-only when no patient-confirm callback is supplied', () => {
  const html = renderToStaticMarkup(createElement(SummaryPanel, {
    fields: [{ key: 'concern', value: 'reported cough', sourceId: 'source', verification: 'unverified', transformation: 'none' }],
    messages: [{ id: 'source', role: 'patient', text: 'reported cough', language: 'en', translation: 'original', createdAt: new Date().toISOString() }],
    onSource: () => {},
  }));
  assert.doesNotMatch(html, /I confirm this is accurate/);
  assert.doesNotMatch(html, /Confirm recorded wording/);
  assert.match(html, /Unverified/i);
});