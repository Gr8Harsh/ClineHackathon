# Backend checkpoint 1 — frontend integration contract

Branch: `feat/backend-core`. No frontend source, public assets, shared types, or dependencies were changed.

## What now works

- TypeScript and Vite production build.
- Local HTTP intake → source-linked briefing → structured screening → route.
- Immediate deterministic emergency reply before any language-service call.
- Plain-text document extraction preserving the original text, including blank lines.
- One doctor clarification and patient answer round trip.
- Invalid language/body/screening inputs produce 400; missing encounters and endpoints produce JSON 404.
- Offline doctors and doctors without video capability have no eligible video slots returned.
- Server-side booking eligibility: proposals and bookings are rejected for emergency or unresolved screening, for mode mismatches, and for unavailable doctors.
- A doctor cannot hold two appointments at the same start time, including across video/in-person modes.
- A retried successful booking returns the same booking (idempotent) instead of duplicating.
- Two separate OS processes racing for one slot: exactly one wins (a true multi-process test).
- Guided operation does not import the full SDK at startup. Live SDK execution remains unverified.

## Screening: frontend changes needed

`GET /api/screening/questions` returns:

```ts
{ ruleVersion: string; questions: { key: string; text: string }[]; adultRequired: true }
```

There are 18 questions. Two new keys are `chestPressure` and `radiatingChestPain`. Prefer rendering the returned questions over maintaining a separate hardcoded list. Existing records missing a new key remain unknown; do not initialize their answers to no.

POST to `/api/encounters/:id/screening` accepts one or more of:

```ts
{ key?: string; answer?: 'yes' | 'no' | 'unknown';
  adult?: 'yes' | 'no' | 'unknown';
  physicalExam?: 'yes' | 'no' | 'unknown';
  purpose?: 'new-concern' | 'report-review' | 'follow-up' }
```

Key and answer must be supplied together. Unknown keys, unsupported values, additional properties, and empty updates are rejected. Each request returns Snapshot.

Routine routing requires all listed safety answers to be explicit, adult=yes, and an explicit examination preference. Any listed positive answer produces emergency regardless of missing fields. All missing answers remain visible. `screening.completed` reports whether all listed warning-sign questions have explicit answers; it is not clinical clearance or overall eligibility.

Examination=yes requests in-person; examination=no requests video. No suitable available mode produces clarification, not an automatic downgrade. This is a patient-requested coordination mode requiring clinician suitability assessment, not validated triage. Purpose never bypasses safety gates.

The existing frontend needs adult controls, the two extra warning-sign questions, and updated API-client input types. Until that is integrated the stricter server may correctly keep routing unresolved.

## Briefing evidence

The first patient statement is the concern. Duration can be copied from an explicit phrase such as `for 3 days`. Other fields use explicit messages:

```text
history: patient reports diabetes
medications: metformin
allergies: none reported
duration: 3 days
```

Fields copy the supported statement and link to that message ID. Mentioning aspirin no longer automatically establishes a medication or allergy. Missing fields stay null. Any available English rendering is marked as a transformation and remains unverified. This deterministic format is intentionally narrow until reviewed language structuring is integrated.

Exact yes/no/unknown replies to the current guided question can update that answer. Contextual/contradictory replies like `no fever but cannot breathe` are not interpreted as a negative answer. Guided follow-ups are in English and labeled language=en; do not label them Assamese simply because the patient chose Assamese.

## Measured checks

`npm run check`: build passes; 31 tests pass; 20/20 scripted deterministic evaluations pass with rule version `sehat-redflags-v0.2.0-illustrative`.

The HTTP test exercises valid/invalid input, explicit source IDs, each screening answer, routing, lab source lines, clarification, emergency interruption, eligible video listings, a booking-bypass rejection, and built index serving. Browser rendering and real translation have not been tested.

Booking tests now cover server-side eligibility (unresolved and emergency), mode matching, doctor-time collision prevention, idempotent retry, in-process racing, and a genuine two-OS-process race with exactly one winner.

## Remaining work

Phase 3: translation, verified live SDK flow, improved trace scoping, and integration/browser checks. Local synthetic data only; authentication remains absent. Server-side booking now rejects emergency/unresolved routing, enforces mode and doctor availability, prevents same-time double-booking, and returns idempotent retries; the multi-process race proves one winner.