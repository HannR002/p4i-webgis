import { NextResponse } from 'next/server';
import { resolveProjectLayerAccess } from '../../../lib/server/projectAccess';
import { APP_ROLES } from '../../../lib/authRoles';
import { requireRole } from '../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../lib/server/database';
import { apiErrorResponse, isUuid, readJsonBody } from '../../../lib/server/http';

const FILE_TYPES = new Set(['pdf_report', 'geojson_export', 'image_export']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  try {
    const identity = await requireRole(request, APP_ROLES);
    const repositories = getDatabaseRepositories();
    const history = await repositories.downloads.listForUser(identity.user.id);
    // The service-role repository bypasses RLS. Recheck current project access
    // before releasing history metadata, including titles, after revocation.
    const viewer = { id: identity.user.id, role: identity.role };
    const visible = [];
    for (const row of history) {
      const access = await resolveProjectLayerAccess(repositories, row.project_id, viewer);
      if (access.allowed) visible.push(row);
    }
    return NextResponse.json(visible, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/downloads');
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireRole(request, APP_ROLES);
    const body: unknown = await readJsonBody(request);
    if (!isRecord(body) || !isUuid(body.project_id) || !FILE_TYPES.has(String(body.file_type))) {
      return NextResponse.json({ error: 'Valid project_id and file_type are required' }, { status: 400 });
    }
    if (Object.keys(body).some((key) => key !== 'project_id' && key !== 'file_type')) {
      return NextResponse.json({ error: 'Request contains unsupported fields' }, { status: 400 });
    }

    const repositories = getDatabaseRepositories();
    const project = await repositories.projects.findAccess(body.project_id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    if (identity.role === 'b2b_client' && project.accessTier === 'restricted') {
      if (!await repositories.entitlements.has(identity.user.id, project.id)) {
        return NextResponse.json({ error: 'Project access denied' }, { status: 403 });
      }
    }

    await repositories.downloads.record(identity.user.id, project.id, body.file_type as 'pdf_report' | 'geojson_export' | 'image_export');
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'POST /api/downloads');
  }
}
