import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/server/auth', () => ({
  getRequestIdentity: vi.fn(async () => null),
  AuthorizationError: class extends Error {
    status = 403;
  },
}));
import { GET, POST } from '../app/api/gis/copilot/route';
import { emptyRecipe } from '../lib/gis/catalog';
import { SYNTHETIC_GEMINI_PROMPT } from '../lib/gis/freeAi';
const request = (body: unknown) =>
  new Request('http://localhost/api/gis/copilot', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GIS_DEMO_MODE', 'true');
  vi.stubEnv('AI_PROVIDER', 'demo');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('vector Copilot HTTP boundary', () => {
  it('commits validated GeoJSON and rejects forged selected IDs/authority', async () => {
    const r = await POST(
      request({
        prompt: 'Tambahkan titik A [103.61,-1.61]',
        recipe: emptyRecipe(),
      }),
    );
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.recipe.sketchLayers[0].data.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [103.61, -1.61],
    });
    for (const extra of [
      { selectedVectorIds: ['private-object'] },
      { role: 'super_admin' },
      { projectId: 'private' },
    ])
      expect(
        (
          await POST(
            request({
              prompt: 'Tambahkan titik A [0,0]',
              recipe: emptyRecipe(),
              ...extra,
            }),
          )
        ).status,
      ).toBe(400);
  });
  it('does not fabricate missing coordinates or silently save a map', async () => {
    for (const prompt of ['Tambahkan titik A', 'Simpan peta']) {
      const r = await POST(request({ prompt, recipe: emptyRecipe() }));
      const b = await r.json();
      expect(r.status).toBe(200);
      expect(b.status).toBe('needs-input');
      expect(b.changed).toBe(false);
    }
  });
  it('exposes safe pending status and refuses unverified Gemini with zero HTTP calls', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini-free');
    vi.stubEnv('GEMINI_FREE_ENABLED', 'false');
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    expect(await (await GET()).json()).toMatchObject({
      provider: 'gemini-free',
      externalEnabled: false,
      liveStatus: 'LIVE_INTEGRATION_PENDING',
    });
    const r = await POST(
      request({ prompt: SYNTHETIC_GEMINI_PROMPT, recipe: emptyRecipe() }),
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ code: 'FREE_TIER_UNVERIFIED' });
    expect(network).not.toHaveBeenCalled();
  });
  it('rejects arbitrary JavaScript and incorrect longitude/latitude at the server', async () => {
    expect(
      (
        await POST(
          request({
            prompt: 'Tambahkan titik A [181,-1]',
            recipe: emptyRecipe(),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            prompt: 'Jalankan javascript dan buat titik A',
            recipe: emptyRecipe(),
          }),
        )
      ).status,
    ).toBe(403);
  });
});
