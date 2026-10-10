# SEHAT OS — Frontend teammate / Cline handoff

> **Phase 1 update:** the initial build blocker below has been fixed on `feat/backend-core`. Build, 24 tests, and 20 scripted cases pass. Read `BACKEND_CHECKPOINT_1.md` for the current screening API and explicit briefing format before integrating. The original handoff's status section records the initial scaffold baseline; booking safeguards and live translation remain unfinished.

## Start here

You are the frontend implementation agent in a two-person hackathon team. Inspect the actual clone and present a short plan before editing. Repair the existing scaffold; do not recreate the project. Source repository: https://github.com/Gr8Harsh/ClineHackathon.

The original developer's project root is `C:\Users\harsh\OneDrive\Documents\Cline\sehat-os`. Resolve the equivalent absolute root in your own clone; do not execute commands using another person's machine path.

## Product and judging context

**SEHAT OS: an AI healthcare coordination platform that never pretends to know.**

Tagline: the patient speaks in Assamese; the doctor reads English; every line shows its source and every missing fact is flagged instead of guessed.

Patients in rural areas and small towns may travel for hours without knowing the appropriate care route or doctor availability. Consultations are short, records fragmented, and language a barrier. We prepare and coordinate consultations, not diagnose.

Journey: language selection → intake → follow-ups → structured safety screening → care route → doctor discovery → explicit confirmation → atomic booking → briefing → optional clarification exchange.

Judging: creativity, innovation, usefulness, effective Cline use, usability/execution, and technical implementation. In-product Cline use is an additional opportunity. Deliverables: public repository/README, slides, mandatory working demo video showing Cline during development, optional social post. Prioritize a polished complete journey over breadth.

## Ownership

**You own:** the frontend source and public assets. On the original machine these are `C:\Users\harsh\OneDrive\Documents\Cline\sehat-os\src` and `C:\Users\harsh\OneDrive\Documents\Cline\sehat-os\public`.

**Other developer owns:** backend, SQLite, safety/routing, booking integrity, Cline SDK, translation integration, scripts, tests, and evaluations.

Coordinate before editing shared types, package manifest/lockfile, TypeScript/Vite config, README, or guardrails. Propose the smallest API change needed rather than silently modifying both sides. Dependency and contract ownership initially stays with the backend developer.

## Honest current status

This is a substantial but unverified scaffold, not a finished application. The latest TypeScript run reported a backend error: Express request parameters can be `string | string[]`, while encounter lookup expects `string`. Backend owner will repair it. Full browser and API integration have not been verified.

Historical runs reported 15 tests and 20 scripted cases passing. These results are limited and must not be used as current guarantees. The earlier race tests use one process and do not prove actual simultaneous independent database transactions. Genuine concurrency testing belongs to the backend owner.

Known backend work: incomplete-screening routing gates, server-side booking eligibility, safer provenance extraction and negation handling, live translation verification, and input/error handling. Authentication is not implemented; all data must be synthetic and the demo local-only. Traces are currently global demo traces, not patient-isolated. Never hide these limitations with frontend success messages.

## Stack and setup

Node 24+, React 19, TypeScript, Vite 8, plain CSS, Express 5, `node:sqlite`, Zod, Cline SDK 0.0.92, and Node tests through `tsx`.

From your clone root run `npm ci`, then `npm run dev`. Frontend normally uses 127.0.0.1:5173; backend uses 127.0.0.1:3001; Vite proxies `/api`. Other commands: `npm run build`, `npm test`, `npm run eval`, `npm run check`. Build currently needs the backend repair noted above.

No new component framework, router, icon package, state library, or testing framework without agreement. Use existing React/CSS/browser capabilities. Use `npm ci` to avoid uncoordinated lockfile changes.

Optional backend variables: `ANTHROPIC_API_KEY`, `CLINE_MODEL`. Never expose secrets in frontend code, browser storage, screenshots, Git, or `VITE_*` variables. Without a key this is guided mode, not live AI translation. A configured key is not proof of a successful live call.

## Git workflow

Clone the supplied repository and verify the Git root is your project, not a parent directory. Work on `feat/frontend-flow`; backend works on `feat/backend-core`. Use small commits and pull requests to `main`. Pull agreed contract changes at integration checkpoints. No force pushes, destructive resets, dependency/database commits, or overwriting another developer's changes. Report backend failures rather than editing backend-owned files.

## Existing frontend structure

Under your resolved frontend directory, inspect these existing modules (names below are inventory, not absolute commands):

