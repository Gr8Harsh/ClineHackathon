import { LabDocument, LabObservation } from '../../shared/types.ts';
import { uuid, nowIso } from '../lib/ids.ts';
import { trace } from '../trace.ts';

/**
 * Deterministic parser for a simple synthetic lab-report text format:
 *   "Haemoglobin: 13.2 g/dL"
 * Each observation records the exact line it came from, so the UI can tap through.
 * This is not OCR and not a general document parser — only this format is supported.
 */
const LINE_RE = /^([A-Za-z][A-Za-z .()/]{1,40}?)\s*[:\-]\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z%µμ/]+)?\s*(?:\(([^)]+)\))?$/;

export function parseLabReport(name: string, text: string): LabDocument {
  const observations: LabObservation[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(LINE_RE);
    if (!m) return;
    const [, label, value, unit = '', range] = m;
    observations.push({
      id: uuid(), name: label.trim(), value, unit: unit.trim(), line: i + 1,
      sourceText: line, verification: 'unverified',
    });
  });
  const doc: LabDocument = { id: uuid(), name, text, observations, createdAt: nowIso() };
  trace('document.extract', 'completed', `${name}: ${observations.length} value(s) extracted from ${lines.length} line(s); all unverified`);
  return doc;
}