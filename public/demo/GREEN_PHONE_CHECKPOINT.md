# Green phone preview checkpoint

Changes are confined to preview UI, browser QA, dependencies, and local assets.
Backend safety rules, routing, booking, shared domain contracts, and `.clinerules`
are untouched. Existing `/?live=1` workflow remains available and regression-tested.

## Answers

History, medicines and allergies have explicit Yes/No/Unsure/Skip actions with
EN/HI/AS labels independent of action IDs. Yes waits for details. No records an
explicit patient-reported negative; unsure records Patient unsure. Skip is a text
link and leaves the field Unanswered, never “none”. Original choice and details
remain separately linked evidence. Structured summaries are labelled as such,
not falsely labelled verbatim. Native-speaker review of localized UI copy remains
required; free-text patient translation is not claimed.

## Local documents

PDF.js reads text layers and renders original pages. Empty text layers use local
Tesseract.js OCR. PNG/JPG images use OCR. Worker, WASM and English language assets
are served from `public/ocr`, not a remote OCR service. PDF/OCR modules are lazy.
Fonts are served locally too. No document content is posted to an OCR server.

Line sources preserve page/line IDs, text, available coordinates and confidence.
Highlight boxes use measured PDF/OCR coordinates, not invented regions. Plain
text has exact line numbers but no image-region claim. Corrections/deletions are
reviewed before saving; the original extraction and patient-edited values remain
separate. All observations remain unverified, without medical interpretation.
Low confidence is displayed and paste-text fallback is available. Max file 10 MB,
max PDF 15 pages, and bounded canvas dimensions protect mobile memory.

Only English OCR data is bundled. OCR quality, difficult layouts, encrypted PDFs,
physical camera use and large/low-quality reports need broader verification.
Local processing is not a claim that browser speech processing is local.

Synthetic sample: `/synthetic-report.png` (and its SVG source). Not patient data.
Two focused parser tests: `node --import tsx --test src/preview/reports/parser.test.ts`.
These run separately from the unchanged backend `npm test` command.

## UI

390px-first, 430px patient shell; desktop doctor workspace remains wide. Home
cards, green orb voice screen, Talk/Notes/Care bottom bar, sticky Notes action,
profile sheet and trace/scenario sheet. Source chips use icons/fill/dashed outline
rather than different hues. Body text 16px, 48px controls, local Noto fonts and
reduced-motion support. Red is reserved for the full-screen emergency fixture.
Doctor question panel is absent unless a question exists; no default “hi” added.

Microphone uses explicit start and editable interim transcript; no automatic send.
Unavailable APIs/language errors offer keyboard fallback. Real permissions and
Assamese recognition are not established by headless tests.

## Validation commands

```
npm run check
node --import tsx --test src/preview/reports/parser.test.ts
node src/qa/browser-smoke.mjs
```

Browser checks use isolated synthetic DB/profile, exercise actual image OCR and
PDF text-layer regions, distinct answer states, phone layout, doctor exchange,
and the unchanged live flow. PDF scanned-page fallback shares the image OCR
pipeline but needs explicit scanned-PDF validation before claiming complete PDF
coverage. Results/screenshots are written to ignored `test-results/`.