- Entry/API: `main.tsx`, `App.tsx`, `api.ts`, `styles.css`.
- Views: `PatientView.tsx`, `DoctorView.tsx`, `EvalView.tsx`.
- Components: `CareRouteBanner.tsx`, `SummaryPanel.tsx`, `ScreeningPanel.tsx`, `DoctorPicker.tsx`, `DocumentPanel.tsx`, `TracePanel.tsx`.

Shared contract on the original machine: `C:\Users\harsh\OneDrive\Documents\Cline\sehat-os\shared\types.ts`. Import its equivalent in your clone; do not duplicate incompatible types.

## Data contract

- Language: `en | hi | as`.
- Answer: `yes | no | unknown`.
- Route: `emergency | clarification | video | in-person`.
- Snapshot: `{ encounter, decision, booking }`, where booking may be null.
- Encounter: ID, name, language, messages, briefing fields, screening, documents, optional clarification, timestamp/version.
- Message: ID, role, original text, language, optional English rendering, translation status (`original | unverified | fixture`), timestamp.
- BriefField: key (`concern | duration | history | medications | allergies`), value/null, sourceId/null, verification (`unverified | patient-confirmed`), transformation (`none | translation`).
- CareDecision: route, title, explanation, triggered rules, missing information, rule version.
- LabObservation: name/value/unit, exact one-based source line, sourceText, verification.
- TraceEvent: ID/time/name/status/detail, origin (`application | cline-sdk`).
- EvalReport: timestamp, rule version, results, passed/total counts.

Checked-in types remain authoritative. An optional `english` property is not proof translation is implemented.

## API inventory

Use the existing frontend API client as the integration boundary.

| Endpoint | Contract |
|---|---|
| GET /api/health | `{ok, agentMode, ruleVersion}` |
| POST /api/encounters | `{language, name?}` → Snapshot |
| GET /api/encounters | Encounter metadata list |
| GET /api/encounters/:id | Snapshot |
| POST /api/encounters/:id/messages | `{text}` → `{message, snapshot}` |
| POST /api/encounters/:id/screening | Screening update → Snapshot |
| POST /api/encounters/:id/fields/:key/confirm | Empty body → Snapshot |
| POST /api/encounters/:id/documents | `{name,text}` → `{document,snapshot}` |
| GET /api/doctors?mode=video | AvailableDoctor[] |
| GET /api/doctors?mode=in-person | AvailableDoctor[] |
| POST /api/encounters/:id/proposals | `{slotId}` → `{proposal,snapshot}` |
| POST /api/proposals/:id/confirm | `{encounterId}` → `{confirmed,token}` |
| POST /api/proposals/:id/book | `{encounterId,token}` → `{booking,snapshot}` |
| POST /api/encounters/:id/clarification | `{question}` → Snapshot |
| POST /api/encounters/:id/clarification/answer | `{text}` → Snapshot |
| GET /api/traces | Actual events |
| GET /api/eval | Evaluation report |
| POST /api/eval/run | Run and return evaluation |

Screening server currently accepts `key/answer`, `purpose`, `physicalExam`, and `adult`. Frontend client currently omits adult from its parameter type: coordinate alignment. Errors generally return `{error}` with non-2xx status; handle non-JSON/network failures too.

No supported observation-verification endpoint, authenticated role flow, or SSE endpoint exists yet. Encounter listing is metadata, not a complete appointment feed. Do not invent missing endpoints.

## Non-negotiable safety and honesty

Never diagnose, recommend doses, declare harmlessness, interpret labs diagnostically, guarantee video suitability, or claim clinical validation. Unknown allergies/medications are not none. Unanswered screening is not negative. Failed extraction is not a normal result.

Source and verification are separate. Patient-reported can still be unverified. Patient-confirmed means recorded wording was confirmed, not clinically established. Render transformation/translation separately.

On emergency: prominent warning, disable/hide routine selection and confirmation, invalidate stale proposal/token state, and never let an old booking-success heading override the emergency. Do not calculate clinical routes locally. Server enforcement is the other developer's task.

Distinguish actual application events from actual SDK events. Never fabricate animations pretending to be tool executions or hardcode passing scores. API failure is not guided mode. A configured key is not verified live operation.

## Known frontend bugs: fix first

