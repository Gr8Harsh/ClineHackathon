import { runSync } from '../server/eval/runner.ts';

const report = runSync();
console.log(`\nSEHAT OS evaluation — ${report.ruleVersion}`);
console.log(`Generated: ${report.generatedAt}`);
console.log(`Result: ${report.passed}/${report.total} passed\n`);
for (const r of report.results) {
  const mark = r.passed ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${r.name} — expected ${r.expected}, got ${r.actual}`);
}
const failed = report.results.filter(r => !r.passed);
if (failed.length > 0) {
  console.error(`\n${failed.length} case(s) failed.`);
  process.exit(1);
}
console.log('\nAll scripted cases passed.');
