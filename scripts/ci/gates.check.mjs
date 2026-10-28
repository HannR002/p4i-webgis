import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { summarizeAudit, summarizeTests, summarizeDatabaseRun, TestEvidenceError } from './report.mjs';
import { DATABASE_COVERAGE, DATABASE_SUITES, DATABASE_ASSERTIONS } from './database-coverage.mjs';
import { runFixture, validateFixture, TestInfrastructureError } from './postgis.mjs';

const file = (name, statuses) => ({
  name: name.startsWith('vector') ? 'tests/' + name : name,
  status: statuses.includes('failed') ? 'failed' : 'passed',
  assertionResults: statuses.map((status, i) => ({ status, fullName: `case ${i}` })),
});
const report = (files) => {
  const all = files.flatMap((f) => f.assertionResults);
  return { success: !all.some((t) => t.status === 'failed'), testResults: files,
    numTotalTests: all.length, numPassedTests: all.filter((t) => t.status === 'passed').length,
    numFailedTests: all.filter((t) => t.status === 'failed').length,
    numPendingTests: all.filter((t) => ['pending', 'skipped', 'todo', 'disabled'].includes(t.status)).length };
};
const databaseReport = () => report(DATABASE_SUITES.map((s) => file(s, Array(DATABASE_COVERAGE[s]).fill('passed'))));
const fixtureResults = () => DATABASE_SUITES.map((suite) => ({ suite, status: 'PASSED', exitCode: 0, cleanup: 'VERIFIED_REMOVED',
  evidence: summarizeTests(report([file(suite, Array(DATABASE_COVERAGE[suite]).fill('passed'))]), { databaseOnly: true, databaseSuite: suite }) }));
const audit = (count = 0) => ({
  auditReportVersion: 2,
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: count,
      critical: 0,
      total: count,
    },
  },
  vulnerabilities: count
    ? {
        braces: {
          via: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }],
        },
        micromatch: { via: ['braces'] },
      }
    : {},
});
test('Default test summary reports all 37 skipped database cases separately', () => {
  const summary = summarizeTests(report([
    file('app.test.ts', ['passed']),
    ...DATABASE_SUITES.map((s) => file(s, Array(DATABASE_COVERAGE[s]).fill('pending'))),
  ]));
  assert.equal(summary.passed, 1);
  assert.equal(summary.skipped, 37);
  assert.deepEqual(summary.database, { passed: 0, failed: 0, skipped: 37 });
});
test('Missing, failed, unknown and default-CI executed database tests fail closed', () => {
  for (const report of [
    {},
    { success: false, testResults: [file('a', ['passed'])] },
    { success: true, testResults: [file('a', ['failed'])] },
    { success: true, testResults: [file('a', ['unknown'])] },
    {
      success: true,
      testResults: [file('vectorAnalysis.integration.test.ts', ['passed'])],
    },
  ])
    assert.throws(() => summarizeTests(report));
});
test('Opt-in database summary requires both suites and 37 actual assertions', () => {
  assert.equal(DATABASE_ASSERTIONS, 37);
  const result = summarizeTests(databaseReport(), { databaseOnly: true });
  assert.equal(result.database.passed, 37);
  assert.equal(Object.keys(result.databaseSuites).length, 2);
  for (const suite of DATABASE_SUITES) {
    const n = DATABASE_COVERAGE[suite];
    assert.equal(summarizeTests(report([file(suite, Array(n).fill('passed'))]), { databaseOnly: true, databaseSuite: suite }).passed, n);
  }
});
test('Audit distinguishes packages from advisory count, with no waiver', () => {
  assert.equal(summarizeAudit(audit(), 0).passed, true);
  const summary = summarizeAudit(audit(2), 1);
  assert.equal(summary.passed, false);
  assert.equal(summary.affectedPackages, 2);
  assert.equal(summary.distinctAdvisories, 1);
});
test('Audit network errors, incomplete and inconsistent data fail closed', () => {
  for (const [report, code] of [
    [{}, 1],
    [{ error: { code: 'ENETUNREACH' } }, 1],
    [audit(), null],
    [audit(2), 0],
    [audit(1), 1],
  ])
    assert.throws(() => summarizeAudit(report, code));
});
test('Fixture ownership rejects external addresses, redirects and foreign resource names', () => {
  const valid = {
    network: 'p4i-vector15-ab12',
    db: 'p4i-vector15-ab12-db',
    api: 'p4i-vector15-ab12-api',
    endpoint: 'http://127.0.0.1:12345',
  };
  assert.equal(validateFixture(valid), valid);
  for (const patch of [
    { endpoint: 'https://external.invalid' },
    { endpoint: 'http://127.0.0.1:99999' },
    { endpoint: 'http://127.0.0.1:12345/path' },
    { db: 'another-db' },
    { network: '../unsafe' },
  ])
    assert.throws(() => validateFixture({ ...valid, ...patch }));
});
for (const failure of [null, 'start', 'ready', 'test', 'cleanup'])
  test(`Fixture lifecycle ${failure || 'success'} cleans up and preserves failure category`, async () => {
    const calls = [];
    const ops = Object.fromEntries(
      ['start', 'ready', 'test', 'cleanup'].map((name) => [
        name,
        async () => {
          calls.push(name);
          if (name === failure) throw Error('synthetic');
          return { passed: 14 };
        },
      ]),
    );
    const result = await runFixture(ops);
    assert.equal(calls.at(-1), 'cleanup');
    assert.equal(
      result.status,
      failure === 'cleanup'
        ? 'CLEANUP_FAILED'
        : failure === 'test'
          ? 'TESTS_FAILED'
          : failure
            ? 'INFRASTRUCTURE_UNAVAILABLE'
            : 'PASSED',
    );
    if (['start', 'ready'].includes(failure))
      assert.equal(calls.includes('test'), false);
  });
