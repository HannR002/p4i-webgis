import 'server-only';
import { NextResponse } from 'next/server';
import { GisInputError } from '../../gis/validation';
import { GisPermissionError } from '../../gis/recipe';
import { apiErrorResponse, readJsonBody, RequestInputError } from '../http';
import { RasterProviderError } from './rasterProvider';
export function gisError(error: unknown): NextResponse {
  if (error instanceof RasterProviderError)
    return NextResponse.json(
      { error: 'Provider raster gagal atau respons tidak valid. Coba lagi.' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    );
  if (error instanceof GisInputError)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof GisPermissionError)
    return NextResponse.json({ error: error.message }, { status: 403 });
  return apiErrorResponse(error, 'GIS request');
}
export async function readGisBody(request: Request): Promise<unknown> {
  try {
    return await readJsonBody(request);
  } catch (error) {
    // Preserve existing GIS validation messages; timeout/abort use shared HTTP errors.
    if (error instanceof RequestInputError) {
      if (error.code === 'size') throw new GisInputError('Permintaan GIS terlalu besar');
      if (error.code === 'invalid') throw new GisInputError('JSON tidak valid');
    }
    throw error;
  }
}
