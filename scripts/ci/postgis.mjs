// Opt-in disposable fixture only. No remote database settings are consumed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeTests, summarizeDatabaseRun, TestEvidenceError, publishSummary } from './report.mjs';
import { DATABASE_SUITES, DATABASE_COVERAGE, DATABASE_ASSERTIONS } from './database-coverage.mjs';

export const suites = DATABASE_SUITES;
export class TestInfrastructureError extends Error {}
export function validateFixture(state) {
  if (
    !/^p4i-vector15-[a-f0-9]+$/.test(state.network) ||
    state.db !== `${state.network}-db` ||
    state.api !== `${state.network}-api`
  )
    throw Error('Invalid fixture ownership');
  if (
    !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(state.endpoint) ||
    Number(new URL(state.endpoint).port) > 65535
  )
    throw Error('Only owned loopback fixtures permitted');
  return state;
}

// Separately test lifecycle ordering without invoking Docker, network or migrations.
export async function runFixture(ops) {
  let result = {
    status: 'INFRASTRUCTURE_UNAVAILABLE',
    exitCode: 2,
    stage: 'startup',
  };
  try {
    await ops.start();
    result.stage = 'readiness';
    await ops.ready();
    result = { status: 'TESTS_FAILED', exitCode: 1, stage: 'tests' };
    result.evidence = await ops.test();
    result.status = 'PASSED';
    result.exitCode = 0;
  } catch (error) {
    if (error instanceof TestEvidenceError) result = { ...result, status: 'INCONCLUSIVE', exitCode: 1 };
    if (error instanceof TestInfrastructureError) result = { ...result, status: 'INFRASTRUCTURE_UNAVAILABLE', exitCode: 2 };
    // Never print raw Docker, SQL, fixture-state or parser error objects.
  } finally {
    try {
      result.cleanup = (await ops.cleanup()) || 'COMPLETED';
    } catch {
      result = { ...result, status: 'CLEANUP_FAILED', exitCode: 2 };
    }
  }
  return result;
}

async function main() {
  if (process.argv[2] !== '--run-synthetic-only') {
    publishSummary('PostGIS plan; NOT EXECUTED', {
      suites,
      expectedCoverage: DATABASE_COVERAGE,
      expectedAssertions: DATABASE_ASSERTIONS,
      fixture: 'owned local Docker, synthetic identities only',
      activation:
        'explicit --run-synthetic-only; hosted workflow locked pending review',
    });
    return;
  }
  const reports = [];
  for (const suite of suites) {
    const dir = mkdtempSync(join(tmpdir(), 'p4i-ci-postgis-'));
    const statePath = join(dir, 'state.json');
    const reportPath = join(dir, 'tests.json');
    const env = {
      ...process.env,
      P4I_VECTOR_TEST_STATE: statePath,
      P4I_VECTOR_ANALYSIS: 'true',
    };
    for (const key of [
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_TLS',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
    ])
      delete env[key];
    const command = (bin, args, timeout = 180000) =>
      spawnSync(bin, args, {
        env,
        encoding: 'utf8',
        timeout,
        maxBuffer: 8 * 1024 * 1024,
      });
    const docker = (...args) =>
      command('docker', ['--host=unix:///var/run/docker.sock', ...args], 60000);
    let owned;
    let startupAttempted = false;
    const result = await runFixture({
      start() {
        if (docker('info', '--format', '{{.ServerVersion}}').status !== 0)
          throw Error('Docker unavailable');
        startupAttempted = true;
        const started = command(
          process.execPath,
          ['scripts/database/vector-local.mjs', 'start'],
          600000,
        );
        if (existsSync(statePath))
          owned = validateFixture(JSON.parse(readFileSync(statePath, 'utf8')));
        if (started.status !== 0 || !owned)
          throw Error('Fixture not available');
      },
      async ready() {
        if (
          docker(
            'exec',
            owned.db,
            'pg_isready',
            '-U',
            'postgres',
            '-d',
            'p4i_phase15_local',
          ).status !== 0
        )
          throw Error('PostgreSQL unavailable');
        // Assert actual PostgREST readiness, independent of legacy startup's loop.
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          try {
            if (
              (
                await fetch(owned.endpoint, {
                  signal: AbortSignal.timeout(1000),
                  redirect: 'error',
                })
              ).ok
            )
              return;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw Error('PostgREST unavailable');
      },
      test() {
        const tested = command(process.execPath, [
          'node_modules/vitest/vitest.mjs',
          'run',
          suite,
          '--reporter=json',
          `--outputFile=${reportPath}`,
        ]);
        if (tested.error || tested.signal || tested.status === null)
          throw new TestInfrastructureError('Database test process unavailable');
        let report;
        try { report = JSON.parse(readFileSync(reportPath, 'utf8')); }
        catch { throw new TestEvidenceError('Database assertion report unavailable'); }
        const evidence = summarizeTests(report, { databaseOnly: true, databaseSuite: suite });
        if (tested.status !== 0) throw new TestEvidenceError('Exit status contradicts assertion evidence');
        return evidence;
      },
      cleanup() {
        if (existsSync(statePath)) {
          owned = validateFixture(JSON.parse(readFileSync(statePath, 'utf8')));
          if (
            command(process.execPath, [
              'scripts/database/vector-local.mjs',
              'stop',
            ]).status !== 0
          )
            throw Error('Cleanup failed');
        }
        if (owned) {
          // List only names: never expose container environment or synthetic JWTs.
          const containers = docker('ps', '-a', '--format', '{{.Names}}');
          const networks = docker('network', 'ls', '--format', '{{.Name}}');
          if (
            containers.status !== 0 ||
            networks.status !== 0 ||
            containers.stdout
              .split('\n')
              .some((name) => [owned.db, owned.api].includes(name)) ||
            networks.stdout.split('\n').includes(owned.network)
          )
            throw Error('Owned resources remain');
        }
        rmSync(dir, { recursive: true, force: true });
        return owned
          ? 'VERIFIED_REMOVED'
          : startupAttempted
            ? 'UNVERIFIED_STARTUP'
            : 'NOT_NEEDED';
      },
    });
    reports.push({ suite, ...result });
    if (result.exitCode) {
      process.exitCode = result.exitCode;
      break;
    }
  }
  publishSummary(
    'Disposable PostGIS (unavailable is not a test pass)',
    reports,
  );
  try {
    publishSummary('Complete PostGIS coverage', summarizeDatabaseRun(reports));
  } catch {
    publishSummary('Complete PostGIS coverage', { status: 'INCOMPLETE', note: 'Both reviewed suites and verified cleanup are required; partial results are not full PASS.' });
    process.exitCode ||= 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
