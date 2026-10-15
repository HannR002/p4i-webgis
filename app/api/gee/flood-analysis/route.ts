import {
  ExternalIntegrationPendingError,
  requireGovernedEarthEngine,
} from '../../../../lib/server/integration/readiness';
import { NextResponse } from 'next/server';
import { APP_ROLES } from '../../../../lib/authRoles';
import { parseFloodAnalysisInput } from '../../../../config/floodRiskModel';
import { requireRole } from '../../../../lib/server/auth';
import {
  FloodAnalysisServiceError,
  analyzeFloodRisk,
} from '../../../../lib/server/floodAnalysis';
import { apiErrorResponse, readJsonBody } from '../../../../lib/server/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new FloodAnalysisServiceError('Flood analysis timed out')),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function POST(request: Request) {
  try {
    const identity = await requireRole(request, APP_ROLES);
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415 },
      );
    }
    const input = parseFloodAnalysisInput(await readJsonBody(request));
    requireGovernedEarthEngine();
    const result = await withTimeout(
      analyzeFloodRisk(input, identity.user.id),
      55_000,
    );
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: unknown) {
    if (error instanceof ExternalIntegrationPendingError)
      return NextResponse.json(
        { status: 'unavailable', error: error.message },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    if (error instanceof FloodAnalysisServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return apiErrorResponse(error, 'POST /api/gee/flood-analysis');
  }
}
