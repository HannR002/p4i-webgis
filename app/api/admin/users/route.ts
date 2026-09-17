import { NextResponse } from 'next/server';
import { APP_ROLES, USER_ADMINISTRATION_ROLES, isAppRole } from '../../../../lib/authRoles';
import { requireRole } from '../../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../../lib/server/database';
import { apiErrorResponse, isUuid, readJsonBody } from '../../../../lib/server/http';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  try {
    await requireRole(request, USER_ADMINISTRATION_ROLES);
    return NextResponse.json(await getDatabaseRepositories().users.list());
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/admin/users');
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireRole(request, USER_ADMINISTRATION_ROLES);
    const body: unknown = await readJsonBody(request);
    if (!isRecord(body) || !isUuid(body.userId) || !isRecord(body.updates)) {
      return NextResponse.json({ error: 'Invalid user update payload' }, { status: 400 });
    }
    if (Object.keys(body).some((key) => key !== 'userId' && key !== 'updates')) {
      return NextResponse.json({ error: 'Request contains unsupported fields' }, { status: 400 });
    }

    const updateKeys = Object.keys(body.updates);
    if (
      updateKeys.length === 0 ||
      updateKeys.some((key) => key !== 'role' && key !== 'is_disabled')
    ) {
      return NextResponse.json({ error: 'Only role and is_disabled may be updated' }, { status: 400 });
    }

    const updates: { role?: (typeof APP_ROLES)[number]; is_disabled?: boolean } = {};
    if ('role' in body.updates) {
      if (!isAppRole(body.updates.role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      updates.role = body.updates.role;
    }
    if ('is_disabled' in body.updates) {
      if (typeof body.updates.is_disabled !== 'boolean') {
        return NextResponse.json({ error: 'is_disabled must be boolean' }, { status: 400 });
      }
      updates.is_disabled = body.updates.is_disabled;
    }

    if (body.userId === identity.user.id && (updates.is_disabled || updates.role !== undefined)) {
      return NextResponse.json(
        { error: 'A super admin cannot disable or change their own role' },
        { status: 400 },
      );
    }

    const updated = await getDatabaseRepositories().users.update(body.userId, updates);
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'PATCH /api/admin/users');
  }
}
