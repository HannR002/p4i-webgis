import { academicStatus, academicProvider } from '../../../../lib/academicPreview';
export async function GET() {
  const status = academicStatus(process.env);
  const provider = academicProvider(process.env);
  const revision = provider === 'hostinger' ? process.env.P4I_SOURCE_REVISION : process.env.VERCEL_GIT_COMMIT_SHA;
  return Response.json({
    enabled: status === 'active',
    runtime: process.versions.node,
    sourceRevision: /^[a-f0-9]{40}$/.test(revision ?? '') ? revision : null,
    deploymentProvider: provider,
    synthetic: true,
    identity: 'guest',
    planner: 'deterministic-demo',
    database: 'unavailable',
    externalAI: false,
    officialPublication: false,
  }, { status: status === 'invalid' ? 503 : 200, headers: { 'Cache-Control': 'private, no-store' } });
}
