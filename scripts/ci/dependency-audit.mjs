import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { summarizeAudit, publishSummary } from './report.mjs';

mkdirSync('.ci-results', { recursive: true });
const summary = {};
for (const [scope, args] of [
  ['full', []],
  ['production', ['--omit=dev']],
]) {
  const result = spawnSync('npm', ['audit', '--json', ...args], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(`.ci-results/audit-${scope}.json`, result.stdout || '{}');
  try {
    summary[scope] = summarizeAudit(JSON.parse(result.stdout), result.status);
    if (!summary[scope].passed) process.exitCode = 1;
  } catch {
    summary[scope] = {
      passed: false,
      status: 'UNAVAILABLE_OR_INVALID',
      exitCode: result.status,
    };
    process.exitCode = 1;
  }
}
writeFileSync(
  '.ci-results/audit-summary.json',
  JSON.stringify(summary, null, 2),
);
publishSummary('Dependency gates (no advisory waivers)', summary);
