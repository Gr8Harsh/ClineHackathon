# Patient UI and report dismissal checkpoint

The default preview (including `/?green=1`) now uses the white/olive patient designs. `/?live=1` still opens the existing live workflow. No live integration or backend booking changes are included.

## Navigation
- Two primary tabs: **AI assistant** (default on a fresh load) and **Patient** (the previous home). Switching tabs preserves the in-memory conversation and unsent composer text. Tabs support arrow keys and Home/End.
- The assistant opens with a centered, locally generated green wire-surface animation and “How are you feeling?” above the composer. The first sent message reveals the scripted conversation. Reduced-motion users see a static form; animation pauses while hidden/offscreen.
- Home: greeting/profile, notifications, notes banner, consultation cards, specialty filters and compact fictional doctor rows.
- Find doctor: scripted assistant with olive patient messages, white assistant cards and attachment/microphone/send composer.
- Appointment / See all: searchable, filterable fictional directory. Select a profile and an example time to place an appointment card in the assistant. Booking still requires a separate explicit confirmation dialog.
- Settings/profile: languages, notes, reports, patient/doctor views and existing live workflow. Demo tools remain in the footer.

## Upload
- Dialog positioning has one CSS owner; no combined Tailwind translate and transform offsets.
- The report header, close button and Cancel footer remain outside the internally scrolling content.
- Cancel, close, Escape and backdrop dismiss without advancing the conversation or recording a negative answer.
- Dismissal aborts extraction and discards unsaved drafts. Reopening is clean. Only Save attaches a reviewed report.
- File/photo inputs have styled labels while retaining native file selection and keyboard access.
- Original extraction, correction labels and source regions are preserved. Deleting a selected observation clears its source preview.

## Validation
Run `npm run check`, the separate parser suite (`node --import tsx --test src/preview/reports/parser.test.ts`) and `node src/qa/browser-smoke.mjs`.
Browser QA uses Chromium CDP pointer/keyboard/wheel input for dismissal, focus return, viewport containment and scroll checks. It also covers local image OCR, actual PDF text extraction, oversized/unsupported reports, corrections, cancellation, filtering, preview confirmation and the preserved server-backed journey. Screenshots and actual results are generated under ignored `test-results/`.

## Known limitations
- Supplied assistant reference images informed the welcome layout and flowing green form. The original animation/video, Figma, and photographic/font assets are not in this workspace; this is a local recreation, not a pixel-exact match. Local illustrated avatars and the existing Noto Sans fonts are used.
- No invented health score or medical interpretation. Names, profiles, prices and times are fictional fixtures; “Recommended” is a directory heading, not clinical routing.
- Automated sizes include 344, 390, 430px, desktop and short viewports. A reduced desktop CSS viewport exercises reflow comparable to zoom, but native browser zoom and real device camera/keyboard behavior still require manual checks.