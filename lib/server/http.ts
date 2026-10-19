import 'server-only';

import { NextResponse } from 'next/server';
import { AuthorizationError } from './auth';
import { FloodInputError } from '../../config/floodRiskModel';

export class RequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestInputError';
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function apiErrorResponse(
  error: unknown,
  context: string,
): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof FloodInputError || error instanceof RequestInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Upstream errors may embed credentials, provider URLs or confidential payloads.
  console.error(context, { code: 'UNEXPECTED_SERVER_ERROR' });
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let body = '',
    bytes = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65_536) {
        await reader.cancel();
        throw new RequestInputError('JSON request exceeds 64 KiB');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestInputError('Request body must be valid JSON');
  }
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
