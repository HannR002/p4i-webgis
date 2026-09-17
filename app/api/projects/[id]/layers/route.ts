import { NextResponse } from 'next/server';
import { getRequestIdentity } from '../../../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../../../lib/server/database';
import { apiErrorResponse, isUuid } from '../../../../../lib/server/http';
import { resolveProjectLayerAccess } from '../../../../../lib/server/projectAccess';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });

    const repositories = getDatabaseRepositories();
    const identity = await getRequestIdentity(request);
    const viewer = identity ? { id: identity.user.id, role: identity.role } : null;
    const access = await resolveProjectLayerAccess(repositories, id, viewer);
    if (!access.allowed) {
      if (access.reason === 'not_found') {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: access.reason === 'forbidden' ? 'Project access denied' : 'Authentication required' },
        { status: access.reason === 'forbidden' ? 403 : 401 },
      );
    }

    return NextResponse.json(await repositories.projects.listLayerGeoJson(access.project.id), {
      headers: { 'Cache-Control': access.project.accessTier === 'public' ? 'public, max-age=60' : 'private, no-store' },
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/projects/[id]/layers');
  }
}
