import { beforeEach, describe, expect, it, vi } from 'vitest';

const { analyzeFloodRisk } = vi.hoisted(() => ({
  analyzeFloodRisk: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../lib/server/auth', () => ({
  requireRole: vi.fn(async () => ({
    user: { id: '123e4567-e89b-42d3-a456-426614174001' },
    role: 'b2b_client',
  })),
}));
vi.mock('../lib/server/floodAnalysis', () => {
  class FloodAnalysisServiceError extends Error {
    status: 404 | 503;

    constructor(message: string, status: 404 | 503 = 503) {
      super(message);
      this.status = status;
    }
  }
  return { analyzeFloodRisk, FloodAnalysisServiceError };
});
vi.mock('../lib/server/http', () => ({
  apiErrorResponse: (error: unknown) => Response.json(
    { error: error instanceof Error ? error.message : 'Internal Server Error' },
    { status: 400 },
  ),
  readJsonBody: async (request: Request) => request.json() as Promise<unknown>,
}));

import { POST } from '../app/api/gee/flood-analysis/route';

describe('POST /api/gee/flood-analysis error paths', () => {
  beforeEach(() => analyzeFloodRisk.mockReset());

  it('rejects a non-JSON request', async () => {
    const response = await POST(new Request('http://localhost/api/gee/flood-analysis', {
      method: 'POST',
      body: 'invalid',
    }));
    expect(response.status).toBe(415);
  });

  it('rejects an invalid kecamatan ID before computation', async () => {
    const response = await POST(new Request('http://localhost/api/gee/flood-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kecamatan_id: 'invalid' }),
    }));
    expect(response.status).toBe(400);
    expect(analyzeFloodRisk).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without invoking Earth Engine', async () => {
    const response = await POST(new Request('http://localhost/api/gee/flood-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }));
    expect(response.status).toBe(400);
    expect(analyzeFloodRisk).not.toHaveBeenCalled();
  });
});
