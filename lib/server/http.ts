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

export function apiErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof FloodInputError || error instanceof RequestInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(context, error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json() as unknown;
  } catch {
    throw new RequestInputError('Request body must be valid JSON');
  }
}

export async function readFormDataBody(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new RequestInputError('Request body must be valid multipart form data');
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
