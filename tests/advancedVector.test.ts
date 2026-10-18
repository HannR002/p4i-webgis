import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { emptyRecipe } from '../lib/gis/catalog';
import { applyMapAction, executeMapPlan } from '../lib/gis/recipe';
import { parseRecipe } from '../lib/gis/validation';
import {
  editVertex,
  geometryPaths,
  importGeoJSON,
  sketchGeometry,
  parseVectorAction,
  type SketchGeometry,
  type LonLat,
} from '../lib/gis/vectorEditing';
import { snapCoordinate } from '../lib/gis/vectorSnapping';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { getRasterProvider } from '../lib/server/gis/rasterProvider';
import { createControlledDemoProvider } from '../lib/server/ai/providers/controlledDemo';
import {
  executeGISPlan,
  planWithProvider,
  planningInput,
} from '../lib/server/ai/execution';
import type { MapRecipe } from '../lib/gis/contracts';
const context = { role: 'guest' as const, entitledProjectIds: [] };
const catalog = createDemoGisProvider().catalog(),
  layerId = 'local-vector-1';
const apply = (r: MapRecipe, a: unknown) =>
  applyMapAction(r, a, catalog, context);
const base = () =>
  apply(emptyRecipe(), { tool: 'createVectorLayer', name: 'Survei' });
const line: SketchGeometry = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [1, 1],
    [2, 1],
  ],
};
const square = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ],
  hole = [
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 1],
    [1, 1],
  ];
const polygon: SketchGeometry = {
  type: 'Polygon',
  coordinates: [square, hole],
};
const add = (g: SketchGeometry = line) =>
  apply(base(), { tool: 'createFeature', layerId, name: 'Jalur', geometry: g });
