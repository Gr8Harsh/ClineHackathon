# Minimal UI preview handoff

The new default homepage is a **synthetic UI preview**, not a replacement claim for the live backend. Open `/?live=1` for the existing live API workflow, booking safeguards, measured evaluations and actual traces. No API failure silently falls back to fixtures.

## Design delivered

- White/teal mobile-first patient journey: conversational intake, review notes, care and explicit confirmation dialog.
- Scripted assistant asks duration, history, medicines, allergies and whether a report is available, rather than requiring patients to type structured field prefixes.
- Optional report attachment in the conversation, with a clearly labelled synthetic example. Plain-text fixture extraction supports the exact example observation only; no general OCR/parser claims.
- Original-message and exact-report-line source dialogs; green patient, blue document, amber not-asked/unanswered chips. Verification and translation status are separate.
- Large voice button with explicit start, stop, errors and editable transcripts. No automatic submission. Browser processing can be external; Assamese recognition is not guaranteed.
- Desktop doctor preview: schedule left, read-only notes right, one in-memory clarification exchange.
- Full red emergency fixture with no appointment options. Reset explicitly starts a new synthetic scenario; it is not dismissal of a real emergency.
- Dark collapsible monospace fixture-event drawer, clearly distinct from actual SDK traces.
- Routine, emergency, no-slot, conflict and expired-proposal preview scenarios.

## Shared-file changes for backend teammate

User explicitly requested Tailwind and shadcn/ui and approved this implementation. This changes `package.json`, `package-lock.json`, `vite.config.ts` and `tsconfig.json`; merge dependencies/configuration with care. No backend implementation or shared domain-type changes were made.

Added Tailwind v4/Vite plugin, Radix Dialog/Slot, class-variance-authority, clsx, tailwind-merge and lucide-react. Local shadcn-style Button and Dialog components live in `src/components/ui`; shadcn registry configuration is in `components.json`. Existing live styles remain; the preview avoids global preflight to preserve that workflow. Dialog uses Radix for modal focus, keyboard and dismissal behavior.

## Backend work needed before the redesign becomes live

- Provide an explicit current-intake-question contract: question ID, field/screening key, original language, actual translation status, supported quick answers and completion state.
- Associate natural patient answers with the active question server-side; current deterministic prefix parsing cannot be presented as general AI understanding.
- Integrate real screening into the conversation, preserving unknown answers and deterministic immediate escalation. The mock routine route is explicitly pre-screened and never derived from preview chat.
- Replace fixture doctors, slots, confirmation and receipts with the existing server APIs while preserving scoped approval, expiry, eligibility, conflict and retry behavior.
- Wire report requests and source-preserving extraction to the actual document endpoint.
- Verify the Cline-issued key/provider and live translations; EN/HI/AS selection alone does not translate scripted English questions.

## Verification

Run `npm run check`, then `node src/qa/browser-smoke.mjs`.

The browser harness first checks the redesign's scripted conversation, source dialog, cancel/confirm behavior, doctor exchange, red emergency screen and 390px layout. It then navigates to `/?live=1` and repeats the existing real backend journey and failure scenarios. Screenshots and measured JSON results remain in ignored `test-results/`.

Physical microphone permission/recognition, native-language quality, exhaustive accessibility, and live integration of the new preview require separate verification. Mock conversation state is intentionally in memory and resets on reload; live encounter persistence remains available on the live workflow.