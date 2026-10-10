# SEHAT OS

**An AI healthcare coordination platform that never pretends to know.**

The patient speaks in Assamese. The doctor reads English. Every recorded fact should show its source, and missing information must remain visible rather than be guessed.

## The problem

Patients in small towns travel for hours without knowing whether they need an emergency department, a video consultation or an in-person visit, and then get very little time with the doctor. A systematic review of primary-care consultation length across 67 countries found averages ranging from 48 seconds (Bangladesh) to 22.5 minutes (Sweden), with about half the world's population in 18 countries averaging 5 minutes or less ([Irving et al., *BMJ Open* 2017;7:e017902](https://bmjopen.bmj.com/content/7/10/e017902)). *Check the paper's country table before quoting a figure specific to India; this README does not state one.*

## The demo loop (about 2 minutes)

This one loop shows everything the product does. Open **http://127.0.0.1:5173/?live=1** (the default `/` page is a fixture-only design preview). Step-by-step script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

1. **Assisted intake in Assamese.** An ASHA worker starts an *assisted* encounter and enters the patient's words. Messages are labelled "entered by health worker", and the English rendering is labelled as phrasebook or machine translation, never as fact.
2. **The gap is visible.** The briefing shows **Current medications: NOT ASKED** in amber. "Not asked" and "asked, no answer" are distinct states, and neither means "none".
3. **Deterministic routing.** The 18-rule red-flag screen runs in code, not in the model, and returns **"Video consultation possible: this first consultation may not need a long journey"**, still hedged that a clinician decides.
4. **The agent proposes, the patient confirms.** The Cline SDK agent chooses its own tools (`check_red_flags` → `get_available_slots` → `propose_slot`). Each choice is traced live, with its inputs. Nothing is booked until the patient presses Confirm.
5. **The gate holds.** The *Safety probe* tries `book_slot` without confirmation. The server refuses it (`tool.book_slot failed — no token issued`). In live testing the model also declined to call it at all.
6. **The doctor sees the gap and asks.** The English briefing shows the missing field. The doctor clicks **Ask patient about this** (or **Draft with Cline agent**: the agent reads the briefing with `get_summary` and drafts one question) and sends "Any blood thinners?" linked to that field.
7. **The loop closes.** The patient sees the question in Assamese, answers in Assamese, and the field flips to **patient-reported · answered doctor**, with the original quote and the English rendering side by side.

## Who uses it: assisted mode

Many patients won't type into an app. In **assisted mode**, an ASHA worker or clinic staff member runs the intake on one phone: they read each question aloud and enter the patient's own words. The doctor sees who recorded each line. This matches how primary care already reaches villages in India.


## Status

Built for the Cline AI Builder Hackathon. Measured on the last local run: `npm run check` passed the production build, **33 tests**, and **20/20 scripted routing cases**. The tests include a real local HTTP round trip, the full demo loop over HTTP, and a two-process booking race where exactly one booking wins. With a valid Cline key, live translation, doctor-side drafting and the agent gate probe were each run once on synthetic data and worked. That is a single smoke run, not an evaluation of translation quality. These measured results are limited—not evidence of clinical safety, browser usability, or translation accuracy. See [the backend checkpoint contract](docs/BACKEND_CHECKPOINT_1.md).

**Synthetic data only. Not a medical device, diagnostic tool, or production healthcare service.** There is no production authentication or patient-record isolation. Do not expose this demonstration to the internet or enter real patient information. Publishing the source does not mean deploying the service.

## Intended journey

Intake → follow-up questions → deterministic red-flag screening → care route → real database slots → explicit confirmation → atomic booking → source-linked doctor briefing → clarifying question.

The model handles language; application code must own safety decisions, availability, and booking integrity. Unknown must never be rendered as a negative finding.

## Stack

- React 19, TypeScript, Vite 8, plain CSS
- Node 24+, Express 5, built-in `node:sqlite`
- Cline SDK `0.0.92` and Zod
- Node test runner through `tsx`

## Local setup

From the cloned repository root:

```sh
npm ci
npm run dev
```

The frontend normally opens at http://127.0.0.1:5173; the API listens at http://127.0.0.1:3001. Vite proxies `/api` to the API. SQLite data is created locally and excluded from Git. Node may report its SQLite experimental-feature warning.

The frontend flow and booking safeguards still need the remaining repairs. The development launcher starts both processes; use the separate `dev:server` script when backend watch mode is needed.

### Optional live language service

Copy `.env.example` to `.env` and set `CLINE_API_KEY` locally. `CLINE_MODEL` defaults to `anthropic/claude-sonnet-4.6`. The model ID uses a dot: `claude-sonnet-4-6` returns "model not found", and the app then silently uses guided mode. Without a key the app uses guided mode. An API key being configured does not establish that a live call succeeded. Keep secrets server-side; never use a frontend `VITE_*` variable for them.

Translation order: an exact-match **synthetic phrasebook** for the scripted demo lines (labelled `fixture`), then live Cline SDK translation (labelled `unverified`). If neither is available, no English is shown, never a guess. Guided mode must not be presented as general translation.

### Voice

The live app has browser speech input. The transcript goes into the editable text box and is never sent automatically. Hindi and English recognition generally work in Chrome. **Assamese (`as-IN`) speech recognition is not reliably supported by browsers**, and the UI says so. For Assamese, type or use assisted mode. Server-side speech-to-text for Assamese (e.g. Bhashini) is future scope.

## Checks

```sh
npm run build
npm test
npm run eval
npm run check
```

