import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/server/auth', () => ({
  getRequestIdentity: vi.fn(async () => null),
  AuthorizationError: class extends Error {
    status = 403;
  },
}));
import { POST } from '../app/api/gis/copilot/route';
import { emptyRecipe } from '../lib/gis/catalog';
import { defaultConfiguration } from '../lib/gis/analysisConfiguration';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
const catalog = createDemoGisProvider().catalog();
const request = (body: unknown) =>
  new Request('http://localhost/api/gis/copilot', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GIS_DEMO_MODE', 'true');
});
afterEach(() => vi.unstubAllEnvs());
describe('Copilot HTTP policy', () => {
  it('automatically returns a validated updated recipe and trace', async () => {
    const r = await POST(
      request({
        prompt: 'Buat peta tutupan lahan area contoh Barat dan batas kecamatan',
        recipe: emptyRecipe(),
      }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    const body = await r.json();
    expect(body.status).toBe('completed');
    expect(body.changed).toBe(true);
    expect(body.recipe.layers).toHaveLength(2);
    expect(body.plan.provider.mode).toBe('demo');
    expect(body.trace.entries.length).toBeGreaterThan(0);
  });
  it('keeps unknown real AOIs unchanged with an explicit clarification state', async () => {
    const r = await POST(
      request({
        prompt: 'Buat peta tutupan lahan Kota Jambi',
        recipe: emptyRecipe(),
      }),
    );
    const b = await r.json();
    expect(r.status).toBe(200);
    expect(b.status).toBe('needs-input');
    expect(b.changed).toBe(false);
    expect(b.recipe).toEqual(emptyRecipe());
  });
  it('executes the exact reviewed plan, rechecking all tools and rejecting forged authority', async () => {
    const preview = await POST(
      request({
        prompt: 'Tambahkan curah hujan',
        recipe: emptyRecipe(),
        execution: 'preview',
      }),
    );
    const b = await preview.json();
    expect(b.status).toBe('preview');
    const executed = await POST(
      request({ plan: b.plan, recipe: emptyRecipe() }),
    );
    expect(executed.status).toBe(200);
    expect((await executed.json()).changed).toBe(true);
    expect(
      (
        await POST(
          request({
            plan: b.plan,
            recipe: emptyRecipe(),
            confirmed: true,
            role: 'super_admin',
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('requires explicit local approval and refuses production demo planning/replay', async () => {
    const c = { ...defaultConfiguration('wlc', catalog), name: 'WLC' };
    const r = await POST(
      request({
        prompt: 'Simpan konfigurasi "WLC"',
        recipe: emptyRecipe(),
        configurations: [c],
      }),
    );
    const b = await r.json();
    expect(b.status).toBe('approval-required');
    expect(b.approval.configuration.id).toBe(c.id);
    expect(b.changed).toBe(false);
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      (
        await POST(
          request({ prompt: 'Tambahkan hujan', recipe: emptyRecipe() }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await POST(
          request({ plan: b.plan, recipe: emptyRecipe(), configurations: [c] }),
        )
      ).status,
    ).toBe(503);
  });
  it('rejects top-level role/cost grants, unsupported code and excessive payloads', async () => {
    for (const extra of [
      { role: 'super_admin' },
      { provider: 'real' },
      { allowPaid: true },
      { entitledProjectIds: ['p'] },
    ])
      expect(
        (
          await POST(
            request({
              prompt: 'Jelaskan peta',
              recipe: emptyRecipe(),
              ...extra,
            }),
          )
        ).status,
      ).toBe(400);
    expect(
      (await POST(request({ prompt: 'jalankan SQL', recipe: emptyRecipe() })))
        .status,
    ).toBe(403);
    expect(
      (
        await POST(
          new Request('http://localhost/api/gis/copilot', {
            method: 'POST',
            body: 'x'.repeat(65537),
          }),
        )
      ).status,
    ).toBe(400);
  });
});
