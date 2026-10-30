/** Server configuration contract. Never import environment values into client code. */
export const ACADEMIC_PROJECT_ID = 'prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb';
export const ACADEMIC_PREVIEW_ID = 'p4i-webgis-academic-v1';
type Environment = Record<string, string | undefined>;
export type AcademicStatus = 'disabled' | 'invalid' | 'active';
export function academicRequested(env: Environment): boolean {
  return env.P4I_ACADEMIC_PREVIEW !== undefined && env.P4I_ACADEMIC_PREVIEW !== 'false';
}
export function academicStatus(env: Environment, nodeVersion = process.versions.node): AcademicStatus {
  if (!academicRequested(env)) return 'disabled';
  const [major, minor, patch] = nodeVersion.split('.').map(Number);
  if (major !== 22 || !Number.isInteger(minor) || !Number.isInteger(patch) || minor < 23 || (minor === 23 && patch < 3)) return 'invalid';
  if (env.P4I_ACADEMIC_PREVIEW !== 'true' || env.P4I_PREVIEW_ID !== ACADEMIC_PREVIEW_ID ||
      env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' || env.VERCEL_PROJECT_ID !== ACADEMIC_PROJECT_ID ||
      !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL ?? '') ||
      env.GIS_DEMO_MODE === 'true' || env.AI_PROVIDER !== 'academic-demo' || env.VECTOR_STORAGE_MODE !== 'disabled' ||
      env.GEMINI_FREE_ENABLED !== 'false') return 'invalid';
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
