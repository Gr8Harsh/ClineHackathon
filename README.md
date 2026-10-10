# SEHAT OS

**An AI healthcare coordination platform that never pretends to know.**

The patient speaks in Assamese. The doctor reads English. Every recorded fact should show its source, and missing information must remain visible rather than be guessed.

## Status: work-in-progress scaffold

This repository is being built for the Cline AI Builder Hackathon. **It is not yet an end-to-end verified application.** The Phase 1 backend checkpoint fixes the build and passes 24 tests (including a real local HTTP round trip) and 20 scripted routing cases. These measured results are limited—not evidence of clinical safety, browser usability, or translation accuracy. The existing same-process booking tests do not establish real multi-process concurrency; that test is planned. See [the backend checkpoint contract](docs/BACKEND_CHECKPOINT_1.md).

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

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` locally. `CLINE_MODEL` defaults to `claude-sonnet-4-6`. Without a key the app uses guided mode. An API key being configured does not establish that a live call succeeded. Keep secrets server-side; never use a frontend `VITE_*` variable for them.

Live translation and SDK integration are not yet verified end-to-end. Guided mode must not be presented as general translation.

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

These references are not endorsement or clinical validation. Current code uses simplified and sometimes broader triggers; wording, urgency, applicability, negation handling, and local emergency guidance require clinician review. Missing screening answers now prevent routine routing; server-side booking eligibility remains a Phase 2 priority. No medication doses should be presented.

## Collaboration and Cline

Read [the complete frontend teammate handoff](docs/TEAMMATE_HANDOFF.md) before editing.

- Backend developer: `server`, `tests`, `scripts`; shared contracts and dependencies initially.
- Frontend teammate: `src`, `public`; patient/doctor UI and demo preparation.
- Branches: `feat/backend-core` and `feat/frontend-flow`.
- Coordinate before modifying shared types, dependencies, or configuration.

Cline has been used to scaffold the application and write tests. The in-product SDK integration is being developed with allowlisted domain tools. Display real SDK events separately from deterministic application events; never fabricate traces or successful bookings.

## Remaining deliverables

Working integration and safety fixes, genuine concurrent booking test, browser verification, reviewed language copy, presentation, and recorded demo. Self-care, image OCR, guaranteed browser voice support, and real hospital integration are not part of this initial verified scope.