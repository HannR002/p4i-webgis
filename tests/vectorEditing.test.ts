import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { emptyRecipe } from '../lib/gis/catalog';
import { applyMapAction, executeMapPlan } from '../lib/gis/recipe';
import { parseRecipe } from '../lib/gis/validation';
import {
  DEFAULT_SKETCH_STYLE,
  polygonGeometry,
  parseVectorAction,
} from '../lib/gis/vectorEditing';
import { createControlledDemoProvider } from '../lib/server/ai/providers/controlledDemo';
import {
  executeGISPlan,
  planWithProvider,
  planningInput,
} from '../lib/server/ai/execution';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { getRasterProvider } from '../lib/server/gis/rasterProvider';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { MapRecipe, MapAction } from '../lib/gis/contracts';
const gis = createDemoGisProvider(),
  context = { role: 'guest' as const, entitledProjectIds: [] };
const env = {
  catalog: gis.catalog(),
  context,
  mode: 'demo' as const,
  configurations: [],
  raster: getRasterProvider(gis),
  signal: new AbortController().signal,
};
const layerId = 'local-vector-1';
const apply = (r: MapRecipe, a: unknown) =>
  applyMapAction(r, a, env.catalog, context);
const base = () =>
  apply(emptyRecipe(), { tool: 'createVectorLayer', name: 'Survei' });
const points = () =>
  apply(base(), {
    tool: 'createMultiplePoints',
    layerId,
    points: [
      { name: 'A', coordinates: [103.61, -1.61] },
      { name: 'B', coordinates: [103.62, -1.61] },
      { name: 'C', coordinates: [103.62, -1.62] },
      { name: 'D', coordinates: [103.61, -1.62] },
    ],
  });