const featureId = 'local-feature-1';
const collection = (geometry: unknown = line) => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'source-1',
      geometry,
      properties: { name: 'Jalur', sample: 2, public: true },
    },
  ],
});
describe('Phase 14 geometry, import and atomic actions', () => {
  it.each<SketchGeometry>([
    line,
    {
      type: 'MultiLineString',
      coordinates: [
        line.coordinates as number[][],
        [
          [5, 5],
          [6, 5],
        ],
      ],
    },
    polygon,
    {
      type: 'MultiPolygon',
      coordinates: [
        polygon.coordinates as number[][][],
        [
          [
            [10, 10],
            [12, 10],
            [12, 12],
            [10, 10],
          ],
        ],
      ],
    },
  ])('round-trips $type with styles through recipe and GeoJSON', (g) => {
    const r = apply(add(g), {
      tool: 'styleFeature',
      layerId,
      featureId,
      style: {
        ...base().sketchLayers![0].style,
        dash: 'dash',
        strokeOpacity: 0.4,
      },
    });
    expect(
      parseRecipe(JSON.parse(JSON.stringify(r)), catalog).sketchLayers,
    ).toEqual(r.sketchLayers);
    expect(importGeoJSON(r.sketchLayers![0].data, true)[0].geometry).toEqual(g);
  });
  it.each([
    { type: 'LineString', coordinates: [[0, 0]] },
    {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0, 0],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [179, 0],
        [-179, 1],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [NaN, 1],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 91],
      ],
    },
    { type: 'MultiPoint', coordinates: [[0, 0]] },
    {
      type: 'Polygon',
      coordinates: [
        square,
        [
          [3, 3],
          [5, 3],
          [5, 5],
          [3, 3],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        square,
        [
          [0, 1],
          [1, 1],
          [1, 2],
          [0, 1],
        ],
      ],
    },
    { type: 'Polygon', coordinates: [square, hole, hole] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [2, 0],
          [0, 2],
        ],
      ],
    },
    { type: 'MultiPolygon', coordinates: [[square], [square]] },
    { type: 'MultiPolygon', coordinates: [[square], [hole]] },
    {
      type: 'MultiLineString',
      coordinates: Array.from({ length: 9 }, () => [
        [0, 0],
        [1, 1],
      ]),
    },
    {
      type: 'LineString',
      coordinates: Array.from({ length: 129 }, (_, i) => [i / 10, i / 10]),
    },
  ])('rejects invalid/unsupported bounded geometry %#', (g) =>
    expect(() => sketchGeometry(g)).toThrow(),
  );
  it('inserts/removes collinear intermediate vertices and preserves closure', () => {
    const inserted = editVertex(polygon, [0], 0, 'insert');
    expect(geometryPaths(inserted)[0].coordinates[1]).toEqual([2, 0]);
    expect(editVertex(inserted, [0], 1, 'remove')).toEqual(polygon);
    const moved = editVertex(polygon, [0], 0, 'move', [-1, 0]);
    expect(geometryPaths(moved)[0].coordinates.at(-1)).toEqual([-1, 0]);
    expect(() => editVertex(polygon, [1], 0, 'move', [6, 6])).toThrow();
  });
  it('edits multipart paths without altering another component', () => {
    const g: SketchGeometry = {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    };
    const edited = editVertex(g, [1], 0, 'move', [2, 3]);
    expect(geometryPaths(edited)[0]).toEqual(geometryPaths(g)[0]);
    expect(geometryPaths(edited)[1].coordinates[0]).toEqual([2, 3]);
    expect(() => editVertex(g, [9], 0, 'move', [0, 0])).toThrow();
  });
  it('preserves old single-ring Point/Polygon drafts', () => {
    const r = apply(base(), {
      tool: 'createPolygon',
      layerId,
      name: 'Old',
      vertices: square.slice(0, -1),
    });
    expect(parseRecipe(JSON.parse(JSON.stringify(r)), catalog)).toEqual(r);
  });
  it('requires explicit WGS84 and rejects CRS metadata/unclosed import rings', () => {
    expect(() => importGeoJSON(collection(), false)).toThrow();
    expect(() =>
      importGeoJSON({ ...collection(), crs: { name: 'EPSG:3857' } }, true),
    ).toThrow();
    expect(() =>
      importGeoJSON(
        collection({ type: 'Polygon', coordinates: [square.slice(0, -1)] }),
        true,
      ),
    ).toThrow();
  });
  it('rejects duplicate identities, nested properties, unsafe keys and oversized files', () => {
    const c = collection();
    expect(() =>
      importGeoJSON({ ...c, features: [c.features[0], c.features[0]] }, true),
    ).toThrow();
    expect(() =>
      importGeoJSON(
        {
          ...c,
          features: [
            { ...c.features[0], properties: { nested: { execute: 'sql' } } },
          ],
        },
        true,
      ),
    ).toThrow();
    expect(() =>
      importGeoJSON(
        {
          ...c,
          features: [
            {
              ...c.features[0],
              properties: JSON.parse('{"__proto__":"unsafe"}'),
            },
          ],
        },
        true,
      ),
    ).toThrow();
    expect(() =>
      importGeoJSON(
        {
          ...c,
          features: [
            { ...c.features[0], properties: { huge: 'a'.repeat(65536) } },
          ],
        },
        true,
      ),
    ).toThrow();
  });
  it('imports fresh session IDs, keeps attributes and caps the total feature count atomically', () => {
    const r = apply(add(), {
      tool: 'importVectorLayer',
      name: 'Imported',
      collection: collection(),
      wgs84: true,
    });
    expect(r.sketchLayers![1].data.features[0].id).toBe('local-feature-2');
    expect(r.sketchLayers![1].data.features[0].properties.attributes).toEqual({
      sample: 2,
      public: true,
    });
    const batch = {
      ...collection(),
      features: Array.from({ length: 100 }, (_, i) => ({
        ...collection().features[0],
        id: `s-${i}`,
      })),
    };
    expect(() =>
      apply(r, {
        tool: 'importVectorLayer',
        name: 'Too many',
        collection: batch,
        wgs84: true,
      }),
    ).toThrow();
    expect(r.sketchLayers).toHaveLength(2);
  });
  it('adds/removes consistent typed fields and rejects dangerous field names', () => {
    const r = apply(add(), {
      tool: 'editLayerField',
      layerId,
      field: 'sample',
      value: 0,
    });
    expect(
      r.sketchLayers![0].data.features[0].properties.attributes.sample,
    ).toBe(0);
    expect(() =>
      apply(r, {
        tool: 'editLayerField',
        layerId,
        field: 'sample',
        value: 'wrong',
      }),
    ).toThrow();
    expect(() =>
      parseVectorAction({
        tool: 'editLayerField',
        layerId,
        field: 'constructor',
        value: 1,
      }),
    ).toThrow();
    expect(
      apply(r, {
        tool: 'editLayerField',
        layerId,
        field: 'sample',
        remove: true,
      }).sketchLayers![0].data.features[0].properties.attributes,
    ).toEqual({});
  });
  it('retains raster layers, validates inaccessible recipes and rejects unknown IDs', () => {
    const r = apply(add(), { tool: 'addLayer', datasetId: 'demo-rainfall' });
    expect(apply(r, { tool: 'inspectVectorTable', layerId }).layers).toEqual(
      r.layers,
    );
    const privateCatalog = catalog.map((d) => ({
      ...d,
      accessTier: 'restricted' as const,
      projectId: 'secret',
    }));
    expect(() =>
      applyMapAction(
        r,
        { tool: 'inspectVectorTable', layerId },
        privateCatalog,
        context,
      ),
    ).toThrow(/Akses/);
    expect(() =>
      apply(r, {
        tool: 'zoomVectorFeatures',
        layerId,
        featureIds: ['invented'],
      }),
    ).toThrow();
  });
  it('preserves atomic plans, ordering, and refuses trusted IDs in actions', () => {
    const r = apply(add(), { tool: 'createVectorLayer', name: 'Second' });
    expect(
      apply(r, { tool: 'updateVectorLayer', layerId, index: 1 })
        .sketchLayers![1].id,
    ).toBe(layerId);
    expect(() =>
      executeMapPlan(
        r,
        [
          { tool: 'setMapTitle', title: 'Atomic' },
          {
            tool: 'createFeature',
            layerId,
            name: 'Bad',
            geometry: { type: 'LineString', coordinates: [] },
          },
        ],
        catalog,
        context,
      ),
    ).toThrow();
    expect(r.title).toBe('Peta kerja baru');
    expect(() =>
      parseVectorAction({
        tool: 'createFeature',
        layerId,
        name: 'Fake',
        geometry: line,
        id: 'trusted',
      }),
    ).toThrow();
  });
});
describe('screen-space snapping', () => {
  const settings = {
    enabled: true,
    vertices: true,
    segments: true,
    tolerance: 12,
  };
  const project = (p: LonLat) => ({ x: p[0] * 100, y: p[1] * 100 }),
    unproject = (p: { x: number; y: number }): LonLat => [p.x / 100, p.y / 100];
  const layers = add({
    type: 'LineString',
    coordinates: [
      [0, 0],
      [1, 0],
    ],
  }).sketchLayers!;
  it('snaps vertices and projected segments, never unrelated geometry', () => {
    expect(
      snapCoordinate([0.01, 0.01], layers, settings, project, unproject)?.kind,
    ).toBe('vertex');
    const segment = snapCoordinate(
      [0.5, 0.05],
      layers,
      settings,
      project,
      unproject,
    );
    expect(segment?.kind).toBe('segment');
    expect(segment?.coordinate).toEqual([0.5, 0]);
    expect(
      snapCoordinate(
        [0.5, 0.05],
        layers,
        settings,
        project,
        unproject,
        featureId,
      ),
    ).toBeNull();
  });
  it('uses zoom-dependent projected pixels, not degrees', () => {
    expect(
      snapCoordinate([0.5, 0.1], layers, settings, project, unproject),
    ).not.toBeNull();
    expect(
      snapCoordinate(
        [0.5, 0.1],
        layers,
        settings,
        (p) => ({ x: p[0] * 200, y: p[1] * 200 }),
        unproject,
      ),
    ).toBeNull();
  });
  it('respects visibility, disable, segment toggle and bounded tolerance', () => {
    expect(
      snapCoordinate(
        [0.5, 0.05],
        [{ ...layers[0], visible: false }],
        settings,
        project,
        unproject,
      ),
    ).toBeNull();
    for (const patch of [
      { enabled: false },
      { segments: false },
      { tolerance: 1 },
      { tolerance: 31 },
      { tolerance: NaN },
    ])
      expect(
        snapCoordinate(
          [0.5, 0.05],
          layers,
          { ...settings, ...patch },
          project,
          unproject,
        ),
      ).toBeNull();
  });
});
describe('drag transaction and session history', () => {
  const s = () => useWorkspaceStore.getState();
  beforeEach(() => {
    useWorkspaceStore.setState({
      recipe: add(),
      catalog: [...catalog],
      context,
      past: [],
      future: [],
      vectorEdit: null,
      vectorVertices: [],
      vectorMode: 'edit',
      vectorLayerId: layerId,
      selectedVectorIds: [featureId],
      vectorEpoch: 0,
      vectorError: null,
    });
  });
  it('records one history entry after many drag events, then undo/redo', () => {
    const original = s().recipe;
    s().beginVertexDrag(layerId, featureId, [], 1);
    for (let i = 1; i <= 20; i++) s().previewVertexDrag([1, 1 + i / 100]);
    expect(s().past).toHaveLength(0);
    expect(s().recipe).toBe(original);
    s().commitVertexDrag();
    const edited = s().recipe;
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().recipe).toEqual(original);
    s().redo();
    expect(s().recipe).toEqual(edited);
  });
  it('moves a Point through the same drag transaction without corrupting other features', () => {
    useWorkspaceStore.setState({
      recipe: add({ type: 'Point', coordinates: [103.6, -1.6] }),
    });
    s().beginVertexDrag(layerId, featureId, [], 0);
    s().previewVertexDrag([103.61, -1.61]);
    s().commitVertexDrag();
    expect(s().recipe.sketchLayers![0].data.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [103.61, -1.61],
    });
    s().undo();
    expect(
      s().recipe.sketchLayers![0].data.features[0].geometry.coordinates,
    ).toEqual([103.6, -1.6]);
  });
  it('cancels preview, rejects late AI changes and leaves storage untouched', () => {
    const spy = vi.fn();
    vi.stubGlobal('localStorage', { setItem: spy });
    const original = s().recipe;
    s().beginVertexDrag(layerId, featureId, [], 1);
    s().previewVertexDrag([1, 2]);
    expect(() =>
      s().replace({ ...original, title: 'Late AI' }, 'AI', original),
    ).toThrow(/drag/);
    s().cancelVectorEdit();
    s().commitVertexDrag();
    expect(s().recipe).toBe(original);
    expect(s().past).toHaveLength(0);
    expect(s().vectorEpoch).toBeGreaterThan(1);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('rejects invalid final position instead of committing earlier valid preview', () => {
    const original = s().recipe;
    s().beginVertexDrag(layerId, featureId, [], 1);
    s().previewVertexDrag([1, 2]);
    s().previewVertexDrag([999, 0]);
    s().commitVertexDrag();
    expect(s().recipe).toBe(original);
    expect(s().vectorError).toBeTruthy();
  });
  it('clears removed selections and cancels unfinished drawing without persistence', () => {
    s().setVectorEditor({
      vectorMode: 'line',
      vectorVertices: [
        [0, 0],
        [1, 1],
      ],
    });
    s().cancelVectorEdit();
    expect(s().recipe.sketchLayers![0].data.features).toHaveLength(1);
    s().action({ tool: 'deleteFeature', layerId, featureId });
    expect(s().selectedVectorIds).toEqual([]);
  });
});
describe('advanced Indonesian plans use existing server execution', () => {
  async function run(
    recipe: MapRecipe,
    prompt: string,
    selectedVectorIds: string[] = [],
  ) {
    const env = {
      catalog,
      context,
      mode: 'demo' as const,
      configurations: [],
      raster: getRasterProvider(createDemoGisProvider()),
      signal: new AbortController().signal,
    };
    const input = { ...planningInput(prompt, recipe, env), selectedVectorIds };
    const plan = await planWithProvider(createControlledDemoProvider(), input);
    return executeGISPlan(plan, recipe, env);
  }
  it('creates line layers, resolves actual points, and asks for absent names', async () => {
    expect(
      (await run(emptyRecipe(), 'Buat layer garis bernama Jalur Survei.'))
        .recipe.sketchLayers![0].name,
    ).toBe('Jalur Survei');
    const r = apply(base(), {
      tool: 'createMultiplePoints',
      layerId,
      points: [
        { name: 'A', coordinates: [0, 0] },
        { name: 'B', coordinates: [1, 1] },
      ],
    });
    const result = await run(r, 'Buat garis dari titik A ke titik B.');
    expect(
      result.recipe.sketchLayers![0].data.features.at(-1)!.geometry.type,
    ).toBe('LineString');
    expect((await run(r, 'Buat garis dari titik A ke titik X.')).changed).toBe(
      false,
    );
  });
  it('inserts actual segment midpoint, styles selection, and opens table without map mutation', async () => {
    const result = await run(
      add(),
      'Tambahkan satu vertex di antara titik kedua dan ketiga.',
      [featureId],
    );
    expect(
      geometryPaths(result.recipe.sketchLayers![0].data.features[0].geometry)[0]
        .coordinates,
    ).toHaveLength(4);
    expect(
      (await run(add(), 'Ubah warna garis menjadi biru.', [featureId])).recipe
        .sketchLayers![0].data.features[0].properties.style?.color,
    ).toBe('#2563eb');
    const table = await run(add(), 'Tampilkan tabel atribut layer survei.');
    expect(table.status).toBe('completed');
    expect(table.changed).toBe(false);
    expect(
      (await run(add(), 'Zoom ke objek yang saya pilih.', [featureId])).recipe
        .viewport.center,
    ).toEqual([0.5, 1]);
  });
});
