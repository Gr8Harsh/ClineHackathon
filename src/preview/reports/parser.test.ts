import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReportLines, textReport } from './parser.ts';

test('report parser preserves exact lines, page regions and original extraction', () => {
  assert.equal(textReport('sample', '\nHeader\nHaemoglobin: 13.2 g/dL\n').observations[0].source.line, 3);
  const region = { x: 12, y: 80, width: 300, height: 25 };
  const result = parseReportLines([{ page: 2, line: 7, text: 'HbA1c: 7.4 %', region, confidence: 62 }])[0];
  assert.deepEqual(result.source.region, region); assert.equal(result.source.page, 2);
  assert.deepEqual(result.original, { name: 'HbA1c', value: '7.4', unit: '%' });
  assert.equal(result.corrected, false);
});
test('report parser does not guess malformed values or interpret reference ranges', () => {
  const result = textReport('unsupported', 'Diagnosis: normal\nGlucose: 1O8 mg/dL\nHaemoglobin: 12..3 g/dL\nReference range: 4-8\nUnknown text');
  assert.deepEqual(result.observations, []);
});