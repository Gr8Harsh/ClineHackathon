# Local OCR assets

Worker: Tesseract.js (Apache-2.0), copied from the installed package.
Core/WASM: tesseract.js-core (Apache-2.0), copied from the installed package.
English data: https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz
(Tesseract tessdata, Apache-2.0).

These files are served from this app's own origin. Report images/text are
processed locally in the browser worker, never posted to an OCR service.
OCR is lazy-loaded. English report recognition only; accuracy is not guaranteed.
Original page regions and confidence remain evidence, not clinical verification.