import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { NextRequest } from 'next/server';
import { academicStatus, academicRequested, HOSTINGER_APP_ID, ACADEMIC_PREVIEW_ID } from '../lib/academicPreview';
import { hostingerAccessAllowed } from '../lib/server/hostingerPreviewAccess';
import { proxy } from '../proxy';
import { getGisProvider } from '../lib/server/gis';
import { getAIProvider } from '../lib/server/ai';
import { getGisContext } from '../lib/server/gis/context';
import { getIdentityFromAccessToken } from '../lib/server/auth';
import { getDatabaseRepositories } from '../lib/server/database';
import { createSupabaseServiceClient } from '../lib/server/database/providers/supabase/client';

// Reserved local fixture only. This is not an assigned or approved Hostinger hostname/password.
const hostname = 'webgis-r8.example.test', password = 'local-test-only-r8-password-do-not-deploy';
const valid = {
  P4I_ACADEMIC_PREVIEW: 'true', P4I_PREVIEW_ID: ACADEMIC_PREVIEW_ID,
  P4I_PREVIEW_PROVIDER: 'hostinger', P4I_HOSTINGER_APP_ID: HOSTINGER_APP_ID,
  P4I_HOSTINGER_ENV: 'academic-preview', P4I_HOSTINGER_HOSTNAME: hostname,
  P4I_HOSTINGER_ACCESS_USER: 'qa-supervisor', P4I_HOSTINGER_PASSWORD_SHA256: createHash('sha256').update(password).digest('hex'),
  P4I_SOURCE_REVISION: '120d0e09cc6e75bf224ae853f35e74b0a2292d3c',
  NODE_ENV: 'production' as const, GIS_DEMO_MODE: 'false', AI_PROVIDER: 'academic-demo',
  VECTOR_STORAGE_MODE: 'disabled', GEMINI_FREE_ENABLED: 'false',
};
const credential = 'Basic ' + Buffer.from(`qa-supervisor:${password}`).toString('base64');
const forbidden = ['SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'GEE_PROJECT_ID', 'GEE_SOIL_ASSET_ID', 'GEE_SERVICE_ACCOUNT_JSON',
  'GEE_SERVICE_ACCOUNT_JSON_BASE64', 'DATABASE_URL', 'SUPABASE_DB_URL', 'VECTOR_STORAGE_LOCAL_URL', 'VECTOR_STORAGE_LOCAL_ACK',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
beforeEach(() => {
  for (const name of [...forbidden, 'VERCEL', 'VERCEL_ENV', 'VERCEL_PROJECT_ID', 'VERCEL_URL']) vi.stubEnv(name, undefined);
  for (const [name, value] of Object.entries(valid)) vi.stubEnv(name, value);
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('External access forbidden'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (path: string, auth: string | undefined = credential, host = hostname, method = 'GET') => new NextRequest(`https://${hostname}${path}`, {
  method, headers: { Host: host, ...(auth === undefined ? {} : { Authorization: auth }), Cookie: 'sb-access-token=forged; role=super_admin', 'x-forwarded-host': hostname },
});

it('activates only the explicit Hostinger contract without any Vercel identity', () => {
  expect(academicStatus(process.env)).toBe('active');
  for (const name of Object.keys(valid)) {
    if (name === 'GIS_DEMO_MODE') continue;
    expect(academicStatus({ ...valid, [name]: undefined })).not.toBe('active');
  }
  expect(academicRequested({ P4I_PREVIEW_PROVIDER: 'hostinger' })).toBe(true);
  expect(academicStatus({ ...valid, P4I_ACADEMIC_PREVIEW: 'false' })).toBe('invalid');
});
it.each([
  ['P4I_PREVIEW_PROVIDER', 'HOSTINGER'], ['P4I_HOSTINGER_APP_ID', 'another-app'], ['P4I_HOSTINGER_ENV', 'production'],
  ['P4I_ACADEMIC_PREVIEW', 'TRUE'], ['NODE_ENV', 'development'], ['P4I_SOURCE_REVISION', 'branch-name'],
  ['P4I_HOSTINGER_PASSWORD_SHA256', ''], ['P4I_HOSTINGER_PASSWORD_SHA256', '0'.repeat(64)],
  ['P4I_HOSTINGER_HOSTNAME', '*.hostingersite.com'], ['P4I_HOSTINGER_HOSTNAME', 'https://example.test'],
  ['P4I_HOSTINGER_HOSTNAME', '127.0.0.1'], ['P4I_HOSTINGER_HOSTNAME', 'webgis.example.test:443'],
  ['P4I_HOSTINGER_HOSTNAME', 'p4ijournal.org'], ['P4I_HOSTINGER_HOSTNAME', 'journal.p4ijournal.org'],
  ['P4I_HOSTINGER_HOSTNAME', 'publisher.p4ijournal.org'], ['VERCEL', '1'], ['VERCEL_ENV', 'preview'],
  ['VERCEL_PROJECT_ID', 'prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb'], ['VERCEL_URL', 'spoof.vercel.app'],
  ['AI_PROVIDER', 'gemini-free'], ['VECTOR_STORAGE_MODE', 'local-postgis'], ['GEMINI_FREE_ENABLED', 'true'],
  ...forbidden.map(name => [name, 'synthetic-forbidden-marker']),
])('rejects invalid server configuration %s', (name, value) => {
  vi.stubEnv(name, value); expect(academicStatus(process.env)).toBe('invalid');
});
it.each(['22.23.2', '24.0.0', 'invalid'])('refuses unsupported runtime %s', version => {
  expect(academicStatus(valid, version)).toBe('invalid');
});
it.each(['/spatial/viewer', '/api/gis/catalog', '/_next/static/test.js', '/_next/image', '/favicon.ico', '/gis/previews/climate.png'])('protects pages, API and assets %s', async path => {
  const denied = await proxy(request(path, 'Bearer forged'));
  expect(denied.status).toBe(401); expect(denied.headers.get('www-authenticate')).toContain('Basic');
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects malformed credentials, forged hosts, forwarding headers and missing configuration', async () => {
  for (const auth of ['', 'Basic !!!', credential + 'junk', 'Basic ' + Buffer.from('qa-supervisor:wrong').toString('base64')])
    expect((await proxy(request('/api/gis/catalog', auth))).status).toBe(401);
  expect((await proxy(request('/api/gis/catalog', credential, 'another.example.test'))).status).toBe(503);
  expect((await proxy(request('/api/gis/catalog', credential, hostname + ',evil.test'))).status).toBe(503);
  vi.stubEnv('P4I_HOSTINGER_HOSTNAME', undefined);
  expect((await proxy(request('/api/gis/catalog'))).status).toBe(503);
  expect(hostingerAccessAllowed('Basic ' + Buffer.from('qa-supervisor:short').toString('base64'), process.env)).toBe(false);
});
it('retains the method/path allowlist and authenticates only preview access, never real users', async () => {
  expect((await proxy(request('/api/gis/catalog'))).headers.get('x-middleware-next')).toBe('1');
  for (const path of ['/api/admin/users', '/api/projects/list', '/api/gis/compute', '/api/gis/vector-storage', '/api/gis/vector-analysis', '/api/gee/flood-analysis'])
    expect((await proxy(request(path))).status).toBe(503);
  expect((await proxy(request('/api/auth/session', credential, hostname, 'POST'))).status).toBe(503);
  expect(getGisProvider().catalog().every(d => d.accessTier === 'public' && d.id.startsWith('demo-'))).toBe(true);
  expect(getAIProvider()).toMatchObject({ id: 'deterministic-demo', mode: 'demo' });
  expect(await getIdentityFromAccessToken('forged')).toBeNull();
  expect(await getGisContext(request('/'), getGisProvider().catalog())).toEqual({ role: 'guest', entitledProjectIds: [] });
  expect(() => getDatabaseRepositories()).toThrow(/unavailable/);
  expect(() => createSupabaseServiceClient()).toThrow(/unavailable/);
  expect(fetch).not.toHaveBeenCalled();
});
it('separates Hostinger and Vercel build preflights without printing configuration values', () => {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const hostinger = spawnSync(process.execPath, ['scripts/deployment/hostinger-preflight.mjs'], { env: { ...valid, P4I_SOURCE_REVISION: revision }, encoding: 'utf8' });
  expect(hostinger.status).toBe(0);
  const vercel = spawnSync(process.execPath, ['scripts/deployment/academic-preflight.mjs'], { env: valid, encoding: 'utf8' });
  expect(vercel.status).toBe(1);
  expect(hostinger.stdout + hostinger.stderr).not.toContain(valid.P4I_HOSTINGER_PASSWORD_SHA256);
  const mismatch = spawnSync(process.execPath, ['scripts/deployment/hostinger-preflight.mjs'], { env: { ...valid, P4I_SOURCE_REVISION: '0'.repeat(40) }, encoding: 'utf8' });
  expect(mismatch.status).toBe(1);
});
