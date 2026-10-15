import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/server/auth', () => ({
  getRequestIdentity: vi.fn(async () => null),
  AuthorizationError: class extends Error {
    status = 403;
  },
}));
import { POST as sample } from '../app/api/gis/pixel/route';
import { POST as actions } from '../app/api/gis/actions/route';
import { POST as copilot } from '../app/api/gis/copilot/route';
import { emptyRecipe } from '../lib/gis/catalog';
function request(path: string, body: unknown) {
  return new Request(`http://localhost/api/gis/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
describe('server GIS boundaries', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GIS_DEMO_MODE', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('executes an authorized fixture sample and rejects unknown IDs', async () => {
    const r = await sample(
      request('pixel', { datasetIds: ['demo-rainfall'], latitude: -1.6, longitude: 103.6 }),
    );
    expect(r.status).toBe(200);
    const d = (await r.json()) as { samples: { demo: boolean }[] };
    expect(d.samples[0].demo).toBe(true);
    expect(
      (await sample(request('pixel', { datasetIds: ['invented'], latitude: 0, longitude: 0 })))
        .status,
    ).toBe(400);
  });
  it('validates actions regardless of client-supplied role and returns no partial state', async () => {
    const r = await actions(
      request('actions', {
        role: 'super_admin',
        recipe: emptyRecipe(),
        actions: [{ tool: 'sql', query: 'drop table x' }],
      }),
    );
    expect(r.status).toBe(400);
    const allowed = await actions(
      request('actions', {
        recipe: emptyRecipe(),
        actions: [{ tool: 'addLayer', datasetId: 'demo-rainfall' }],
      }),
    );
    expect(allowed.status).toBe(200);
  });
  it('refuses fixtures and demo planning in production even with explicit flag or query', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      (
        await sample(
          request('pixel?demo=true', {
            datasetIds: ['demo-rainfall'],
            latitude: -1.6,
            longitude: 103.6,
          }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await copilot(
          request('copilot', { prompt: 'tambahkan curah hujan', recipe: emptyRecipe() }),
        )
      ).status,
    ).toBe(503);
  });
  it('rejects malformed and oversized JSON before planning', async () => {
    expect(
      (
        await copilot(
          new Request('http://localhost/api/gis/copilot', { method: 'POST', body: '{' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await actions(
          new Request('http://localhost/api/gis/actions', {
            method: 'POST',
            body: 'x'.repeat(65537),
          }),
        )
      ).status,
    ).toBe(400);
  });
});
