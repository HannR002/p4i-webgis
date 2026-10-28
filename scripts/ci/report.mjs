import { appendFileSync } from 'node:fs';

import { DATABASE_COVERAGE, DATABASE_SUITES, DATABASE_ASSERTIONS } from './database-coverage.mjs';

export class TestEvidenceError extends Error {}
export class TestAssertionError extends Error {}
const invalid = () => { throw new TestEvidenceError('Missing, malformed or inconsistent test evidence'); };
function suiteIdentity(name) {
  if (typeof name !== 'string' || !name.trim()) invalid();
  const path = name.replaceAll('\\', '/');
  if (path.split('/').some((part) => part === '..' || part === '.')) invalid();
  return DATABASE_SUITES.find((suite) => path === suite || path.endsWith('/' + suite)) ?? path;
}

export function summarizeTests(report, { databaseOnly = false, databaseSuite } = {}) {
  if (!report || !Array.isArray(report.testResults) || report.testResults.length === 0) invalid();
  if (databaseSuite !== undefined && (!databaseOnly || !DATABASE_SUITES.includes(databaseSuite))) invalid();
  const expected = databaseSuite ? [databaseSuite] : DATABASE_SUITES;
  const summary = { passed: 0, failed: 0, skipped: 0, database: { passed: 0, failed: 0, skipped: 0 }, databaseSuites: {} };
  const files = new Set();
  for (const file of report.testResults) {
    if (!file || !Array.isArray(file.assertionResults) || !file.assertionResults.length) invalid();
    const identity = suiteIdentity(file.name);
    if (files.has(identity)) invalid();
    files.add(identity);
    const database = DATABASE_SUITES.includes(identity);
    if (databaseOnly && (!database || !expected.includes(identity))) invalid();
    if (!['passed', 'failed'].includes(file.status)) invalid();
    const totals = { passed: 0, failed: 0, skipped: 0 }, names = new Set();
    for (const assertion of file.assertionResults) {
      if (!assertion || typeof assertion.fullName !== 'string' || !assertion.fullName.trim()) invalid();
      // Parameterized legacy application cases can share a display name; database evidence may not.
      if (database && names.has(assertion.fullName)) invalid();
      names.add(assertion.fullName);
      const outcome = { passed: 'passed', failed: 'failed', pending: 'skipped', skipped: 'skipped', todo: 'skipped', disabled: 'skipped' }[assertion.status];
      if (!outcome) invalid();
      summary[outcome]++; totals[outcome]++;
      if (database) summary.database[outcome]++;
    }
    if ((file.status === 'failed') !== (totals.failed > 0)) invalid();
    if (database) {
      if (file.assertionResults.length !== DATABASE_COVERAGE[identity]) invalid();
      summary.databaseSuites[identity] = totals;
    }
  }
  for (const [field, actual] of Object.entries({ numPassedTests: summary.passed, numFailedTests: summary.failed, numPendingTests: summary.skipped, numTotalTests: summary.passed + summary.failed + summary.skipped })) {
    if (!Number.isSafeInteger(report[field]) || report[field] !== actual) invalid();
  }
  if (summary.failed > 0) {
    if (report.success !== false) invalid();
    throw new TestAssertionError('Test assertions failed');
  }
  // Optional Vitest execution metadata must not contradict successful assertions.
  for (const field of ['numFailedTestSuites', 'numRuntimeErrorTestSuites']) {
    if (report[field] !== undefined && (!Number.isSafeInteger(report[field]) || report[field] !== 0)) invalid();
  }
  if (report.numTodoTests !== undefined && (!Number.isSafeInteger(report.numTodoTests) || report.numTodoTests < 0 || report.numTodoTests > summary.skipped)) invalid();
  if (report.snapshot?.failure === true || (Array.isArray(report.unhandledErrors) && report.unhandledErrors.length > 0)) invalid();
  if (typeof report.success !== 'boolean') invalid();
  if (report.success !== true || summary.failed) throw new TestAssertionError('Test execution failed');
  if (!summary.passed || expected.some((suite) => !summary.databaseSuites[suite])) invalid();
  if (databaseOnly ? summary.skipped > 0 || summary.passed !== summary.database.passed : summary.database.passed > 0) invalid();
  return summary;
}

// Full-run success requires both distinct, independently checked fixture reports and cleanup.
export function summarizeDatabaseRun(reports) {
  if (!Array.isArray(reports) || reports.length !== DATABASE_SUITES.length) invalid();
  const seen = new Set();
  for (const result of reports) {
    if (!result || !DATABASE_SUITES.includes(result.suite) || seen.has(result.suite)) invalid();
    seen.add(result.suite);
    const n = DATABASE_COVERAGE[result.suite], evidence = result.evidence;
    if (result.status !== 'PASSED' || result.exitCode !== 0 || result.cleanup !== 'VERIFIED_REMOVED' ||
        !evidence || evidence.passed !== n || evidence.failed !== 0 || evidence.skipped !== 0 ||
        evidence.database?.passed !== n || evidence.database?.failed !== 0 || evidence.database?.skipped !== 0 ||
        !evidence.databaseSuites || Object.keys(evidence.databaseSuites).length !== 1 ||
        evidence.databaseSuites[result.suite]?.passed !== n || evidence.databaseSuites[result.suite]?.failed !== 0 || evidence.databaseSuites[result.suite]?.skipped !== 0) invalid();
  }
  return { status: 'PASSED', passed: DATABASE_ASSERTIONS, failed: 0, skipped: 0, suites: [...seen] };
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
