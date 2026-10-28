import { readFileSync } from 'node:fs';
import { summarizeTests, publishSummary } from './report.mjs';
try {
  publishSummary(
    'Application tests; expected opt-in database coverage reported separately',
    summarizeTests(JSON.parse(readFileSync('.ci-results/tests.json', 'utf8'))),
  );
} catch {
  publishSummary('Test evidence', {
    status: 'FAILED_OR_INCOMPLETE',
    note: 'See test step; skipped database tests are not passes.',
  });
  process.exitCode = 1;
}
