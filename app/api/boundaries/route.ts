import {
  RequestBudgetExceeded,
  requestBudgets,
} from '../../../lib/server/requestBudget';
import { NextResponse } from 'next/server';
import { parseBoundaryViewport } from '../../../lib/server/boundaryViewport';
import { getDatabaseRepositories } from '../../../lib/server/database';
import { apiErrorResponse } from '../../../lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  let release: (() => void) | undefined;
  try {
    release = requestBudgets.boundaries.acquire();
    const viewport = parseBoundaryViewport(new URL(request.url).searchParams);
    if (!viewport) {
      return NextResponse.json(
        { error: 'Invalid boundary viewport' },
        { status: 400 },
      );
    }

    const rows =
      await getDatabaseRepositories().boundaries.listInViewport(viewport);
    return NextResponse.json(rows, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error: unknown) {
    if (error instanceof RequestBudgetExceeded)
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: {
            'Retry-After': String(error.retryAfter),
            'Cache-Control': 'private, no-store',
          },
        },
      );
    return apiErrorResponse(error, 'GET /api/boundaries');
  } finally {
    release?.();
  }
}
