import { NextResponse } from 'next/server';
import { getRequestIdentity } from '../../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../../lib/server/database';
import { apiErrorResponse } from '../../../../lib/server/http';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    // Guests see public projects; B2B clients see public plus entitled projects;
    // administrative roles see all projects.
    const viewer = identity ? { id: identity.user.id, role: identity.role } : null;
    return NextResponse.json(await getDatabaseRepositories().projects.listForViewer(viewer));
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/projects/list');
  }
}
