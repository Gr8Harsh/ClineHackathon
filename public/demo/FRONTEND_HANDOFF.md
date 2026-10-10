# Frontend integration checkpoint

## Integrated baseline

- Branch: `feat/frontend-flow`.
- Backend checkpoint `2c69b26` from `feat/backend-core` merged without editing backend-owned implementation, shared types or dependencies.
- Subsequently synchronized combined checkpoint `c38f2eb` into the frontend branch. Resolved the two frontend merge conflicts by retaining server-loaded screening and exact-source navigation. Adapted the incoming frontend render test to explicitly provide the backend rule catalog; backend domain/API tests remain unchanged.
- Frontend consumes `GET /api/screening/questions` and renders its 18 questions, including chest-pressure and radiating-pain questions. Unknown remains unknown.
- API client supports adult, purpose and exam preference updates already provided by the server.

## Completed frontend hardening

- Persistent encounter across view switches and reloads; only the encounter ID enters session storage. In-memory operation remains available when browser storage is blocked.
- Transient restore failure preserves the ID and blocks stale editing/booking until refresh succeeds. A genuine 404 clears an unavailable encounter.
- Serialized mutations; old slot/encounter responses cannot replace current state.
- Proposal expires visibly; changes to encounter version invalidate prior slot/proposal state.
- Before explicit confirmation, refresh server snapshot and recheck route, version, mode and expiry. This is a UI safeguard, not server authorization.
- Confirmation tokens remain ephemeral in the request closure. A lost booking response triggers a read-back, never automatic rebooking.
- Doctor evidence navigation opens collapsed content before focusing the exact source. Doctor briefing has no patient-confirm controls.
- Clarification exchange is available with explicit refresh. Failed question submission requires read-back before retry.
- Documents preserve leading/trailing blank lines; multiple reports remain available. No observation verification is invented.
- Trace polling is limited to the open, active panel and marks failures/staleness. Evaluation failure retains clearly labelled previous results.
- Missing/fixture/unverified translations are distinguished. Guided English follow-ups are not labelled Assamese.

## Reproducible verification

Measured on 2026-10-10 with backend checkpoint `2c69b26` and the frontend finishing changes:

- Production TypeScript/Vite build passed.
- Combined automated suite: **28 tests passed, 0 failed**, including the four incoming frontend integration tests.
- Deterministic routing evaluation: **20/20 passed**.
- Headless Chrome frontend harness: **20/20 checkpoints passed**, including deliberately injected failure paths; no uncaught browser exceptions.
- Desktop 1280×900 and mobile 390×844 screenshots captured and inspected. This is limited viewport/keyboard coverage, not a full accessibility or physical-device audit.

These are point-in-time results, not clinical validation or future guarantees. Re-run on the final integration commit before recording.

From the clone root:

```sh
npm run check
node src/qa/browser-smoke.mjs
```

The browser harness uses Node built-ins and an installed Chrome/Edge through the browser debugging protocol. No package, lockfile, shared config or backend-test framework changes. Set `CHROME_PATH` if the browser lives elsewhere; `QA_PORT` and `QA_DEBUG_PORT` can override defaults 3017 and 9237.

It builds no fake product events. It launches a local API with an isolated temporary synthetic database, a separate temporary browser profile, and the already-built production frontend. It disables live language-service credentials in that child process. Resources are stopped after the run. If the browser still locks its temporary profile, the path is reported for cleanup.

Results and desktop/mobile screenshots go to ignored `test-results/`. The harness exits nonzero on failure. A failed run may list only checkpoints reached before the failure; do not treat partial results as a complete pass.

### Real backend/browser checks

- Intake, missing fields, exact patient-source focus.
- Patient tab persistence and reload; ID-only session storage.
- Read-only doctor source navigation through collapsed details; clarification round trip.
- All 18 server screening controls plus adult/exam controls.
- Multiple reports, source line 3 after a leading blank line, unsupported extraction.
- Actual slot → proposal → explicit confirmation → returned booking receipt.
- A real competing booking produces a conflict, not a success receipt. This is sequential conflict handling, **not a concurrency proof**.
- Existing booking never overrides emergency warning; routine controls disappear.
- Real trace retrieval and actual evaluation scoreboard.
- 390px mobile overflow check and a keyboard Tab focus check.
- Assamese original preserved, missing English rendering labelled, English guided follow-up labelled English.

### Explicit test-only fault injection

The harness intercepts fetch only inside its isolated browser to exercise:

- Slot empty/error states, expired proposal and delayed stale slot response.
- Evaluation outage and a labelled `QA-FIXTURE-NOT-REAL` failing scoreboard.
- Trace outage/recovery and temporary encounter fetch failure.
- Dropped response after a real successful booking; receipt reconciled from server state.
- Rapid doctor encounter selection with a delayed response for the older selection.

These fixtures are never included in the application bundle, silently substituted for API failures or presented as real demo results.

## Backend owner follow-up

The merged checkpoint still explicitly leaves server-side proposal/confirmation/booking eligibility, transactional revalidation, doctor-time collision handling, idempotency and separate-process race tests unfinished. Browser safeguards cannot enforce these server invariants.

Live translation, verified SDK execution, trace isolation and authentication also remain backend/integration work. Please publish contract changes before frontend adaptation.

## Remaining human/release verification

- Native-speaker review of Assamese/Hindi copy and any real translated output.
- Live model integration testing, if a key is supplied securely on the server.
- Screen-reader and comprehensive accessibility audit; current browser checks are not WCAG certification.
- Physical mobile devices and non-Chromium browsers; headless mobile viewport checks do not establish device coverage.
- Final recording and slide production using `DEMO_GUIDE.md`.
- Review the integration PR before merge; source publication does not authorize public deployment.