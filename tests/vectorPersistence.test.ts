import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  localVectorEndpoint,
  getLocalVectorRepository,
} from '../lib/server/database/vector/local';
import { createVectorRepository } from '../lib/server/database/vector/repository';
import {
  parseVectorSave,
  parseVectorDocument,
  vectorLayerFingerprint,
} from '../lib/gis/vectorPersistence';
import { saveLocalWorkspaceDraft } from '../lib/gis/workspaceDraft';
import { emptyRecipe } from '../lib/gis/catalog';
import { applyMapAction } from '../lib/gis/recipe';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { DEFAULT_SKETCH_STYLE } from '../lib/gis/vectorEditing';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  feature = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const layer = {
  id: 'local-vector-1',
  name: 'Synthetic',
  visible: true,
  opacity: 1,
  style: DEFAULT_SKETCH_STYLE,
  data: { type: 'FeatureCollection' as const, features: [] },
};
const input = () => ({
  projectId: id,
  layerId: null,
  expectedRevision: 0,
  requestId: feature,
  layer,
  archive: false,
});
const doc = () => ({
  id,
  projectId: id,
  revision: 1,
  canEdit: true,
  archived: false,
  createdAt: '2026-10-18T00:00:00Z',
  updatedAt: '2026-10-18T00:00:00Z',
  updatedBy: feature,
  layer,
  features: [],
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('vector persistence boundaries and explicit revision contracts', () => {
  it.each([
    {},
    {
      NODE_ENV: 'production',
      VECTOR_STORAGE_MODE: 'local-postgis',
      VECTOR_STORAGE_LOCAL_ACK: 'synthetic-only',
      VECTOR_STORAGE_LOCAL_URL: 'http://127.0.0.1:3333',
    },
    { VECTOR_STORAGE_MODE: 'supabase' },
    {
      VECTOR_STORAGE_MODE: 'local-postgis',
      VECTOR_STORAGE_LOCAL_ACK: 'unknown',
      VECTOR_STORAGE_LOCAL_URL: 'http://127.0.0.1:3333',
    },
    ...[
      'https://127.0.0.1:3333',
      'http://example.com:3333',
      'http://localhost:3333',
      'http://127.0.0.1:3333/private',
      'http://user:secret@127.0.0.1:3333',
      'http://127.0.0.1:3333/?redirect=external',
    ].map((VECTOR_STORAGE_LOCAL_URL) => ({
      NODE_ENV: 'development',
      VECTOR_STORAGE_MODE: 'local-postgis',
      VECTOR_STORAGE_LOCAL_ACK: 'synthetic-only',
      VECTOR_STORAGE_LOCAL_URL,
    })),
  ])(
    'fails closed for unavailable, production or non-loopback configuration %#',
    (env) => expect(localVectorEndpoint(env)).toBeNull(),
  );
  it('accepts only acknowledged local development endpoint', () =>
    expect(
      localVectorEndpoint({
        NODE_ENV: 'development',
        VECTOR_STORAGE_MODE: 'local-postgis',
        VECTOR_STORAGE_LOCAL_ACK: 'synthetic-only',
        VECTOR_STORAGE_LOCAL_URL: 'http://127.0.0.1:3333',
      }),
    ).toBe('http://127.0.0.1:3333'));
  it.each([
    { role: 'super_admin' },
    { ownerId: feature },
    { expectedRevision: -1 },
    { expectedRevision: 1.2 },
    { layerId: feature, expectedRevision: NaN },
    { layerId: 'local-vector-1' },
    { projectId: 'private-project' },
    { requestId: 'missing' },
    { archive: true },
  ])('rejects forged authority and malformed version/identity %#', (change) =>
    expect(() => parseVectorSave({ ...input(), ...change })).toThrow(),
  );
  it('compares JSONB snapshots independently of object key ordering', () => {
    expect(vectorLayerFingerprint(layer)).toBe(
      vectorLayerFingerprint({
        ...layer,
        style: {
          radius: 7,
          weight: 2,
          fillOpacity: 0.6,
          fillColor: '#5eead4',
          color: '#0f766e',
        },
      }),
    );
  });
  it('round-trips a validated document and rejects invalid trusted feature mapping', () => {
    expect(parseVectorDocument(JSON.parse(JSON.stringify(doc())))).toEqual(
      doc(),
    );
    expect(() =>
      parseVectorDocument({
        ...doc(),
        features: [{ id: feature, localId: 'local-feature-1', revision: 1 }],
      }),
    ).toThrow();
  });
  it('calls only domain RPC operations and validates provider responses', async () => {
    const rpc = vi.fn(async () => doc()),
      repo = createVectorRepository(rpc);
    expect(await repo.saveLayer(input())).toEqual(doc());
    expect(rpc).toHaveBeenCalledWith('save', input());
    rpc.mockResolvedValueOnce({ ...doc(), canEdit: 'yes' } as never);
    await expect(repo.readLayer(id, id)).rejects.toThrow();
  });
  it('default configuration never calls fetch and never uses Supabase/GEE credentials', () => {
    vi.stubEnv('VECTOR_STORAGE_MODE', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-ignored');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(() => getLocalVectorRepository(null)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('redacts SQL/provider errors and preserves explicit conflicts without fallback', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VECTOR_STORAGE_MODE', 'local-postgis');
    vi.stubEnv('VECTOR_STORAGE_LOCAL_ACK', 'synthetic-only');
    vi.stubEnv('VECTOR_STORAGE_LOCAL_URL', 'http://127.0.0.1:3333');
    const fetcher = vi.fn(async () =>
      Response.json(
        { code: 'PT409', message: 'SECRET SQL DETAILS' },
        { status: 409 },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      getLocalVectorRepository('synthetic-token').saveLayer(input()),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.not.stringContaining('SECRET'),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('explicit local save refuses unfinished/oversize drafts without storage writes', () => {
    const setItem = vi.fn();
    expect(() =>
      saveLocalWorkspaceDraft(emptyRecipe(), true, { setItem }),
    ).toThrow();
    expect(() =>
      saveLocalWorkspaceDraft(
        { ...emptyRecipe(), description: 'a'.repeat(65536) },
        false,
        { setItem },
      ),
    ).toThrow();
    expect(setItem).not.toHaveBeenCalled();
    saveLocalWorkspaceDraft(emptyRecipe(), false, { setItem });
    expect(setItem).toHaveBeenCalledWith(
      'p4i-map-draft-v1',
      JSON.stringify(emptyRecipe()),
    );
  });
  it('keeps persistence metadata outside MapRecipe, detaches local import/new map, and never persists on Undo', () => {
    const store = useWorkspaceStore;
    store.setState({
      recipe: { ...emptyRecipe(), sketchLayers: [layer] },
      catalog: [],
      context: { role: 'guest', entitledProjectIds: [] },
      past: [],
      future: [],
      vectorEdit: null,
      vectorProjectBinding: doc(),
    });
    const s = store.getState(),
      storage = vi.fn(),
      fetcher = vi.fn();
    vi.stubGlobal('localStorage', { setItem: storage });
    vi.stubGlobal('fetch', fetcher);
    s.action({ tool: 'updateVectorLayer', layerId: layer.id, name: 'Changed' });
    expect(store.getState().vectorProjectBinding?.revision).toBe(1);
    s.undo();
    expect(store.getState().vectorProjectBinding?.revision).toBe(1);
    expect(storage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    s.replace(
      { ...emptyRecipe(), sketchLayers: [layer] },
      'Impor resep tervalidasi',
    );
    expect(store.getState().vectorProjectBinding).toBeNull();
    s.setVectorProjectBinding(doc());
    s.action({ tool: 'createMap', title: 'Fresh' });
    expect(store.getState().vectorProjectBinding).toBeNull();
    expect(
      'vectorProjectBinding' in
        applyMapAction(
          emptyRecipe(),
          { tool: 'createVectorLayer', name: 'New' },
          [],
          { role: 'guest', entitledProjectIds: [] },
        ),
    ).toBe(false);
  });
});
