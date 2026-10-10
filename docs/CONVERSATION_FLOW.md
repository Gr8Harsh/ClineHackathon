# Sehat Sathi conversation flow

Synthetic demonstration only. No authentication, patient isolation, diagnosis, prescribing, clinical validation or guarantee of language accuracy.

## Entry points

- `/`: green server-backed assistant, optimistic queued messages, optional information, fixed server screening, Temporary relief and database-backed doctor availability.
- `/?fixture=1`: explicitly scripted visual regression fixture. Never presented as a successful live model turn.
- `/?live=1`: clinician/evaluation workspace and the legacy integration demo.

## Provider and fallback

The main assistant POSTs `{text, clientMessageId, workflow: "conversation"}` to `/api/encounters/:id/messages`. The Cline provider generates JSON without tools. Application code validates and records extraction. Each reply stores `replyOrigin`, `fallbackReason`, and quick replies. Reply-path events include encounter/message IDs; validation events record rejection counts. Failed validation or provider errors get one retry, then an explicitly labelled fixture fallback.

The SDK model ID is `anthropic/claude-sonnet-4.6`. The known incorrect spelling `anthropic/claude-sonnet-4-6` is normalized. Key presence is not evidence that a turn succeeded.

## Field state and provenance

Configuration is `server/config/conversationFields.ts`, version 1. Required symptom fields determine intake completion. Optional age, medicines, allergies and history do not block it. Fields distinguish not asked, asked/unanswered, answered, unknown and declined. Unknown values display “Patient did not know”. Optional fields can be recorded from the Patient tab through the same message API, e.g. `age: 12`.

Accepted extractions must use an allowlisted field ID, a nonempty exact substring of the latest original patient message and a value equal to that quote. No paraphrased or translated value silently becomes patient evidence. Source message ID, original quote and unverified status remain separate. Exact quote validation prevents fabricated sources, but does not prove semantic medical correctness.

The supplied system prompt is stored verbatim in `server/agent/conversationPrompt.ts`, with three examples. JSON instructions are separate. One correction attempt covers parse, style or question-target failures. Repetition validation uses supported question aliases and rejects ambiguous targets; arbitrary multilingual semantics are not guaranteed. Unsupported languages/paraphrases can fall back honestly. No LLM-generated safety boolean is trusted.

## Routing, age and safety

Red flags run before each conversation model call, including a retry. Detected emergencies receive fixed application text and suppress routine booking and relief. Native-language symptom matching is illustrative, not comprehensive; original text plus structured screening must never be claimed to establish clearance. Legacy translation paths also check original text before calling translation, but those checks cannot recognize all possible non-English emergency expressions.

Age is not a consultation gate. Recorded minors get “Patient is a minor, guardian should attend” with age provenance. Infant fever and existing self-care exclusions remain. Unknown age can block relief, but not preparation for consultation.

Patients no longer answer examination-suitability questions. With no clinician mode decision, the application conservatively coordinates in-person assessment. Legacy records with explicit mode flags remain readable. Availability never overrides emergencies or makes a route medically suitable. Intake complete is separate from booking ready: unresolved safety answers still prevent routine booking.

## Delivery and queue

Typed input, quick replies, optional information and user-reviewed voice transcripts share one outbox. Messages render before network work. One request is sent at a time, later messages remain queued, and a failed first item pauses the queue. Retry reuses the same client ID. Server serialization and deduplication protect against duplicate message retries within this single-process demo. This is not a distributed queue.

The main page preserves state across tabs, not browser reloads. Voice transcripts are editable before sending; browser speech support, particularly Assamese, is not guaranteed. Main page report extraction is retained as an explicitly local draft, not silently sent to the clinician or used for routing. Server report upload remains in the legacy workspace pending full integration.

## Relief and doctor options

Comfort measures remain blocked pending actual clinician/language review. The limitation appears before eligibility questions. The LLM never writes relief measures into consultation messages. Available clinicians are fictional, with real synthetic database slot state. Location filtering and earliest slot ordering are supported; geographic nearest-doctor claims are not.

## Review

`npm run review:transcripts` runs ten synthetic personas against the configured server (`SEHAT_REVIEW_URL`, default `http://127.0.0.1:3001`). Output is under ignored `test-results/transcripts`: readable text, JSON, and summary. Every turn includes real reply origin, fallback reason, latency, field state and readiness. Missing provider configuration refuses a purported live review. Provider failure records fallback, not a fabricated live result.

Run `npm run check`, `node --import tsx --test src/preview/reports/parser.test.ts`, and `node src/qa/browser-smoke.mjs` for validation. Passing tests do not establish clinical safety or language review.