describe('bounded MapRecipe vector editing', () => {
  it('creates a map and multiple GeoJSON points without modifying its input', () => {
    const input = base(),
      r = points();
    expect(input.sketchLayers![0].data.features).toHaveLength(0);
    expect(r.sketchLayers![0].data.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [103.61, -1.61],
    });
    expect(
      apply(r, { tool: 'createMap', title: 'New' }).sketchLayers,
    ).toBeUndefined();
  });
  it.each([
    [NaN, 0],
    [0, Infinity],
    [181, 0],
    [0, 91],
    ['103', -1],
    [0, 0, 2],
  ])('rejects invalid coordinates %j', (...coordinates) => {
    expect(() =>
      apply(base(), { tool: 'createPoint', layerId, name: 'Bad', coordinates }),
    ).toThrow();
  });
  it('closes polygons and resolves actual selected points in explicit order', () => {
    const r = apply(points(), {
      tool: 'createPolygonFromSelectedPoints',
      layerId,
      name: 'Area',
      pointIds: [
        'local-feature-1',
        'local-feature-2',
        'local-feature-3',
        'local-feature-4',
      ],
    });
    expect(r.sketchLayers![0].data.features[4].geometry).toEqual(
      polygonGeometry([
        [103.61, -1.61],
        [103.62, -1.61],
        [103.62, -1.62],
        [103.61, -1.62],
      ]),
    );
    expect(() =>
      apply(r, {
        tool: 'createPolygonFromSelectedPoints',
        layerId,
        name: 'Bad',
        pointIds: ['local-feature-1', 'local-feature-5', 'absent'],
      }),
    ).toThrow();
  });
  it.each(
    [
      [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ],
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 0],
      ],
      [
        [179, 0],
        [-179, 1],
        [179, 2],
      ],
    ].map((vertices) => [vertices]),
  )(
    'rejects intersecting/degenerate/ambiguous dateline rings %j',
    (vertices) => {
      expect(() => polygonGeometry(vertices)).toThrow();
    },
  );
  it('rejects geometry complexity, hidden properties and forged IDs', () => {
    expect(() =>
      polygonGeometry(Array.from({ length: 130 }, (_, i) => [i, 0])),
    ).toThrow();
    expect(() =>
      parseVectorAction({
        tool: 'createVectorLayer',
        name: 'A',
        id: 'trusted',
      }),
    ).toThrow();
    expect(() =>
      parseVectorAction({
        tool: 'createPoint',
        layerId,
        name: 'A',
        coordinates: [0, 0],
        projectId: 'private',
      }),
    ).toThrow();
    expect(() =>
      apply(points(), {
        tool: 'updateFeatureProperties',
        layerId,
        featureId: 'local-feature-1',
        name: 'A',
        description: '',
        attributes: { constructor: 'attack' },
      }),
    ).toThrow();
  });
  it('edits vertices, style, properties, visibility and order, then serializes/reloads losslessly', () => {
    let r = apply(points(), {
      tool: 'createPolygon',
      layerId,
      name: 'Area',
      vertices: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    });
    r = apply(r, {
      tool: 'updateFeatureGeometry',
      layerId,
      featureId: 'local-feature-5',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
          ],
        ],
      },
    });
    r = apply(r, {
      tool: 'styleFeature',
      layerId,
      featureId: 'local-feature-1',
      style: { ...DEFAULT_SKETCH_STYLE, color: '#dc2626' },
    });
    r = apply(r, {
      tool: 'updateFeatureProperties',
      layerId,
      featureId: 'local-feature-1',
      name: 'Renamed',
      description: 'Synthetic',
      attributes: { sample: 1 },
    });
    r = apply(r, {
      tool: 'updateVectorLayer',
      layerId,
      name: 'Renamed layer',
      visible: false,
      opacity: 0.4,
    });
    expect(parseRecipe(JSON.parse(JSON.stringify(r)), env.catalog)).toEqual(r);
    expect(r.sketchLayers![0].data.features[0].properties.name).toBe('Renamed');
  });
  it('deletes with store Undo/Redo and atomically refuses an invalid last action', () => {
    const r = points();
    useWorkspaceStore.setState({
      recipe: r,
      catalog: [...env.catalog],
      context,
      past: [],
      future: [],
    });
    useWorkspaceStore
      .getState()
      .action({ tool: 'deleteFeature', layerId, featureId: 'local-feature-1' });
    expect(
      useWorkspaceStore.getState().recipe.sketchLayers![0].data.features,
    ).toHaveLength(3);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().recipe).toEqual(r);
    useWorkspaceStore.getState().redo();
    expect(
      useWorkspaceStore.getState().recipe.sketchLayers![0].data.features,
    ).toHaveLength(3);
    expect(() =>
      executeMapPlan(
        r,
        [
          { tool: 'setMapTitle', title: 'partial' },
          { tool: 'deleteFeature', layerId, featureId: 'absent' },
        ],
        env.catalog,
        context,
      ),
    ).toThrow();
    expect(r.title).not.toBe('partial');
  });
  it('preserves restricted dataset authorization before local geometry edits', () => {
    const restricted = {
      ...env.catalog.find((d) => d.type === 'vector')!,
      id: 'private',
      projectId: 'other',
      accessTier: 'restricted' as const,
    };
    const r = {
      ...points(),
      layers: [
        {
          id: 'private-layer',
          datasetId: 'private',
          type: restricted.type,
          visible: true,
          opacity: 1,
          style: { color: '#123456', fillColor: '#123456', weight: 2 },
        },
      ],
    };
    expect(() =>
      applyMapAction(
        r,
        { tool: 'createVectorLayer', name: 'A' },
        [...env.catalog, restricted],
        context,
      ),
    ).toThrow();
  });
  it('bounds object and layer counts, rejects layer spoofing', () => {
    let r = base();
    for (let i = 0; i < 7; i++)
      r = apply(r, { tool: 'createVectorLayer', name: `L${i}` });
    expect(() =>
      apply(r, { tool: 'createVectorLayer', name: 'too many' }),
    ).toThrow();
    expect(() =>
      apply(base(), {
        tool: 'createPoint',
        layerId: 'project-layer',
        name: 'A',
        coordinates: [0, 0],
      }),
    ).toThrow();
    let p = base();
    const batch = Array.from({ length: 50 }, (_, i) => ({
      name: `A${i}`,
      coordinates: [0, 0],
    }));
    p = apply(p, { tool: 'createMultiplePoints', layerId, points: batch });
    p = apply(p, { tool: 'createMultiplePoints', layerId, points: batch });
    expect(() =>
      apply(p, {
        tool: 'createPoint',
        layerId,
        name: 'Overflow',
        coordinates: [0, 0],
      }),
    ).toThrow();
  });
});
describe('Indonesian planner uses existing server registry and atomic executor', () => {
  const provider = createControlledDemoProvider();
  async function run(
    prompt: string,
    recipe = emptyRecipe(),
    selectedVectorIds?: string[],
  ) {
    const p = await planWithProvider(provider, {
      ...planningInput(prompt, recipe, env),
      selectedVectorIds,
    });
    return executeGISPlan(p, recipe, env);
  }
  it('supports the requested map, point, multiple points and green polygon examples', async () => {
    let r = await run(
      'Buatkan peta baru bernama Survei Lapangan dan gunakan OpenStreetMap.',
    );
    expect(r.recipe.title).toBe('Survei Lapangan');
    expect(r.recipe.basemap).toBe('osm');
    r = await run(
      'Tambahkan titik A pada longitude 103.61 dan latitude -1.61, warna merah.',
      r.recipe,
    );
    expect(
      r.recipe.sketchLayers![0].data.features[0].properties.style?.color,
    ).toBe('#dc2626');
    r = await run(
      'Tambahkan titik B [103.62, -1.61]; C [103.62, -1.62]; D [103.61, -1.62]',
      r.recipe,
    );
    expect(r.recipe.sketchLayers![0].data.features).toHaveLength(4);
    r = await run(
      'Buat poligon dari titik A, B, C, dan D. Beri warna hijau dengan transparansi 40%.',
      r.recipe,
    );
    expect(r.status).toBe('completed');
    expect(
      r.recipe.sketchLayers![0].data.features[4].properties.style?.fillOpacity,
    ).toBe(0.6);
  });
  it('asks for missing coordinates and ambiguous names; never fabricates a location', async () => {
    expect((await run('Tambahkan titik A')).status).toBe('needs-input');
    const r = apply(points(), {
      tool: 'createPoint',
      layerId,
      name: 'A',
      coordinates: [0, 0],
    });
    const result = await run('Buat poligon dari titik A, B, C', r);
    expect(result.status).toBe('needs-input');
    expect(result.changed).toBe(false);
  });
  it('supports actual selected points, geometry edits, renames, styling and delete', async () => {
    let r = await run('Buat poligon dari titik terpilih', points(), [
      'local-feature-1',
      'local-feature-2',
      'local-feature-3',
    ]);
    expect(r.recipe.sketchLayers![0].data.features).toHaveLength(5);
    r = await run('Ubah titik A menjadi Z', r.recipe);
    r = await run('Ubah titik Z longitude 103.60 dan latitude -1.60', r.recipe);
    r = await run('Ubah titik Z warna biru', r.recipe);
    expect(r.recipe.sketchLayers![0].data.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [103.6, -1.6],
    });
    r = await run('Hapus titik Z', r.recipe);
    expect(r.recipe.sketchLayers![0].data.features).toHaveLength(4);
  });
  it('requires separate local-save confirmation and preserves preview without state mutation', async () => {
    const r = await run('Simpan peta');
    expect(r.status).toBe('needs-input');
    const p = await planWithProvider(
      provider,
      planningInput('Tambahkan titik A [0,0]', emptyRecipe(), env),
    );
    const preview = await executeGISPlan(p, emptyRecipe(), env, 'preview');
    expect(preview.recipe).toEqual(emptyRecipe());
    expect(preview.changed).toBe(false);
  });
  it('rejects a forged creation plan before applying any action', async () => {
    const actions = [
      { tool: 'createVectorLayer', name: 'A', id: 'trusted' },
    ] as unknown as MapAction[];
    await expect(
      executeGISPlan(
        {
          schemaVersion: 1,
          id: 'bad',
          provider: { id: provider.id, mode: provider.mode },
          intent: 'build-map',
          resolution: 'ready',
          message: 'bad',
          steps: actions.map((action, i) => ({ id: String(i), action })),
          limitations: [],
        },
        emptyRecipe(),
        env,
      ),
    ).rejects.toThrow();
  });
});
