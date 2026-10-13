import { NextResponse } from 'next/server';
import { getGisContext } from '../../../../lib/server/gis/context';
import { gisError, readGisBody } from '../../../../lib/server/gis/http';
import {
  getRasterProvider,
  checkedSample,
} from '../../../../lib/server/gis/rasterProvider';
import { authorizeRasterOperands } from '../../../../lib/server/gis/rasterAccess';
import { parsePixelQuery } from '../../../../lib/gis/rasterValidation';
export const runtime = 'nodejs';
export const maxDuration = 15;
export async function POST(request: Request) {
  try {
    const query = parsePixelQuery(await readGisBody(request));
    const provider = getRasterProvider(),
      catalog = provider.catalog();
    const context = await getGisContext(request, catalog);
    authorizeRasterOperands(
      catalog,
      context,
      query.datasetIds.map((datasetId) => ({
        datasetId,
        band: query.bands[datasetId],
      })),
    );
    const results = await Promise.all(
      query.datasetIds.map((datasetId) =>
        checkedSample(provider, {
          datasetId,
          band: query.bands[datasetId],
          coordinate: query.coordinate,
          resampling: query.resampling,
          signal: request.signal,
        }),
      ),
    );
    if (results.some((result) => result.status === 'unavailable'))
      return NextResponse.json(
        { status: 'unavailable', reason: 'Sumber raster belum tersedia' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    return NextResponse.json(
      {
        provider: provider.id,
        samples: results.flatMap((result) =>
          result.status === 'ok' ? [result.data] : [],
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return gisError(error);
  }
}
