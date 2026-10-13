import { NextResponse } from 'next/server';
import { getGisContext } from '../../../../lib/server/gis/context';
import { gisError, readGisBody } from '../../../../lib/server/gis/http';
import { parseProcessingResult } from '../../../../lib/gis/processingValidation';
import {
  getRasterProvider,
  RasterProviderError,
} from '../../../../lib/server/gis/rasterProvider';
import { authorizeRasterOperands } from '../../../../lib/server/gis/rasterAccess';
import {
  operationDatasetIds,
  parseRasterOperation,
} from '../../../../lib/gis/rasterValidation';
export const runtime = 'nodejs';
export const maxDuration = 15;
export async function POST(request: Request) {
  try {
    const operation = parseRasterOperation(await readGisBody(request));
    const provider = getRasterProvider(),
      catalog = provider.catalog();
    authorizeRasterOperands(
      catalog,
      await getGisContext(request, catalog),
      operationDatasetIds(operation).map((datasetId) => ({ datasetId })),
    );
    const raw = await provider.execute(operation);
    let result;
    try {
      result = parseProcessingResult(raw);
    } catch {
      throw new RasterProviderError('Respons proses raster tidak valid');
    }
    return NextResponse.json(result, {
      status: result.status === 'unavailable' ? 503 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return gisError(error);
  }
}
