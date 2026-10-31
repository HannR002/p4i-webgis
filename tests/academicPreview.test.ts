import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { NextRequest } from 'next/server';
import { academicStatus, academicApiAllowed, ACADEMIC_PROJECT_ID, ACADEMIC_PREVIEW_ID } from '../lib/academicPreview';
import { demoEnabled } from '../lib/gis/mode';
import { getGisProvider } from '../lib/server/gis';
import { getAIProvider } from '../lib/server/ai';
import { getDatabaseRepositories } from '../lib/server/database';
import { createSupabaseServiceClient } from '../lib/server/database/providers/supabase/client';
import { getIdentityFromAccessToken } from '../lib/server/auth';
import { getGisContext } from '../lib/server/gis/context';
import { proxy } from '../proxy';
import { GET as catalogGET } from '../app/api/gis/catalog/route';
import { POST as copilotPOST } from '../app/api/gis/copilot/route';
import { POST as pixelPOST } from '../app/api/gis/pixel/route';
import { freeAiStatus } from '../lib/server/ai/providers/geminiFree';
import { emptyRecipe } from '../lib/gis/catalog';
const valid: Record<string, string> = {
  P4I_ACADEMIC_PREVIEW: 'true', P4I_PREVIEW_ID: ACADEMIC_PREVIEW_ID,
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: ACADEMIC_PROJECT_ID, VERCEL_URL: 'synthetic-test.vercel.app',
  AI_PROVIDER: 'academic-demo', GIS_DEMO_MODE: 'false', VECTOR_STORAGE_MODE: 'disabled', GEMINI_FREE_ENABLED: 'false',
};
const credentials = ['SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'GEE_PROJECT_ID', 'GEE_SOIL_ASSET_ID',
  'GEE_SERVICE_ACCOUNT_JSON', 'GEE_SERVICE_ACCOUNT_JSON_BASE64', 'DATABASE_URL', 'SUPABASE_DB_URL', 'VECTOR_STORAGE_LOCAL_URL', 'VECTOR_STORAGE_LOCAL_ACK'];
beforeEach(() => {
  for (const [name, value] of Object.entries(valid)) vi.stubEnv(name, value);
  for (const name of credentials) vi.stubEnv(name, '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local-test-only');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('No external call permitted'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (path: string, method = 'GET', body?: unknown) => new NextRequest('https://synthetic-test.vercel.app' + path, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: { Authorization: 'Bearer synthetic-untrusted', Cookie: 'sb-access-token=synthetic-untrusted' },
});
it('requires a narrow verified configuration, preserves production DEMO refusal and has an off switch', () => {
  expect(academicStatus(process.env)).toBe('active'); expect(demoEnabled(process.env)).toBe(false);
  expect(academicStatus({})).toBe('disabled'); expect(academicStatus({ ...valid, P4I_ACADEMIC_PREVIEW: 'false' })).toBe('disabled');
  expect(academicStatus({ P4I_ACADEMIC_PREVIEW: 'TRUE' })).toBe('invalid');
  for (const name of Object.keys(valid)) {
    if (name === 'GIS_DEMO_MODE') continue;
    const env = { ...valid }; delete env[name];
    expect(academicStatus(env)).not.toBe('active');
  }
});
it.each([
  ['VERCEL_ENV', 'production'], ['VERCEL_PROJECT_ID', 'corporate-hub'], ['VERCEL_URL', 'external.invalid'],
  ['P4I_PREVIEW_ID', 'unknown'], ['AI_PROVIDER', 'gemini-free'], ['GIS_DEMO_MODE', 'true'], ['VECTOR_STORAGE_MODE', 'local-postgis'],
  ['NEXT_PUBLIC_SUPABASE_URL', 'https://external.invalid'], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'not-a-real-key'],
  ...credentials.map((name) => [name, 'not-a-real-secret']),
])('fails closed for %s', (name, value) => {
  vi.stubEnv(name, value); expect(academicStatus(process.env)).toBe('invalid');
});
it('exposes only allowed synthetic public datasets and refuses unknown real sources', async () => {
  const provider = getGisProvider(); expect(provider.mode).toBe('demo');
  expect(provider.catalog().length).toBeGreaterThan(0);
  expect(provider.catalog().every((d) => d.accessTier === 'public' && d.id.startsWith('demo-') && d.status === 'demo')).toBe(true);
  expect(provider.vector('real-private-layer').status).toBe('unavailable');
  expect(provider.sample('official-rainfall', 0, 0).status).toBe('unavailable');
  const response = await catalogGET(request('/api/gis/catalog'));
  expect((await response.json()).role).toBe('guest'); expect(fetch).not.toHaveBeenCalled();
});
it('refuses privileged database access and real identities even with supplied bearer/cookie', async () => {
  expect(() => createSupabaseServiceClient()).toThrow(/unavailable/);
  expect(() => getDatabaseRepositories()).toThrow(/unavailable/);
  expect(await getIdentityFromAccessToken('synthetic-untrusted')).toBe(null);
  expect(await getGisContext(request('/'), getGisProvider().catalog())).toEqual({ role: 'guest', entitledProjectIds: [] });
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['/api/admin/users', '/api/projects/list', '/api/projects', '/api/downloads', '/api/gee/flood-analysis', '/api/gis/vector-storage', '/api/gis/vector-analysis', '/api/gis/compute', '/api/consulting', '/api/ai-recommendation'])('blocks backend %s before any provider access', async (path) => {
  expect((await proxy(request(path, 'POST', { role: 'super_admin' }))).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it('blocks auth mutation, preserves guest status and rejects invalid preview identity', async () => {
  expect(academicApiAllowed('/api/auth/session', 'POST')).toBe(false);
  expect((await proxy(request('/api/auth/session', 'POST', {}))).status).toBe(503);
  vi.stubEnv('VERCEL_PROJECT_ID', 'other');
  expect((await proxy(request('/api/gis/catalog'))).status).toBe(503);
  expect(getGisProvider().mode).toBe('unavailable'); expect(getAIProvider()).toBe(null);
});
it('redirects private pages and legacy landing to accurate preview pages', async () => {
  expect((await proxy(request('/admin/dashboard'))).headers.get('location')).toContain('/academic-unavailable');
  expect((await proxy(request('/'))).headers.get('location')).toContain('/spatial/home');
});
it('preserves Vercel asset handling while the shared matcher covers Hostinger assets', async () => {
  for (const path of ['/_next/static/chunks/example.js', '/_next/image', '/favicon.ico']) {
    const response = await proxy(request(path));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('cache-control')).toBeNull();
  }
});
it('uses a deterministic planner for actual validated session edits, never an LLM', async () => {
  expect(freeAiStatus(process.env)).toMatchObject({ provider: 'demo', externalEnabled: false });
  const response = await copilotPOST(request('/api/gis/copilot', 'POST', { prompt: 'Buatkan peta baru bernama Survei Akademik dan gunakan tanpa basemap.', recipe: emptyRecipe(), configurations: [] }));
  expect(response.status).toBe(200); const output = await response.json();
  expect(output.recipe.title).toBe('Survei Akademik'); expect(output.plan.provider.mode).toBe('demo');
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps oversize JSON rejection on academic GIS APIs', async () => {
  const response = await pixelPOST(request('/api/gis/pixel', 'POST', { x: 'x'.repeat(65536) }));
  expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});

it.each(['24.0.0', '22.23.2', '20.0.0', 'invalid'])('refuses unsupported runtime %s', (version) => { expect(academicStatus(process.env, version)).toBe('invalid'); });
