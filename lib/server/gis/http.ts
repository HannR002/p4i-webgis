import 'server-only';
import { NextResponse } from 'next/server';
import { GisInputError } from '../../gis/validation';
import { GisPermissionError } from '../../gis/recipe';
import { apiErrorResponse } from '../http';
export function gisError(error: unknown): NextResponse {
  if (error instanceof GisInputError)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof GisPermissionError)
    return NextResponse.json({ error: error.message }, { status: 403 });
  return apiErrorResponse(error, 'GIS request');
}
export async function readGisBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        await reader.cancel();
        throw new GisInputError('Permintaan GIS terlalu besar');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new GisInputError('JSON tidak valid');
  }
}
