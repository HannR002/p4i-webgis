import { appendFileSync } from 'node:fs';

export function summarizeTests(report, { databaseOnly = false } = {}) {
  if (!Array.isArray(report.testResults) || report.testResults.length === 0)
    throw Error('Missing test evidence');
  const summary = {
    passed: 0,
    failed: 0,
    skipped: 0,
    database: { passed: 0, failed: 0, skipped: 0 },
  };
  for (const file of report.testResults) {
    const database = /vector(Postgis|Analysis)\.integration\.test\.ts$/.test(
      file.name,
    );
    if (!Array.isArray(file.assertionResults))
      throw Error('Missing assertion evidence');
    for (const test of file.assertionResults) {
      const outcome = {
        passed: 'passed',
        failed: 'failed',
        pending: 'skipped',
        skipped: 'skipped',
        todo: 'skipped',
        disabled: 'skipped',
      }[test.status];
      if (!['passed', 'failed', 'skipped'].includes(outcome))
        throw Error('Unknown test outcome');
      summary[outcome]++;
      if (database) summary.database[outcome]++;
    }
  }
  if (!summary.passed || summary.failed || report.success !== true)
    throw Error('Test execution failed or no cases passed');
  if (
    databaseOnly
      ? !summary.database.passed ||
        summary.skipped > 0 ||
        summary.passed !== summary.database.passed
      : summary.database.passed > 0
  )
    throw Error('Database test policy violation');
  return summary;
}

export function summarizeAudit(report, exitCode) {
  if (
    !report ||
    report.error ||
    report.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    !report.metadata?.vulnerabilities
  )
    throw Error('Audit unavailable or malformed; security gate failed closed');
  const counts = report.metadata.vulnerabilities;
  for (const key of ['info', 'low', 'moderate', 'high', 'critical', 'total'])
    if (!Number.isSafeInteger(counts[key]) || counts[key] < 0)
      throw Error('Invalid audit counts');
  const entries = Object.values(report.vulnerabilities);
  if (
    counts.total !== entries.length ||
    ['info', 'low', 'moderate', 'high', 'critical'].reduce(
      (total, key) => total + counts[key],
      0,
    ) !== counts.total ||
    (counts.total === 0 ? exitCode !== 0 : exitCode !== 1)
  )
    throw Error('Inconsistent audit evidence');
  const advisories = [
    ...new Set(
      entries.flatMap((v) =>
        v.via.filter((via) => typeof via === 'object').map((via) => via.url),
      ),
    ),
  ];
  return {
    affectedPackages: counts.total,
    severities: counts,
    distinctAdvisories: advisories.length,
    advisories,
    passed: counts.total === 0,
  };
}

export function publishSummary(title, value) {
  const text = `## ${title}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
