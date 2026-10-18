import { NextResponse } from 'next/server';
import { getRequestAccessToken } from '../../../../lib/server/auth';
import {
  getLocalVectorRepository,
  localVectorEndpoint,
} from '../../../../lib/server/database/vector/local';
import { VectorStorageError } from '../../../../lib/server/database/vector/repository';
import { readGisBody, gisError } from '../../../../lib/server/gis/http';
import { requireHumanOrigin } from '../../../../lib/server/compute/access';
import { parseVectorSave } from '../../../../lib/gis/vectorPersistence';
export const runtime = 'nodejs';
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization',
};
function error(e: unknown) {
  if (e instanceof VectorStorageError)
    return NextResponse.json(
      { error: e.message },
      { status: e.status, headers },
    );
  return gisError(e);
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      operation = url.searchParams.get('operation') ?? 'capabilities';
    if (operation === 'capabilities' && !localVectorEndpoint())
      return NextResponse.json(
        { available: false, mode: 'unavailable', projects: [] },
        { headers },
      );
    const repo = getLocalVectorRepository(getRequestAccessToken(request));
    const projectId = url.searchParams.get('projectId') ?? '',
      layerId = url.searchParams.get('layerId') ?? '';
    if (operation === 'capabilities')
      return NextResponse.json(
        {
          available: true,
          mode: 'LOCAL_POSTGIS_SYNTHETIC_ONLY',
          projects: await repo.listProjects(),
        },
        { headers },
      );
    if (operation === 'layers')
      return NextResponse.json(await repo.listLayers(projectId), { headers });
    if (operation === 'load')
      return NextResponse.json(await repo.readLayer(projectId, layerId), {
        headers,
      });
    if (operation === 'revisions')
      return NextResponse.json(await repo.revisions(projectId, layerId), {
        headers,
      });
    throw new VectorStorageError(400, 'Operasi penyimpanan tidak valid');
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    requireHumanOrigin(request);
    const token = getRequestAccessToken(request);
    if (!token)
      throw new VectorStorageError(
        401,
        'Autentikasi diperlukan untuk menyimpan ke proyek',
      );
    const input = parseVectorSave(await readGisBody(request));
    const result = await getLocalVectorRepository(token).saveLayer(input);
    return NextResponse.json(result, { headers });
  } catch (e) {
    return error(e);
  }
}
