import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  get: vi.fn(),
  estimate: vi.fn(),
}));
vi.mock('../lib/server/database/vector/analysis', () => ({
  getLocalVectorAnalysis: mocks.get,
  estimateLocalVectorAnalysis: mocks.estimate,
}));
import { VectorStorageError } from '../lib/server/database/vector/repository';
import { POST } from '../app/api/gis/vector-analysis/route';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input = {
  operation: 'area',
  projectId: id,
  source: { layerId: id, revision: 1, featureIds: [id] },
  target: null,
  parameters: { unit: 'ha' },
};
const request = (
  body: unknown = input,
  headers: Record<string, string> = {},
  query = '',
) =>
  new Request('http://localhost/api/gis/vector-analysis' + query, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      Authorization: 'Bearer synthetic',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((token) => {
    if (!token) throw new VectorStorageError(401, 'Autentikasi diperlukan');
    return { execute: mocks.execute };
  });
  mocks.execute.mockResolvedValue({ engine: 'PostGIS' });
  mocks.estimate.mockResolvedValue({
    features: 1,
    vertices: 5,
    pairTests: 0,
    costClass: 'LOW_COST_ANALYSIS',
  });
});
it('rejects CSRF and missing authentication before any execution', async () => {
  expect(
    (await POST(request(input, { Origin: 'https://other.invalid' }))).status,
  ).toBe(403);
  expect((await POST(request(input, { Authorization: '' }))).status).toBe(401);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('rejects direct forged permissions, SQL, local IDs, and oversized bodies', async () => {
  for (const body of [
    { ...input, approved: true },
    { ...input, role: 'super_admin' },
    { ...input, sql: 'select 1' },
    { ...input, source: { ...input.source, featureIds: ['local-feature-1'] } },
    { ...input, padding: 'x'.repeat(65536) },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it('forwards current caller identity and validated references, with private no-store response', async () => {
  const r = await POST(request());
  expect(r.status).toBe(200);
  expect(mocks.get).toHaveBeenCalledWith('synthetic');
  expect(mocks.execute).toHaveBeenCalledWith(input);
  expect(r.headers.get('cache-control')).toContain('no-store');
});
it('estimation never invokes geometric execution, subsequent execution revalidates', async () => {
  expect((await POST(request(input, {}, '?preview=true'))).status).toBe(200);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.estimate).toHaveBeenCalledWith('synthetic', input);
  mocks.execute.mockRejectedValue(
    new VectorStorageError(409, 'Konflik revisi'),
  );
  expect((await POST(request())).status).toBe(409);
});
it('preserves bounded-timeout, concurrency, permission and unavailable errors', async () => {
  for (const status of [408, 429, 403, 503]) {
    mocks.execute.mockRejectedValueOnce(
      new VectorStorageError(status, 'Penolakan aman'),
    );
    expect((await POST(request())).status).toBe(status);
  }
});
