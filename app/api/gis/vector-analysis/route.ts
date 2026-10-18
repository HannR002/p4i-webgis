import {
  vectorAnalysisBudget,
  RequestBudgetExceeded,
} from '../../../../lib/server/requestBudget';
import { NextResponse } from 'next/server';
import { getRequestAccessToken } from '../../../../lib/server/auth';
import {
  getLocalVectorAnalysis,
  estimateLocalVectorAnalysis,
} from '../../../../lib/server/database/vector/analysis';
import { VectorStorageError } from '../../../../lib/server/database/vector/repository';
import { requireHumanOrigin } from '../../../../lib/server/compute/access';
import { readGisBody, gisError } from '../../../../lib/server/gis/http';
import { parseVectorAnalysisRequest } from '../../../../lib/gis/vectorAnalysis';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    release = vectorAnalysisBudget.acquire();
    requireHumanOrigin(request);
    const repository = getLocalVectorAnalysis(getRequestAccessToken(request));
    const input = parseVectorAnalysisRequest(await readGisBody(request));
    const result =
      new URL(request.url).searchParams.get('preview') === 'true'
        ? await estimateLocalVectorAnalysis(
            getRequestAccessToken(request),
            input,
          )
        : await repository.execute(input);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie, Authorization',
      },
    });
  } catch (e) {
    if (e instanceof RequestBudgetExceeded)
      return NextResponse.json(
        { error: e.message },
        {
          status: 429,
          headers: {
            'Retry-After': String(e.retryAfter),
            'Cache-Control': 'private, no-store',
          },
        },
      );
    if (e instanceof VectorStorageError)
      return NextResponse.json(
        { error: e.message },
        { status: e.status, headers: { 'Cache-Control': 'private, no-store' } },
      );
    return gisError(e);
  } finally {
    release?.();
  }
}
