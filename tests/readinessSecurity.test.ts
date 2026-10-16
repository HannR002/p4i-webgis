import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
const external = vi.hoisted(() => ({
  network: vi.fn(() => {
    throw new Error('Unexpected external request');
  }),
  database: vi.fn(),
}));
vi.mock('../lib/server/database', () => ({
  getDatabaseRepositories: external.database,
}));
import { initializeEarthEngine } from '../lib/server/earthEngine';
import { analyzeFloodRisk } from '../lib/server/floodAnalysis';
import { parseFloodAnalysisInput } from '../config/floodRiskModel';
import {
  finiteFloodValue,
  floodHistogram,
  unitFloodValue,
} from '../lib/server/integration/floodValues';
import { getAIProvider, getGisPlanner } from '../lib/server/ai';
import {
  RequestBudget,
  RequestBudgetExceeded,
} from '../lib/server/requestBudget';
import { apiErrorResponse, readJsonBody } from '../lib/server/http';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('external execution and NoData safeguards', () => {
  it('never treats configured credentials or client confirmation as external execution permission', async () => {
    vi.stubGlobal('fetch', external.network);
    vi.stubEnv('GEE_PROJECT_ID', 'configured');
    vi.stubEnv('GEE_SERVICE_ACCOUNT_JSON', '{}');
    expect(() => initializeEarthEngine()).toThrow(/belum diotorisasi/);
    await expect(
      analyzeFloodRisk(
        parseFloodAnalysisInput({
          kecamatan_id: '123e4567-e89b-42d3-a456-426614174001',
        }),
        'actor',
      ),
    ).rejects.toThrow(/belum diotorisasi/);
    expect(external.network).not.toHaveBeenCalled();
    expect(external.database).not.toHaveBeenCalled();
  });
  it.each([null, undefined, '', false, '0', NaN, Infinity])(
    'rejects missing/non-numeric provider values: %s',
    (value) =>
      expect(() => finiteFloodValue({ rain: value }, 'rain')).toThrow(),
  );
  it('retains actual zero measurements, rejects out-of-range scores and malformed classes', () => {
    expect(finiteFloodValue({ rain: 0 }, 'rain')).toBe(0);
    expect(unitFloodValue(0)).toBe(0);
    expect(() => unitFloodValue(1.1)).toThrow();
    expect(() => unitFloodValue(-0.1)).toThrow();
    expect(floodHistogram({ soil: { '1': 10, '4': 0 } }, 'soil')).toEqual({
      '1': 10,
      '4': 0,
    });
    for (const value of [
      { soil: null },
      { soil: {} },
      { soil: { '1': null } },
      { soil: { '1': -1 } },
      { soil: { unknown: 2 } },
    ])
      expect(() => floodHistogram(value, 'soil')).toThrow();
  });
  it('explicit real/unknown/disabled AI selection never falls back to DEMO', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GIS_DEMO_MODE', 'true');
    for (const value of ['real', 'unknown', 'disabled']) {
      vi.stubEnv('AI_PROVIDER', value);
      expect(getAIProvider()).toBeNull();
      expect(getGisPlanner()).toBeNull();
    }
    vi.stubEnv('AI_PROVIDER', 'demo');
    expect(getAIProvider()?.mode).toBe('demo');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getAIProvider()).toBeNull();
  });
});
describe('bounded process containment', () => {
  it('caps concurrency, releases once, expires windows without resetting running work', () => {
    let now = 0;
    const budget = new RequestBudget(2, 1, () => now);
    const release = budget.acquire();
    expect(() => budget.acquire()).toThrow(RequestBudgetExceeded);
    now = 61000;
    expect(() => budget.acquire()).toThrow(RequestBudgetExceeded);
    release();
    release();
    budget.acquire()();
    budget.acquire()();
    expect(() => budget.acquire()).toThrow(RequestBudgetExceeded);
    now += 61000;
    expect(() => budget.acquire()()).not.toThrow();
  });
  it('enforces the byte cap even without Content-Length', async () => {
    await expect(
      readJsonBody(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ x: 'x'.repeat(65536) }),
        }),
      ),
    ).rejects.toThrow(/64 KiB/);
    await expect(
      readJsonBody(
        new Request('http://localhost', {
          method: 'POST',
          body: '{"ok":true}',
        }),
      ),
    ).resolves.toEqual({ ok: true });
  });
  it('does not log or return upstream secrets/payloads', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiErrorResponse(
      new Error('secret-token private-payload'),
      'API fixture',
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(
      /secret-token|private-payload/,
    );
    expect(await response.text()).not.toMatch(/secret-token|private-payload/);
  });
});
