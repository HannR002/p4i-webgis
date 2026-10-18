import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  endpoint: vi.fn(),
  save: vi.fn(),
  projects: vi.fn(),
}));
vi.mock('../lib/server/database/vector/local', () => ({
  getLocalVectorRepository: mocks.get,
  localVectorEndpoint: mocks.endpoint,
}));
import { GET, POST } from '../app/api/gis/vector-storage/route';
import { DEFAULT_SKETCH_STYLE } from '../lib/gis/vectorEditing';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const body = () => ({
  projectId: id,
  layerId: null,
  expectedRevision: 0,
  requestId: id,
  archive: false,
  layer: {
    id: 'local-vector-1',
    name: 'Local',
    visible: true,
    opacity: 1,
    style: DEFAULT_SKETCH_STYLE,
    data: { type: 'FeatureCollection', features: [] },
  },
});
const request = (
  input: unknown = body(),
  headers: Record<string, string> = {},
) =>
  new Request('http://localhost/api/gis/vector-storage', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      Authorization: 'Bearer synthetic-user',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.endpoint.mockReturnValue('http://127.0.0.1:3333');
  mocks.get.mockReturnValue({
    saveLayer: mocks.save,
    listProjects: mocks.projects,
  });
  mocks.save.mockResolvedValue({ id, revision: 1 });
  mocks.projects.mockResolvedValue([]);
});
describe('human-only vector storage endpoint', () => {
  it('default unavailable capability does not resolve a database or credentials', async () => {
    mocks.endpoint.mockReturnValue(null);
    const r = await GET(new Request('http://localhost/api/gis/vector-storage'));
    expect(await r.json()).toEqual({
      available: false,
      mode: 'unavailable',
      projects: [],
    });
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('rejects cross-origin save before database access', async () => {
    expect(
      (await POST(request(body(), { Origin: 'https://other.invalid' }))).status,
    ).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('requires authenticated user token even when a project ID is supplied', async () => {
    expect((await POST(request(body(), { Authorization: '' }))).status).toBe(
      401,
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('passes only validated geometry and revision to the repository with trusted request token', async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith('synthetic-user');
    expect(mocks.save).toHaveBeenCalledWith(body());
    expect(r.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects forged role, oversized uploads and unavailable operations', async () => {
    expect(
      (await POST(request({ ...body(), role: 'super_admin' }))).status,
    ).toBe(400);
    expect(
      (await POST(request({ ...body(), notes: 'x'.repeat(65536) }))).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new Request('http://localhost/api/gis/vector-storage?operation=sql'),
        )
      ).status,
    ).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
