# Demo script: the 2-minute loop

All data is synthetic. Run `npm run dev` and open two browser windows side by side:

- **Left (patient / ASHA worker):** http://127.0.0.1:5173/?live=1, Patient tab
- **Right (doctor):** http://127.0.0.1:5173/?live=1, Doctor tab

Before recording, check that `CLINE_MODEL` in `.env` is `anthropic/claude-sonnet-4.6` (with a dot). The header pill should say **Cline SDK · configured**. The loop also works without a key; the agent steps then fall back to guided mode and templates, labelled as such.

| # | Screen | Action | What to point at |
|---|---|---|---|
| 1 | Patient | Tick **Assisted mode**, enter a synthetic worker name, choose **অসমীয়া (Assamese)** | Blue "Assisted intake" banner |
| 2 | Patient | Tap the starter chip `মোৰ চাৰি দিনৰ পৰা মূৰ বিষাইছে`, then Send | Message shows "entered by health worker" and the English rendering labelled *synthetic phrasebook* |
| 3 | Patient | Answer the adult / exam questions in chat (`yes`, `no`), then stop | Briefing: **Current medications: NOT ASKED** in amber (with a live key it reads **NOT RECORDED**, because free-form agent questions can't be tracked); Duration filled from "for 4 days" |
| 4 | Patient | In the safety check, answer every warning sign **No** | Route banner turns to **Video consultation possible: may not need a long journey** |
| 5 | Patient | Open the trace panel. With a key, send one more message so the agent picks tools, or click **Show available doctors** and pick a slot | Trace: `step 1: model chose check_red_flags → get_available_slots → propose_slot` (only what the model actually did) |
| 6 | Patient | Open **Safety probe**, click **Call book_slot directly** (and **Ask the Cline agent to book now** if you have a key) | "No booking was created." Trace: `tool.book_slot failed — no token issued` |
| 7 | Patient | **Confirm and book** | Booking receipt with a real booking ID |
| 8 | Doctor | Refresh the list and select the encounter (marked *booked*, *assisted*) | English briefing; amber NOT ASKED on medications |
| 9 | Doctor | Click **Ask patient about this** on Current medications (or **Draft with Cline agent**), then **Send to patient** | "fills Current medications" · "Patient saw (Assamese) · synthetic phrasebook" |
| 10 | Patient | **Refresh encounter**. The question appears in Assamese. Tap `হয়, মই প্ৰতিদিনে এছপিৰিন খাওঁ`, then Send | — |
| 11 | Doctor | Wait for the briefing to refresh itself (every 4 seconds) | Current medications: **patient-reported · answered doctor · entered by health worker**, Assamese original and English side by side |

Closing line: *"Nothing in that briefing was guessed. Every line says where it came from, and the gap was closed by asking, not by assuming."*

Optional emergency cut (15 seconds): start a new encounter, send `I have chest pain spreading to my left arm`. The route turns red and booking disappears. No model is involved; this is deterministic rule RF-02.
