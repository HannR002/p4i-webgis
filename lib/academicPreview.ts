/** Server configuration contract. Never import environment values into client code. */
export const ACADEMIC_PROJECT_ID = 'prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb';
export const ACADEMIC_PREVIEW_ID = 'p4i-webgis-academic-v1';
export const HOSTINGER_APP_ID = 'p4i-webgis-academic-hostinger-v1';
type Environment = Record<string, string | undefined>;
export type AcademicStatus = 'disabled' | 'invalid' | 'active';
export function academicProvider(env: Environment): 'vercel' | 'hostinger' | null {
  const selected = env.P4I_PREVIEW_PROVIDER;
  if (selected === undefined || selected === 'vercel') return 'vercel';
  return selected === 'hostinger' ? 'hostinger' : null;
}
export function hostingerHostname(env: Environment): string | null {
  const hostname = env.P4I_HOSTINGER_HOSTNAME ?? '';
  if (hostname.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname) ||
      ['p4ijournal.org', 'journal.p4ijournal.org', 'publisher.p4ijournal.org'].includes(hostname)) return null;
  return hostname;
}
export function academicRequested(env: Environment): boolean {
  // A declared non-Vercel preview must never fall back to the normal app on a missing/off flag.
  return (env.P4I_PREVIEW_PROVIDER !== undefined && env.P4I_PREVIEW_PROVIDER !== 'vercel') ||
    ['P4I_HOSTINGER_APP_ID', 'P4I_HOSTINGER_ENV', 'P4I_HOSTINGER_HOSTNAME'].some((name) => Boolean(env[name])) ||
    (env.P4I_ACADEMIC_PREVIEW !== undefined && env.P4I_ACADEMIC_PREVIEW !== 'false');
}
export function academicStatus(env: Environment, nodeVersion = process.versions.node): AcademicStatus {
  if (!academicRequested(env)) return 'disabled';
  const [major, minor, patch] = nodeVersion.split('.').map(Number);
  if (major !== 22 || !Number.isInteger(minor) || !Number.isInteger(patch) || minor < 23 || (minor === 23 && patch < 3)) return 'invalid';
  if (env.P4I_ACADEMIC_PREVIEW !== 'true' || env.P4I_PREVIEW_ID !== ACADEMIC_PREVIEW_ID ||
      env.GIS_DEMO_MODE === 'true' || env.AI_PROVIDER !== 'academic-demo' || env.VECTOR_STORAGE_MODE !== 'disabled' ||
      env.GEMINI_FREE_ENABLED !== 'false') return 'invalid';
  const provider = academicProvider(env);
  if (provider === 'vercel') {
    if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' || env.VERCEL_PROJECT_ID !== ACADEMIC_PROJECT_ID ||
        !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL ?? '') ||
        ['P4I_HOSTINGER_APP_ID', 'P4I_HOSTINGER_ENV', 'P4I_HOSTINGER_HOSTNAME', 'P4I_HOSTINGER_ACCESS_USER', 'P4I_HOSTINGER_PASSWORD_SHA256']
          .some((name) => Boolean(env[name]))) return 'invalid';
  } else if (provider === 'hostinger') {
    if (env.NODE_ENV !== 'production' || env.P4I_HOSTINGER_APP_ID !== HOSTINGER_APP_ID ||
        env.P4I_HOSTINGER_ENV !== 'academic-preview' || !hostingerHostname(env) ||
        !/^[a-f0-9]{40}$/.test(env.P4I_SOURCE_REVISION ?? '') ||
        !/^[A-Za-z0-9._-]{3,64}$/.test(env.P4I_HOSTINGER_ACCESS_USER ?? '') ||
        !/^[a-f0-9]{64}$/.test(env.P4I_HOSTINGER_PASSWORD_SHA256 ?? '') ||
        /^0+$/.test(env.P4I_HOSTINGER_PASSWORD_SHA256 ?? '') ||
        ['VERCEL', 'VERCEL_ENV', 'VERCEL_PROJECT_ID', 'VERCEL_URL'].some((name) => Boolean(env[name]))) return 'invalid';
  } else return 'invalid';
  if (['SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'GEE_PROJECT_ID', 'GEE_SOIL_ASSET_ID',
    'GEE_SERVICE_ACCOUNT_JSON', 'GEE_SERVICE_ACCOUNT_JSON_BASE64', 'DATABASE_URL', 'SUPABASE_DB_URL',
    'VECTOR_STORAGE_LOCAL_URL', 'VECTOR_STORAGE_LOCAL_ACK'].some((name) => Boolean(env[name]))) return 'invalid';
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:9') return 'invalid';
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'local-test-only') return 'invalid';
  return 'active';
}
export function academicApiAllowed(path: string, method: string): boolean {
  if (['/api/gis/catalog', '/api/academic/status'].includes(path)) return method === 'GET';
  if (path === '/api/auth/session') return method === 'GET';
  if (['/api/gis/actions', '/api/gis/pixel', '/api/gis/process'].includes(path)) return method === 'POST';
  if (path === '/api/gis/copilot') return ['GET', 'POST'].includes(method);
  return method === 'GET' && (/^\/api\/gis\/vector\/demo-[a-z-]+$/.test(path) || /^\/api\/gis\/tiles\/demo-[a-z-]+\/\d+\/\d+\/\d+$/.test(path));
}