`build` runs TypeScript checking and Vite. `eval` executes 20 scripted deterministic routing cases. These cases do not evaluate clinical accuracy, Assamese understanding, or translation quality. Report only actual results from a fresh run.

## Narrow document support

The current parser accepts plain text such as `Haemoglobin: 13.2 g/dL` and links observations to exact one-based source lines. This is **not OCR**, PDF-region extraction, or interpretation of medical meaning. Extracted values remain unverified.

## Safety rule sources and limitations

The illustrative rule set refers to public NHS guidance:

- https://www.nhs.uk/conditions/heart-attack/
- https://www.nhs.uk/conditions/stroke/symptoms/
- https://www.nhs.uk/conditions/sepsis/
- https://www.nhs.uk/conditions/vomiting-blood/
- https://www.nhs.uk/conditions/self-harm/
- https://www.nhs.uk/conditions/head-injury/
- https://www.nhs.uk/conditions/poisoning/

These references are not endorsement or clinical validation. Current code uses simplified and sometimes broader triggers; wording, urgency, applicability, negation handling, and local emergency guidance require clinician review. Missing screening answers now prevent routine routing and server-side booking. No medication doses should be presented.

## Collaboration and Cline

Read [the complete frontend teammate handoff](docs/TEAMMATE_HANDOFF.md) before editing.

- Backend developer: `server`, `tests`, `scripts`; shared contracts and dependencies initially.
- Frontend teammate: `src`, `public`; patient/doctor UI and demo preparation.
- Branches: `feat/backend-core` and `feat/frontend-flow`.
- Coordinate before modifying shared types, dependencies, or configuration.

Cline has been used to scaffold the application and write tests.

**Inside the product**, the Cline SDK runs three agents, each with allowlisted tools only:

| Agent | Tools | What it decides |
|---|---|---|
| Patient intake | `check_red_flags`, `get_available_slots`, `propose_slot`, `book_slot`, `get_summary`, `extract_document` | Which follow-up to ask; when to look up slots and propose one |
| Doctor drafting | `get_summary` (read-only) | Which missing field matters most, and the wording of one question |
| Translation | none | Faithful rendering, always labelled unverified |

Every tool the model chooses is traced in order, with its input (`step 1: model chose get_summary …`), separately from deterministic application events. `book_slot` needs a one-time token that only the server issues after the patient presses Confirm, so the model cannot book on its own. Traces and bookings are never fabricated.

## Temporary relief draft (not released for patient use)

The supplied [guidance draft](docs/selfcare-guidance.md) is converted to [nine JSON topics](data/selfcare.json). `server/domain/selfcare.ts` validates the whitelist with Zod and uses the same deterministic red-flag checker as `check_red_flags`. The main assistant now includes Temporary relief and database-backed doctor options. Eligibility asks prerequisites, checks age/pregnancy/chronic illness, refuses unsupported topics, and blocks missing safety answers. It never bypasses booking confirmation.

**Needs clinician review — not for patient use.** All reviewer/date fields are null and every Hindi/Assamese field is `TODO_TRANSLATE`. Comfort measures are withheld until actual clinician review, language review and an explicit source deadline are recorded in the catalogue. No API or model can set reviewed status. Headache, minor cuts and minor burns need timing clarification; no waiting interval is invented. Adults-only eligibility remains unchanged, including the stricter burns exclusions. Draft content such as steam inhalation and regional disease references still needs clinical review.

Sessions expire after 30 minutes and are reset by encounter changes. Answers are temporary and separate from medical-record messages/briefing fields. Only an actual patient-reported emergency warning is retained as a server-owned alert with its question, original answer and source ID; all routing/booking gates see that alert. Restarting does not clear it. Advice itself is never persisted or added to the briefing.
Rule version `sehat-redflags-v0.3.0-selfcare-draft` keeps the existing 18-question catalogue while adding supplemental draft text matches and the server-owned alert. These are illustrative safeguards, not comprehensive or validated symptom understanding. Compound questions use conservative escalation; symptom matching uses English terms only, and unreviewed Hindi/Assamese self-care is blocked rather than inferred from translations. The patient panel uses English status notices to explain unavailable translations; multilingual messages cannot be claimed complete while translations are pending.

Reference checked during implementation: [British Red Cross — burns first aid](https://www.redcross.org.uk/first-aid/learn-first-aid/burns). This supports source comparison, **not** review/approval of every line of the supplied draft; source wording is not imported beyond the whitelist. WHO, MoHFW/NHM, IMNCI and Assam advisories still need topic-by-topic verification. Fetching `https://112.gov.in/` failed during implementation, so neither 112 nor a local ambulance number is displayed as verified by this feature. A clinician and native speakers must review before demo patient guidance is enabled.

Run `node --import tsx --test tests/selfcare.test.ts tests/selfcare-api.test.ts`, `npm run check`, the parser suite and browser smoke checks. Synthetic tests that exercise an approved path use test-only review metadata, never claim real clinician review.

## Deliberately out of scope

- Real-patient self-care release without clinician and native-speaker review.
- Image OCR, diagnosis, medicine doses, payments, real hospital integration.

## Future scope

- **ABDM / ABHA integration**: link the briefing to the patient's ABHA health ID, and pull prior records with consent instead of re-asking.
- **WhatsApp as the channel**: intake, the doctor's question and the patient's answer over WhatsApp, which already reaches far more rural phones than a new app.
- Server-side Assamese speech recognition and native-speaker-reviewed copy.
- Clinician-reviewed red-flag rules and more document types.

## Remaining work

Browser verification of the new demo loop, native-speaker review of the Assamese/Hindi phrasebook, presentation, and recorded demo.