# SEHAT OS demo and presentation guide

Synthetic data only. Run locally; there is no authentication or patient isolation.
This is a coordination demonstration, not a diagnostic system or validated triage.

## Before recording

1. Use Node 24+, run `npm ci`, then `npm run check` from the repository root.
2. Run `npm run dev`; open http://127.0.0.1:5173.
3. Confirm which mode the header reports. Configured SDK is not proof of a live model call.
4. Use a fresh synthetic encounter. Never show API keys, real patient information or browser passwords.
5. Rehearse the exact backend commit intended for submission. Record real results, not this document's descriptions.

## Three-minute walkthrough

### 0:00–0:20 — problem and boundary

“A patient may travel hours without knowing the right care route. SEHAT OS prepares a consultation. It does not diagnose. Its key promise is not turning missing information into facts.”

Show the synthetic-data notice and language choices. If live Assamese translation has not been verified, say so explicitly. Demonstrate the complete routine journey in English rather than pretending guided mode translates.

### 0:20–1:00 — intake and evidence

- Start in English; enter `Dry cough for 3 days`.
- Show the concern and duration, the original message link, and the still-missing history, medications and allergies.
- Optionally enter `history: none reported in this synthetic scenario` and `medications: none reported`.
- Click **View original message**. Explain source, transformation and verification as separate labels.
- Confirm wording only if it matches the synthetic patient statement. This is not clinical verification.

### 1:00–1:40 — screening and explicit booking

- Complete the server-provided screening individually for the fictional scenario. Use No only where the scenario says the warning sign is absent. There is intentionally no “all clear” button.
- Select adult Yes and exam preference No for this routine synthetic scenario.
- Show the server's video route, with its suitability caveat.
- Load actual database slots. Explain that doctors are fictional but slot availability is real database state.
- Choose a slot; show name, time with IST timezone, fee and mode.
- Explain: the proposal is **not a reservation**. Click **Confirm and book**, then show the returned booking ID.

### 1:40–2:20 — document and doctor loop

- Paste this text, including the initial blank line, to demonstrate exact line preservation:

```text

SYNTHETIC REPORT
Haemoglobin: 13.2 g/dL
```

- Click **View source line 3**. Do not interpret the value medically.
- Switch to Doctor, select the encounter, open the source from the read-only briefing.
- Ask `Any blood thinners?`; return to Patient and answer `None reported in this synthetic scenario`.
- Return to Doctor, select/refresh the encounter and show the actual answer.
- For Assamese/Hindi, show the original and “English rendering unavailable” unless the server returned a real rendering. Translation availability is not translation correctness.

### 2:20–2:45 — emergency interruption

- In a separate synthetic encounter, explicitly answer Yes to a warning-sign question.
- Show emergency escalation and the absence of routine booking controls.
- Explain that no normal appointment substitutes for emergency assessment. An existing booking, if shown, must not override the emergency warning.

### 2:45–3:00 — transparency and measured results

- Expand the developer/judge trace panel. Identify application events versus actual Cline SDK events; do not call all application events agent tool calls.
- Open Evaluation and show the current measured result and rule version.
- State that scripted passing cases do not establish clinical safety or language accuracy.
- Show backend concurrency proof only when the backend owner supplies an actual independent-transaction test result.

## Suggested slides

1. **Problem:** wasted travel, short consultations, scattered evidence, language barriers.
2. **Solution:** intake → evidence-linked briefing → screening → care route → explicit booking → doctor loop.
3. **Differentiator:** source, transformation, verification and missing facts stay separate.
4. **Architecture:** React/TypeScript, Express, SQLite; deterministic safety/booking versus language-service responsibilities.
5. **Cline use:** handoff-driven frontend/backend split, small commits, code review, generated regression checks; only claim live SDK execution if verified.
6. **Evidence:** current build/test/evaluation results, UI failure handling, source navigation; distinguish synthetic fixtures from actual backend operations.
7. **Limits and next steps:** clinician review, language review, server booking enforcement, genuine concurrency verification, authenticated integration.

## Screenshot shortlist

- Missing-field briefing next to its highlighted original message.
- Review-before-booking with explicit approval and “not reserved” wording.
- Returned booking receipt with synthetic booking ID.
- Emergency interruption with no routine booking controls.
- Exact report line and unverified observation.
- Doctor question/answer with honest translation labels.
- Actual trace panel and current measured evaluation scoreboard.

## Claims to avoid

- “Clinically safe,” “diagnoses correctly,” “rules out emergencies,” or “guaranteed fewer trips.”
- “Supports all Assamese/Hindi translation” without measured live verification and native-speaker review.
- “OCR” or “PDF region extraction”: this checkpoint supports plain text and source lines only.
- “Production-ready,” “secure patient isolation,” or “authentication implemented.”
- “Proven concurrent booking” based only on the existing same-process tests.
- Describing test-only injected failures as real incidents, or presenting fixture scores as real evaluations.

## Recording reminder

The mandatory submission video must also include genuine Cline development footage. Record the actual plan, edits and checks; never recreate fake tool activity or imply unrecorded work was captured live.