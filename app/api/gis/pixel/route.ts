import { NextResponse } from 'next/server';
import { getGisProvider } from '../../../../lib/server/gis';
import { coordinates, record, GisInputError } from '../../../../lib/gis/validation';
import { canAccessDataset, GisPermissionError } from '../../../../lib/gis/recipe';
import { getGisContext } from '../../../../lib/server/gis/context';
import { gisError, readGisBody } from '../../../../lib/server/gis/http';
export async function POST(request: Request) {
  try {
    const body = await readGisBody(request);
    if (
      !record(body) ||
      !coordinates([body.latitude, body.longitude]) ||
      !Array.isArray(body.datasetIds) ||
      body.datasetIds.length > 8 ||
      !body.datasetIds.length ||
      !body.datasetIds.every((id) => typeof id === 'string')
    )
      throw new GisInputError('Permintaan sampling tidak valid');
    const provider = getGisProvider();
    const catalog = provider.catalog();
    const context = await getGisContext(request, catalog);
    const samples = [];
    for (const id of new Set(body.datasetIds)) {
      const d = catalog.find((d) => d.id === id);
      if (!d) throw new GisInputError('Dataset tidak dikenal');
      if (!canAccessDataset(d, context)) throw new GisPermissionError('Akses dataset ditolak');
      const result = provider.sample(id, Number(body.latitude), Number(body.longitude));
      if (result.status === 'unavailable') return NextResponse.json(result, { status: 503 });
      samples.push(result.data);
    }
    return NextResponse.json({ samples }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return gisError(e);
  }
}
