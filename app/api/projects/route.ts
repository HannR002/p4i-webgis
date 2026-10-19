import { NextResponse } from 'next/server';
import {
  PROJECT_CREATE_ROLES,
  PROJECT_DELETE_ROLES,
} from '../../../lib/authRoles';
import { requireRole } from '../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../lib/server/database';
import { apiErrorResponse, isUuid } from '../../../lib/server/http';
import {
  cancelUpload,
  parseProjectUpload,
  UploadError,
} from '../../../lib/server/projectUpload';
import {
  projectUploadBudget,
  RequestBudgetExceeded,
} from '../../../lib/server/requestBudget';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  let response: NextResponse;
  try {
    // Bound outstanding authentication/ingestion/persistence work, not just parsing.
    release = projectUploadBudget.acquire();
    await requireRole(request, PROJECT_CREATE_ROLES);
    const { project, layers } = await parseProjectUpload(request);
    if (request.signal.aborted)
      throw new UploadError(408, 'Upload request cancelled');
    // All input validation completes before the repository's first mutation.
    const projectId = await getDatabaseRepositories().projects.createWithLayers(
      project,
      layers,
    );
    response = NextResponse.json(
      {
        success: true,
        message: 'Proyek dan data spasial berhasil disimpan',
        projectId,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    cancelUpload(request);
    if (error instanceof UploadError) {
      response = NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    } else if (error instanceof RequestBudgetExceeded) {
      response = NextResponse.json(
        { error: 'Upload capacity exceeded; retry later' },
        {
          status: 429,
          headers: { 'Retry-After': String(error.retryAfter) },
        },
      );
    } else response = apiErrorResponse(error, 'POST /api/projects');
  } finally {
    release?.();
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function DELETE(request: Request) {
  try {
    await requireRole(request, PROJECT_DELETE_ROLES);
    const id = new URL(request.url).searchParams.get('id');
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Project ID must be a valid UUID' },
        { status: 400 },
      );
    }

    const deleted = await getDatabaseRepositories().projects.deleteById(id);
    if (!deleted)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'DELETE /api/projects');
  }
}
