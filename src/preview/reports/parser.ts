export type Region = { x: number; y: number; width: number; height: number };
export type ReportLine = { page: number; line: number; text: string; region?: Region; confidence?: number };
export type ReportPage = { image?: string; width: number; height: number; lines: ReportLine[] };
export type Observation = { id: string; name: string; value: string; unit: string; source: ReportLine; original: { name: string; value: string; unit: string }; corrected: boolean };
export type Report = { name: string; pages: ReportPage[]; observations: Observation[] };

// Narrow syntactic extraction only. Reference ranges, diagnoses and malformed
// numeric strings are deliberately not interpreted or repaired.
const pattern = /^([A-Za-z][A-Za-z0-9 .()/]{1,60}?)\s*:\s*([+-]?\d+(?:\.\d+)?)\s*([A-Za-z%µμ][A-Za-z0-9%µμ/^.-]*)?\s*$/;
export function parseReportLines(lines: ReportLine[]): Observation[] {
  return lines.flatMap((source, index) => {
    const match = source.text.trim().match(pattern);
    if (!match) return [];
    const original = { name: match[1].trim(), value: match[2], unit: match[3] ?? '' };
    return [{ id: `observation-${source.page}-${source.line}-${index}`, ...original, source: { ...source }, original, corrected: false }];
  });
}
export function textReport(name: string, text: string): Report {
  const lines = text.split(/\r?\n/).map((text, i) => ({ page: 1, line: i + 1, text }));
  return { name, pages: [{ width: 0, height: 0, lines }], observations: parseReportLines(lines) };
}