test('Workflow policies: locked, immutable actions, read-only, no credentials or paid resources', () => {
  for (const name of ['ci', 'postgis']) {
    const source = readFileSync(`.github/workflows/${name}.yml`, 'utf8');
    assert.match(source, /false &&/);
    assert.match(source, /contents: read/);
    assert.match(source, /persist-credentials: false/);
    assert.match(source, /package-manager-cache: false/);
    assert.doesNotMatch(
      source,
      /secrets\.|pull_request_target|self-hosted|upload-artifact|continue-on-error/,
    );
    for (const [, action] of source.matchAll(/uses: (\S+)/g))
      assert.match(action, /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
    assert.match(source, /runs-on: ubuntu-24.04/);
    assert.match(source, /timeout-minutes:/);
  }
});

test('Startup cleanup uncertainty is reported, never promoted to a pass', async () => {
  const result = await runFixture({
    start() {
      throw Error('startup interrupted');
    },
    ready() {},
    test() {},
    cleanup() {
      return 'UNVERIFIED_STARTUP';
    },
  });
  assert.equal(result.status, 'INFRASTRUCTURE_UNAVAILABLE');
  assert.equal(result.exitCode, 2);
  assert.equal(result.stage, 'startup');
  assert.equal(result.cleanup, 'UNVERIFIED_STARTUP');
});

test('Inconsistent severity totals cannot produce a green dependency gate', () => {
  const report = audit();
  report.metadata.vulnerabilities.critical = 1;
  assert.throws(() => summarizeAudit(report, 0));
});

for (const count of [1, 13, 15]) test(`Phase15 count ${count} cannot replace required 14`, () => {
  assert.throws(() => summarizeTests(report([file(DATABASE_SUITES[0], Array(count).fill('passed'))]),
    { databaseOnly: true, databaseSuite: DATABASE_SUITES[0] }), TestEvidenceError);
});
for (const count of [1, 22, 24]) test(`Phase16 count ${count} cannot replace required 23`, () => {
  assert.throws(() => summarizeTests(report([file(DATABASE_SUITES[1], Array(count).fill('passed'))]),
    { databaseOnly: true, databaseSuite: DATABASE_SUITES[1] }), TestEvidenceError);
});
const mutations = {
  'missing suite': (r) => r.testResults.pop(),
  'duplicate suite': (r) => r.testResults.push(structuredClone(r.testResults[0])),
  'absolute duplicate identity': (r) => r.testResults.push({ ...structuredClone(r.testResults[0]), name: '/checkout/' + DATABASE_SUITES[0] }),
  'wrong directory identity': (r) => { r.testResults[0].name = 'other/vectorPostgis.integration.test.ts'; },
  'traversal identity': (r) => { r.testResults[0].name = '/other/../' + DATABASE_SUITES[0]; },
  'unexpected application suite': (r) => r.testResults.push(file('app.test.ts', ['passed'])),
  'duplicate assertion': (r) => { r.testResults[0].assertionResults[1].fullName = 'case 0'; },
  'missing assertion name': (r) => { delete r.testResults[0].assertionResults[0].fullName; },
  'unknown status': (r) => { r.testResults[0].assertionResults[0].status = 'success'; },
  'skipped case': (r) => { r.testResults[0].assertionResults[0].status = 'pending'; r.numPassedTests--; r.numPendingTests++; },
  'failed case': (r) => { r.testResults[0].assertionResults[0].status = 'failed'; r.testResults[0].status = 'failed'; r.numPassedTests--; r.numFailedTests++; r.success = false; },
  'contradictory suite status': (r) => { r.testResults[0].status = 'failed'; },
  'false success': (r) => { r.success = false; },
  'missing success': (r) => { delete r.success; },
  'missing counters': (r) => { delete r.numTotalTests; },
  'counter type': (r) => { r.numTotalTests = '37'; },
  'counter contradiction': (r) => { r.numPassedTests = 38; },
  'failed-suite counter': (r) => { r.numFailedTestSuites = 1; },
  'runtime-error counter': (r) => { r.numRuntimeErrorTestSuites = 1; },
  'snapshot failure': (r) => { r.snapshot = { failure: true }; },
  'unhandled errors': (r) => { r.unhandledErrors = [{}]; },
  'malformed file': (r) => { r.testResults[0] = null; },
  'malformed assertions': (r) => { r.testResults[0].assertionResults = null; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`Database evidence rejects ${name}`, () => {
  const data = databaseReport(); mutate(data);
  assert.throws(() => summarizeTests(data, { databaseOnly: true }));
});
test('Vitest absolute paths normalize to reviewed identities', () => {
  const r = databaseReport(); for (const f of r.testResults) f.name = '/checkout/' + f.name;
  assert.equal(summarizeTests(r, { databaseOnly: true }).passed, 37);
});
test('Per-fixture scope cannot accept a different or arbitrary suite', () => {
  assert.throws(() => summarizeTests(databaseReport(), { databaseOnly: true, databaseSuite: 'unknown' }));
  assert.throws(() => summarizeTests(report([databaseReport().testResults[0]]), { databaseOnly: true, databaseSuite: DATABASE_SUITES[1] }));
});
test('Combined completion requires both checked suites and cleanup', () => {
  assert.equal(summarizeDatabaseRun(fixtureResults()).passed, 37);
  for (const mutate of [
    (r) => r.pop(), (r) => { r[1] = structuredClone(r[0]); },
    (r) => { r[0].status = 'INFRASTRUCTURE_UNAVAILABLE'; },
    (r) => { r[0].status = 'TESTS_FAILED'; },
    (r) => { r[0].exitCode = 1; },
    (r) => { r[0].cleanup = 'UNVERIFIED_STARTUP'; },
    (r) => { r[0].evidence.passed = 1; },
    (r) => { r[0].evidence.databaseSuites[DATABASE_SUITES[0]].passed = 1; },
    (r) => { delete r[0].evidence; },
  ]) { const r = fixtureResults(); mutate(r); assert.throws(() => summarizeDatabaseRun(r)); }
});
for (const [error, status] of [[new TestEvidenceError('incomplete'), 'INCONCLUSIVE'], [new TestInfrastructureError('spawn timeout'), 'INFRASTRUCTURE_UNAVAILABLE']])
  test(`Fixture preserves ${status} rather than declaring assertion PASS`, async () => {
    let cleaned = false;
    const result = await runFixture({ start() {}, ready() {}, test() { throw error; }, cleanup() { cleaned = true; return 'VERIFIED_REMOVED'; } });
    assert.equal(result.status, status); assert.equal(cleaned, true); assert.notEqual(result.exitCode, 0);
  });

for (const variant of ['complete-default', 'partial-default', 'invalid-json'])
  test(`Application report CLI handles ${variant} without Docker`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'p4i-report-check-'));
    try {
      mkdirSync(join(dir, '.ci-results'));
      const r = report([file('app.test.ts', ['passed']), ...DATABASE_SUITES.map((s) => file(s, Array(DATABASE_COVERAGE[s]).fill('pending')))]);
      if (variant === 'partial-default') r.testResults.pop();
      writeFileSync(join(dir, '.ci-results/tests.json'), variant === 'invalid-json' ? '{' : JSON.stringify(r));
      const env = { ...process.env }; delete env.GITHUB_STEP_SUMMARY;
      const child = spawnSync(process.execPath, [resolve('scripts/ci/test-report.mjs')], { cwd: dir, env, encoding: 'utf8', timeout: 10000 });
      assert.equal(child.status, variant === 'complete-default' ? 0 : 1);
      assert.match(child.stdout, variant === 'complete-default' ? /"skipped": 37/ : /FAILED_OR_INCOMPLETE/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

test('A real failed assertion remains TESTS_FAILED with Vitest failed-suite metadata', async () => {
  const r = databaseReport();
  r.testResults[0].assertionResults[0].status = 'failed';
  r.testResults[0].status = 'failed'; r.success = false;
  r.numPassedTests--; r.numFailedTests++; r.numFailedTestSuites = 1;
  const result = await runFixture({ start() {}, ready() {},
    test() { return summarizeTests(r, { databaseOnly: true }); },
    cleanup() { return 'VERIFIED_REMOVED'; } });
  assert.equal(result.status, 'TESTS_FAILED'); assert.equal(result.exitCode, 1);
});
