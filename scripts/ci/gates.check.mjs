import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeAudit, summarizeTests } from './report.mjs';
import { runFixture, validateFixture } from './postgis.mjs';

const file = (name, statuses) => ({
  name,
  assertionResults: statuses.map((status) => ({ status })),
});
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
test('Default test summary reports skipped database cases separately', () => {
  const summary = summarizeTests({
    success: true,
    testResults: [
      file('app.test.ts', ['passed']),
      file('vectorPostgis.integration.test.ts', ['pending', 'pending']),
    ],
  });
  assert.deepEqual(summary, {
    passed: 1,
    failed: 0,
    skipped: 2,
    database: { passed: 0, failed: 0, skipped: 2 },
  });
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
test('Opt-in database summary requires execution and rejects skips', () => {
  assert.equal(
    summarizeTests(
      {
        success: true,
        testResults: [file('vectorAnalysis.integration.test.ts', ['passed'])],
      },
      { databaseOnly: true },
    ).database.passed,
    1,
  );
  assert.throws(() =>
    summarizeTests(
      {
        success: true,
        testResults: [
          file('vectorPostgis.integration.test.ts', ['passed', 'pending']),
        ],
      },
      { databaseOnly: true },
    ),
  );
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
