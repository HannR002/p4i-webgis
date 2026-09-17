import { NextResponse } from 'next/server';
import { ENTITLEMENT_ADMINISTRATION_ROLES } from '../../../../lib/authRoles';
import { requireRole } from '../../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../../lib/server/database';
import { apiErrorResponse, isUuid, readJsonBody } from '../../../../lib/server/http';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    const identity = await requireRole(request, ENTITLEMENT_ADMINISTRATION_ROLES);
    const body: unknown = await readJsonBody(request);
    if (!isRecord(body) || !isUuid(body.client_user_id) || !isUuid(body.project_id)) {
      return NextResponse.json({ error: 'Valid client_user_id and project_id are required' }, { status: 400 });
    }
    if (Object.keys(body).some((key) => key !== 'client_user_id' && key !== 'project_id')) {
      return NextResponse.json({ error: 'Request contains unsupported fields' }, { status: 400 });
    }

    const repositories = getDatabaseRepositories();
    const [clientExists, projectExists] = await Promise.all([
      repositories.users.existsB2bClient(body.client_user_id),
      repositories.projects.exists(body.project_id),
    ]);
    if (!clientExists || !projectExists) {
      return NextResponse.json({ error: 'Client or project not found' }, { status: 404 });
    }

    await repositories.entitlements.grant(body.client_user_id, body.project_id, identity.user.id);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'POST /api/admin/entitlements');
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole(request, ENTITLEMENT_ADMINISTRATION_ROLES);
    const searchParams = new URL(request.url).searchParams;
    const clientUserId = searchParams.get('client_user_id');
    const projectId = searchParams.get('project_id');
    if (!isUuid(clientUserId) || !isUuid(projectId)) {
      return NextResponse.json({ error: 'Valid client_user_id and project_id are required' }, { status: 400 });
    }

    const revoked = await getDatabaseRepositories().entitlements.revoke(clientUserId, projectId);
    if (!revoked) return NextResponse.json({ error: 'Entitlement not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'DELETE /api/admin/entitlements');
  }
}
