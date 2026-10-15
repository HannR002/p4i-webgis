import { NextResponse } from 'next/server';
import { getGisProvider } from '../../../../../lib/server/gis';
import { getGisContext } from '../../../../../lib/server/gis/context';
import { canAccessDataset, GisPermissionError } from '../../../../../lib/gis/recipe';
import { GisInputError } from '../../../../../lib/gis/validation';
import { gisError } from '../../../../../lib/server/gis/http';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = getGisProvider();
    const c = p.catalog();
    const d = c.find((d) => d.id === id);
    if (!d) throw new GisInputError('Dataset tidak dikenal');
    if (!canAccessDataset(d, await getGisContext(request, c)))
      throw new GisPermissionError('Akses dataset ditolak');
    const result = p.vector(id);
    return NextResponse.json(result.status === 'ok' ? result.data : result, {
      status: result.status === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return gisError(e);
  }
}
