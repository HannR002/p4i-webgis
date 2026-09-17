import { NextResponse } from 'next/server';
import { ADMIN_ROLES } from '../../../../../lib/authRoles';
import { requireRole } from '../../../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../../../lib/server/database';
import { apiErrorResponse } from '../../../../../lib/server/http';

export async function GET(request: Request) {
  try {
    await requireRole(request, ADMIN_ROLES);
    return NextResponse.json(await getDatabaseRepositories().dashboard.metrics());
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/admin/dashboard/metrics');
  }
}
