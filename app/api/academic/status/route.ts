import { academicStatus } from '../../../../lib/academicPreview';
export async function GET() {
  const status = academicStatus(process.env);
  return Response.json({
    enabled: status === 'active',
    runtime: process.versions.node,
    sourceRevision: /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '') ? process.env.VERCEL_GIT_COMMIT_SHA : null,
    synthetic: true,
    identity: 'guest',
    planner: 'deterministic-demo',
    database: 'unavailable',
    externalAI: false,
    officialPublication: false,
  }, { status: status === 'invalid' ? 503 : 200, headers: { 'Cache-Control': 'private, no-store' } });
}
