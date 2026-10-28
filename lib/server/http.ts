import 'server-only';

import { NextResponse } from 'next/server';
import { AuthorizationError } from './auth';
import { FloodInputError } from '../../config/floodRiskModel';

export class RequestInputError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'size' | 'timeout' | 'aborted' | 'stream' = 'invalid',
  ) {
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
    return NextResponse.json(
      { error: error.message },
      { status: error instanceof RequestInputError && error.code === 'timeout' ? 408 : 400 },
    );
  }

  // Upstream errors may embed credentials, provider URLs or confidential payloads.
  console.error(context, { code: 'UNEXPECTED_SERVER_ERROR' });
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}

// Total ingestion deadline, not a per-chunk idle timeout. Shared by GIS routes.
export const JSON_BODY_MAX_BYTES = 65_536;
export const JSON_BODY_DEADLINE_MS = 10_000;

export async function readJsonBody(request: Request): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  let interrupted: RequestInputError | undefined;
  let rejectBoundary!: (error: RequestInputError) => void;
  const boundary = new Promise<never>((_, reject) => { rejectBoundary = reject; });
  // An already-aborted request can reject before the ingestion race is attached.
  void boundary.catch(() => {});
  const interrupt = (error: RequestInputError) => {
    interrupted ??= error;
    rejectBoundary(interrupted);
  };
  const abort = () => interrupt(new RequestInputError('Request body was cancelled', 'aborted'));
  const timeout = () => interrupt(new RequestInputError('JSON body ingestion timed out', 'timeout'));
  const started = performance.now();
  const timer = setTimeout(timeout, JSON_BODY_DEADLINE_MS);
  request.signal.addEventListener('abort', abort, { once: true });
  const checkBoundary = () => {
    // Also bound a stream whose immediate reads starve timer callbacks.
    if (performance.now() - started >= JSON_BODY_DEADLINE_MS) timeout();
    if (interrupted) throw interrupted;
  };
  try {
    reader = request.body?.getReader();
    if (request.signal.aborted) abort();
    const consume = async () => {
      const decoder = new TextDecoder();
      let body = '', bytes = 0;
      checkBoundary();
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          checkBoundary();
          if (done) { complete = true; break; }
          bytes += value.byteLength;
          if (bytes > JSON_BODY_MAX_BYTES)
            throw new RequestInputError('JSON request exceeds 64 KiB', 'size');
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      }
      checkBoundary();
      try { return JSON.parse(body) as unknown; }
      catch { throw new RequestInputError('Request body must be valid JSON'); }
    };
    // One race for the entire body avoids accumulating a handler per input chunk.
    return await Promise.race([consume(), boundary]);
  } catch (error) {
    if (error instanceof RequestInputError) throw error;
    throw new RequestInputError('Request body could not be read', 'stream');
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    if (reader) {
      // Underlying cancel hooks may reject or never settle. Do not await them.
      if (!complete) {
        try { void reader.cancel().catch(() => {}); } catch { /* Best effort. */ }
      }
      // Releasing a pending read rejects it; the consume/race already observes it.
      try { reader.releaseLock(); } catch { /* No raw stream errors escape. */ }
    }
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
