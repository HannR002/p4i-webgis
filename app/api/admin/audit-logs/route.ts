import { NextResponse } from 'next/server';
import { SUPER_ADMIN_ROLES } from '../../../../lib/authRoles';
import { requireRole } from '../../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../../lib/server/database';
import { apiErrorResponse } from '../../../../lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await requireRole(request, SUPER_ADMIN_ROLES);
    const logs = await getDatabaseRepositories().audits.latest(20);
    return NextResponse.json(logs, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/admin/audit-logs');
  }
}