1. **Doctor loading deadlock:** loading is derived from an empty array, hiding the load button indefinitely. Model idle/loading/success-empty/success/error distinctly.
2. **Encounter lost on tab switch:** PatientView unmounts. Persist active encounter in a parent or restore a demo encounter ID. Never persist confirmation tokens or full medical content in browser storage.
3. **No clarification-answer UI:** API exists; show outstanding doctor question and patient answer form; refresh doctor view.
4. **No-op doctor source/confirm callbacks:** implement actual evidence navigation and a read-only doctor briefing variant; doctor must not falsely mark patient-confirmed.
5. **Approximate source scrolling:** index × 60 is not exact. Use stable IDs/refs and highlight the referenced message.
6. **Traces not live:** currently refreshed only after actions. Use bounded polling while needed with cleanup; no invented SSE.
7. **False slot-hold wording:** proposals do not reserve slots. Say availability is rechecked at confirmation; display success only on real booking response.
8. **Stale route/slots/proposals:** clear or disable on route change, emergency, or unresolved state. Handle conflict/expiry.
9. **Unsupported language claims:** guided mode does not generally translate. Display original/available translation honestly; native-speaker review required for Assamese/Hindi copy.
10. **Document input disappears:** allow adding another report and reviewing existing sources without overwriting evidence.
11. **Eval button hidden when report absent:** always offer a usable run action and show fetch errors.
12. **Language-picker contrast:** header-style white text is reused on white cards. Check contrast and focus in-browser.

## Prioritized implementation

### P0: patient journey
Synthetic-data notice, language selection, persistent encounter, working chat, request/error states, exact source-linked briefing, structured screening controls, and server-calculated care-route display.

### P1: booking
Load real eligible slots. Display doctor, mode, date/time/timezone, fee. Review exact details. A single explicit **Confirm and book** action may sequentially call the current confirm and book endpoints. Never auto-confirm from chat or a model boolean. Show receipt with real booking ID and handle expiry/conflicts honestly. Confirmation token stays ephemeral.

### P1: doctor loop
Select encounter, inspect briefing/missing fields/original sources, view booking, ask one question, patient answers, doctor sees original and any available correctly labeled translation.

### P2: documents/transparency
Paste or load supported synthetic plain-text report. Display extracted observations; click exact source line. Keep values unverified until a real supported verification workflow exists. Display actual traces and measured evaluation results.

### Stretch only
Editable browser speech transcription, more visual polish, presentation assets. No prescriptions, diagnosis, payments, image OCR, real hospital integration, or auth implementation without agreement.

## Design direction

Calm, trustworthy, readable, responsive. Existing palette: teal actions, neutral surfaces, amber missing/uncertain, red emergency, blue evidence references. Focus on current task and next action. Place technical traces in a collapsible judge/developer section rather than overwhelming patients.

Use progressive sections if needed. Accessible contrast, keyboard focus, labels, status text alongside colors, readable Assamese/Hindi fonts, no hover-only essentials. Do not add a library just to restyle the app.

## Optional voice

Feature-detect speech APIs; explicit user start; recording indicator; permission/language/browser errors; stop on unmount. Transcripts go into editable input and are NEVER automatically submitted. Text is always available. Explain possible external browser speech processing. Setting `as-IN` does not prove Assamese recognition works.

## Development fixtures

Clearly labeled fixtures may unblock UI work. Centralize them behind an explicit development switch. Never silently use mocks on API failure. Never portray fixture bookings/traces/evals as real operations. Synthetic data only.

Cover empty/partial intake, missing screening, emergency, video, no slots, unconfirmed proposal, conflict, booking success, source-linked document, clarification, agent error, and an eval with a failure.

## Integration checkpoints

1. Create encounter → send → briefing updates → open source → screen → route.
2. Real slots → review → confirm → booking → doctor sees details.
3. Supported document → source highlight → clarification question → patient answer → doctor refresh.

Final demo: one complete routine journey, emergency interruption, actual traces/results, and genuine backend concurrency proof provided by backend owner. Reserve the final 60–90 minutes for integration and recording rather than new features.

## Validation before PR

Review edited files. Run available type/build checks and distinguish backend blockers from your errors. Browser-test desktop/mobile and keyboard interaction if tooling permits. Verify tab persistence, exact evidence links, unknown handling, missing translations, stale booking disabling, no success on failure, and idle/loading/empty/error/retry states. Do not claim browser checks or live integration you did not perform. No uncoordinated test-framework installation.

## Presentation support

After core functionality: prepare short demo script, screenshot suggestions, slide outline, limitations. Pitch: **we do not turn missing information into facts; every booking needs explicit patient approval.** Avoid clinical-safety claims, guaranteed travel reduction, or universal language/document support.

## Expected first response and ongoing reports

Confirm clone root/branch; inspect code/contracts/guardrails; identify frontend blockers; present plan; start P0. At each checkpoint report changed files, completed flows, actual checks, API blockers, proposed contract changes, and remaining work. Coordinate instead of rewriting backend. Show what the system knows and what it does not.