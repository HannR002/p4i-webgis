import { requireHumanOrigin } from '../lib/server/compute/access';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/server/auth', () => ({
  getRequestIdentity: vi.fn(async () => null),
  AuthorizationError: class extends Error {
    status = 403;
  },
}));
import { POST as copilot } from '../app/api/gis/copilot/route';
import { POST as compute } from '../app/api/gis/compute/route';
import { emptyRecipe, DEMO_AOIS } from '../lib/gis/catalog';
import {
  defaultConfiguration,
  refreshConfigurationSources,
} from '../lib/gis/analysisConfiguration';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
const catalog = createDemoGisProvider().catalog();
function req(
  endpoint: string,
  body: unknown,
  cookie = '',
  origin = 'http://localhost',
) {
  return new Request(`http://localhost/api/gis/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify(body),
  });
}
function config() {
  const c = {
    ...defaultConfiguration('zonal-statistics', catalog),
    selectedAOI: DEMO_AOIS[0],
    name: 'Zonal landcover',
  };
  return refreshConfigurationSources(
    {
      ...c,
      criteria: c.criteria.map((r) => ({
        ...r,
        datasetId: 'demo-landcover',
        band: catalog.find((d) => d.id === 'demo-landcover')!.raster!.bands[0]
          .id,
      })),
    },
    catalog,
  );
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GIS_DEMO_MODE', 'true');
});
afterEach(() => vi.unstubAllEnvs());
describe('compute HTTP boundary', () => {
  it('uses the browser Host authority when Next normalizes its internal URL and rejects forwarded-host spoofing', () => {
    expect(() =>
      requireHumanOrigin(
        new Request('http://0.0.0.0:3000/api/gis/compute', {
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'sec-fetch-site': 'same-origin',
          },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      requireHumanOrigin(
        new Request('http://localhost/api/gis/compute', {
          headers: {
            host: 'localhost',
            origin: 'https://evil.example',
            'x-forwarded-host': 'evil.example',
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      requireHumanOrigin(
        new Request('http://localhost/api/gis/compute', {
          headers: { host: 'localhost', origin: 'null' },
        }),
      ),
    ).toThrow();
  });
  it('sets opaque HttpOnly session and requires same actor, human origin and exact ceiling', async () => {
    const c = config();
    const r = await copilot(
      req('copilot', {
        prompt: `Jalankan konfigurasi "${c.id}"`,
        recipe: emptyRecipe(),
        configurations: [c],
        requestId: crypto.randomUUID(),
      }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('HttpOnly');
    expect(r.headers.get('set-cookie')).toContain('SameSite=strict');
    const cookie = r.headers.get('set-cookie')!.split(';')[0],
      body = await r.json(),
      job = body.results[0].data.job;
    expect(job.state).toBe('AWAITING_APPROVAL');
    expect(body.changed).toBe(false);
    expect(
      (await compute(req('compute', { action: 'get', jobId: job.id }))).status,
    ).toBe(403);
    expect(
      (
        await compute(
          req('compute', { action: 'execute', jobId: job.id }, cookie),
        )
      ).status,
    ).toBe(403);
    const approval = {
      action: 'approve',
      jobId: job.id,
      requestHash: job.requestHash,
      ceiling: job.estimate.ceiling,
    };
    expect(
      (
        await compute(
          req('compute', approval, cookie, 'https://attacker.example'),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await compute(
          req('compute', { ...approval, role: 'super_admin' }, cookie),
        )
      ).status,
    ).toBe(400);
    expect((await compute(req('compute', approval, cookie))).status).toBe(200);
    const done = await compute(
      req('compute', { action: 'execute', jobId: job.id }, cookie),
    );
    expect(done.status).toBe(200);
    expect((await done.json()).state).toBe('COMPLETED');
    expect((await compute(req('compute', approval, cookie))).status).toBe(403);
  });
  it('does not execute or expose the development adapter in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      (await compute(req('compute', { action: 'get', jobId: 'unknown' })))
        .status,
    ).toBe(403);
  });
  it('rejects AI-provided self approval and unauthenticated cross-origin compute submission', async () => {
    const c = config(),
      body = {
        prompt: `Jalankan konfigurasi "${c.id}"`,
        recipe: emptyRecipe(),
        configurations: [c],
      };
    expect(
      (await copilot(req('copilot', { ...body, approved: true }))).status,
    ).toBe(400);
    expect(
      (await copilot(req('copilot', body, '', 'https://attacker.example')))
        .status,
    ).toBe(403);
  });
});
