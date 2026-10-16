import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { parseFloodAnalysisInput } from '../config/floodRiskModel';

vi.mock('server-only', () => ({}));
const external = vi.hoisted(() => ({
  database: vi.fn(() => {
    throw new Error('Unexpected database access');
  }),
}));
vi.mock('../lib/server/database', () => ({
  getDatabaseRepositories: external.database,
}));

const input = parseFloodAnalysisInput({
  kecamatan_id: '123e4567-e89b-42d3-a456-426614174001',
});
const credentialNames = new Set([
  'GEE_SERVICE_ACCOUNT_JSON',
  'GEE_SERVICE_ACCOUNT_JSON_BASE64',
  'GOOGLE_APPLICATION_CREDENTIALS',
]);
let restoreEnvironment: () => void;
let credentialReads: string[];
const network = vi.fn((): never => {
  throw new Error('Unexpected network request');
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  credentialReads = [];
  // Fail before reading a bound value; no real credentials are accessed.
  const originalEnv = process.env;
  process.env = new Proxy(Object.create(null) as NodeJS.ProcessEnv, {
    get(target, key) {
      if (typeof key === 'string' && credentialNames.has(key)) {
        credentialReads.push(key);
        throw new Error(
          'Credential access forbidden in the unavailable adapter',
        );
      }
      return Object.hasOwn(target, key)
        ? Reflect.get(target, key)
        : Reflect.get(originalEnv, key);
    },
  });
  restoreEnvironment = () => {
    process.env = originalEnv;
  };
  vi.stubGlobal('fetch', network);
  vi.spyOn(http, 'request').mockImplementation(network);
  vi.spyOn(http, 'get').mockImplementation(network);
  vi.spyOn(https, 'request').mockImplementation(network);
  vi.spyOn(https, 'get').mockImplementation(network);
  vi.spyOn(net, 'connect').mockImplementation(network);
  vi.spyOn(net, 'createConnection').mockImplementation(network);
});
afterEach(() => {
  vi.unstubAllEnvs();
  restoreEnvironment();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('../lib/server/integration/readiness');
  vi.resetModules();
});
function expectNoExternalEffects() {
  expect(credentialReads).toEqual([]);
  expect(network).not.toHaveBeenCalled();
  expect(external.database).not.toHaveBeenCalled();
}

describe('Earth Engine isolation', () => {
  it.each(['development', 'production'] as const)(
    'module load, initializer, service and adapter refuse in %s even with DEMO flags',
    async (mode) => {
      vi.stubEnv('NODE_ENV', mode);
      vi.stubEnv('GIS_DEMO_MODE', 'true');
      vi.stubEnv('AI_PROVIDER', 'demo');
      vi.stubEnv('GEE_PROJECT_ID', 'synthetic-not-authorized');
      const { initializeEarthEngine, unavailableEarthEngineProvider } =
        await import('../lib/server/earthEngine');
      const { analyzeFloodRisk } = await import('../lib/server/floodAnalysis');
      expect(() => initializeEarthEngine()).toThrow(/belum diotorisasi/);
      await expect(
        unavailableEarthEngineProvider.analyze(input, 'actor'),
      ).rejects.toThrow(/belum diotorisasi/);
      await expect(analyzeFloodRisk(input, 'actor')).rejects.toThrow(
        /belum diotorisasi/,
      );
      expectNoExternalEffects();
    },
  );

  it('still refuses if the outer service readiness guard is relaxed', async () => {
    vi.doMock(
      '../lib/server/integration/readiness',
      async (importOriginal) => ({
        ...(await importOriginal<
          typeof import('../lib/server/integration/readiness')
        >()),
        requireGovernedEarthEngine: () => undefined,
      }),
    );
    const { analyzeFloodRisk } = await import('../lib/server/floodAnalysis');
    await expect(analyzeFloodRisk(input, 'actor')).rejects.toThrow(
      /belum diotorisasi/,
    );
    expectNoExternalEffects();
  });

  it('keeps the real anonymous legacy endpoint unauthorized without provider side effects', async () => {
    const { POST } = await import('../app/api/gee/flood-analysis/route');
    const response = await POST(
      new Request('http://localhost/api/gee/flood-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(401);
    expectNoExternalEffects();
  });

  it('does not install or declare any member of the vulnerable GEE chain', () => {
    const lock = JSON.parse(
      readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
    );
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    for (const name of [
      '@google/earthengine',
      'googleapis',
      'googleapis-common',
      'google-auth-library',
      'gtoken',
      'google-p12-pem',
      'node-forge',
      'uuid',
    ]) {
      expect(
        Object.keys(lock.packages).some((key) =>
          key.endsWith('node_modules/' + name),
        ),
        name,
      ).toBe(false);
      for (const group of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
      ]) {
        expect(manifest[group]?.[name], name).toBeUndefined();
      }
      expect(
        existsSync(new URL('../node_modules/' + name, import.meta.url)),
        name,
      ).toBe(false);
    }
    expectNoExternalEffects();
  });
});
