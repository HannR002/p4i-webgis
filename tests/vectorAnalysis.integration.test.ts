import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { getLocalVectorRepository } from '../lib/server/database/vector/local';
import {
  getLocalVectorAnalysis,
  estimateLocalVectorAnalysis,
} from '../lib/server/database/vector/analysis';
import {
  DEFAULT_SKETCH_STYLE,
  type SketchGeometry,
  type SketchLayer,
} from '../lib/gis/vectorEditing';
import type { VectorLayerDocument } from '../lib/gis/vectorPersistence';
import type {
  VectorAnalysisOperation,
  VectorAnalysisRequest,
} from '../lib/gis/vectorAnalysis';
const suite =
  process.env.P4I_VECTOR_TEST_STATE &&
  process.env.P4I_VECTOR_ANALYSIS === 'true'
    ? describe
    : describe.skip;
suite('actual bounded PostGIS spatial analysis', () => {
  let state: {
    endpoint: string;
    db: string;
    projects: Record<string, string>;
    users: Record<string, string>;
    tokens: Record<string, string>;
  };
  let doc: VectorLayerDocument;
  const square = (x: number, y: number, w = 0.002): SketchGeometry => ({
    type: 'Polygon',
    coordinates: [
      [
        [x, y],
        [x + w, y],
        [x + w, y + w],
        [x, y + w],
        [x, y],
      ],
    ],
  });
  const geometries: SketchGeometry[] = [
    square(103, 0),
    square(103.001, 0),
    square(103.01, 0),
    { type: 'Point', coordinates: [103.001, 0.001] },
    { type: 'Point', coordinates: [103, 0] },
    {
      type: 'LineString',
      coordinates: [
        [103, 0],
        [103.001, 0],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [103.0005, -0.001],
        [103.0005, 0.001],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        (square(103, 0, 0.006) as GeoJSON.Polygon).coordinates[0],
        (square(103.002, 0.002) as GeoJSON.Polygon).coordinates[0]
          .slice()
          .reverse(),
      ],
    },
    {
      type: 'MultiPolygon',
      coordinates: [
        (square(103, 0) as GeoJSON.Polygon).coordinates,
        (square(103.01, 0) as GeoJSON.Polygon).coordinates,
      ],
    },
    { type: 'Point', coordinates: [103, -1] },
    square(103.002, 0),
    { type: 'Point', coordinates: [103, 0.01] },
  ];
  const layer: SketchLayer = {
    id: 'local-vector-1',
    name: 'Synthetic analysis fixtures',
    visible: true,
    opacity: 1,
    style: DEFAULT_SKETCH_STYLE,
    data: {
      type: 'FeatureCollection',
      features: geometries.map((geometry, i) => ({
        type: 'Feature',
        id: `local-feature-${i + 1}`,
        geometry,
        properties: {
          name: `Fixture ${i + 1}`,
          description: 'Synthetic independently checkable',
          attributes: { group: i < 2 ? 'A' : 'B' },
        },
      })),
    },
  };
  const repo = (who = 'analyst') => getLocalVectorRepository(state.tokens[who]);
  const ref = (indices: number[]) => ({
    layerId: doc.id,
    revision: doc.revision,
    featureIds: indices.map((i) => doc.features[i].id),
  });
  const req = (
    operation: VectorAnalysisOperation,
    a = [0],
    b: number[] | null = null,
    parameters: VectorAnalysisRequest['parameters'] = {},
  ): VectorAnalysisRequest => ({
    operation,
    projectId: state.projects.A,
    source: ref(a),
    target: b ? ref(b) : null,
    parameters,
  });
  const execute = (r: VectorAnalysisRequest) =>
    getLocalVectorAnalysis(state.tokens.analyst).execute(r);
  async function direct(input: unknown, who = 'analyst', preview = false) {
    const r = await fetch(state.endpoint + '/rpc/p4i_vector_analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(who === 'guest'
          ? {}
          : { Authorization: `Bearer ${state.tokens[who]}` }),
      },
      body: JSON.stringify({ input, preview }),
    });
    return { status: r.status, body: await r.json() };
  }
  function sql(query: string) {
    const env = { ...process.env };
    for (const k of [
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_TLS',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
    ])
      delete env[k];
    const r = spawnSync(
      'docker',
      [
        '--host=unix:///var/run/docker.sock',
        'exec',
        '-i',
        state.db,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'p4i_phase15_local',
        '-At',
      ],
      { input: query, encoding: 'utf8', env },
    );
    if (r.status !== 0) throw Error(r.stderr);
    return r.stdout.trim();
  }
  const planarArea = (g: SketchGeometry): number => {
    const ring = (p: number[][]) =>
      Math.abs(
        p
          .slice(1)
          .reduce((sum, c, i) => sum + p[i][0] * c[1] - c[0] * p[i][1], 0) / 2,
      );
    if (g.type === 'Polygon')
      return (
        ring(g.coordinates[0]) -
        g.coordinates.slice(1).reduce((s, p) => s + ring(p), 0)
      );
    if (g.type === 'MultiPolygon')
      return g.coordinates.reduce(
        (s, p) => s + planarArea({ type: 'Polygon', coordinates: p }),
        0,
      );
    return 0;
  };
  beforeAll(async () => {
    state = JSON.parse(
      readFileSync(process.env.P4I_VECTOR_TEST_STATE!, 'utf8'),
    );
    expect(state.db).toMatch(/^p4i-vector15-[a-f0-9]+-db$/);
    expect(new URL(state.endpoint).hostname).toBe('127.0.0.1');
    process.env.VECTOR_STORAGE_MODE = 'local-postgis';
    process.env.VECTOR_STORAGE_LOCAL_ACK = 'synthetic-only';
    process.env.VECTOR_STORAGE_LOCAL_URL = state.endpoint;
    doc = await repo().saveLayer({
      projectId: state.projects.A,
      layerId: null,
      expectedRevision: 0,
      requestId: randomUUID(),
      layer,
      archive: false,
    });
  });
  it('derives estimates from stored geometry and does not mutate sources', async () => {
    const before = sql(
      "SELECT count(*)||':'||sum(revision) FROM p4i_vector.layers",
    );
    const r = await estimateLocalVectorAnalysis(
      state.tokens.analyst,
      req('intersection', [0], [1]),
    );
    expect(r).toEqual({
      features: 2,
      vertices: 10,
      pairTests: 1,
      costClass: 'LOW_COST_ANALYSIS',
    });
    await execute(req('intersection', [0], [1]));
    expect(
      sql("SELECT count(*)||':'||sum(revision) FROM p4i_vector.layers"),
    ).toBe(before);
    expect(await repo().readLayer(state.projects.A, doc.id)).toEqual(doc);
  });
  it('buffers metres with an independently checked radius and area', async () => {
    const r = await execute(req('buffer', [9], null, { distanceMetres: 500 }));
    const g = r.layer.data.features[0].geometry;
    expect(g.type).toBe('Polygon');
    if (g.type !== 'Polygon') throw Error('type');
    for (const [lon, lat] of g.coordinates[0]) {
      const x = (lon - 103) * 111302.65,
        y = (lat + 1) * 110574.61;
      expect(Math.hypot(x, y)).toBeGreaterThan(498);
      expect(Math.hypot(x, y)).toBeLessThan(502);
    }
    expect(planarArea(g) * 111302.65 * 110574.61).toBeCloseTo(
      16 * 500 ** 2 * Math.sin(Math.PI / 16),
      -3,
    );
  });
  it.each([
    ['intersection', 0.000002],
    ['union', 0.000006],
    ['difference', 0.000002],
    ['clip', 0.000002],
  ] as const)(
    '%s has exact independently calculated planar rectangle area',
    async (op, area) => {
      const r = await execute(req(op, [0], [1]));
      expect(
        r.layer.data.features.reduce((s, f) => s + planarArea(f.geometry), 0),
      ).toBeCloseTo(area, 11);
    },
  );
  it('returns empty overlay without invented geometry', async () => {
    expect(
      (await execute(req('intersection', [0], [2]))).layer.data.features,
    ).toEqual([]);
  });
  it('preserves lower dimensional shared boundary and crossing-line point', async () => {
    expect(
      (await execute(req('intersection', [0], [10]))).layer.data.features[0]
        .geometry.type,
    ).toBe('LineString');
    const r = await execute(req('intersection', [5], [6]));
    expect(r.layer.data.features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [103.0005, 0],
    });
  });
  it('normalizes collections without dropping point or polygon components', async () => {
    const r = await execute(req('union', [0], [11]));
    expect(r.layer.data.features.map((f) => f.geometry.type).sort()).toEqual([
      'Point',
      'Polygon',
    ]);
  });
  it('preserves multipart areas and holes', async () => {
    const hole = await execute(req('difference', [7], [2]));
    expect(hole.layer.data.features[0].geometry.type).toBe('Polygon');
    expect(planarArea(hole.layer.data.features[0].geometry)).toBeCloseTo(
      0.000032,
      11,
    );
    const multi = await execute(req('difference', [8], [11]));
    expect(multi.layer.data.features[0].geometry.type).toBe('MultiPolygon');
    expect(planarArea(multi.layer.data.features[0].geometry)).toBeCloseTo(
      0.000008,
      11,
    );
  });
  it('dissolves only a permitted existing scalar attribute', async () => {
    const r = await execute(
      req('dissolve', [0, 1], null, { attribute: 'group' }),
    );
    expect(r.layer.data.features).toHaveLength(1);
    expect(planarArea(r.layer.data.features[0].geometry)).toBeCloseTo(
      0.000006,
      11,
    );
    expect(r.layer.data.features[0].properties.attributes.groupValue).toBe('A');
    expect(
      (await direct(req('dissolve', [0], null, { attribute: 'missing' })))
        .status,
    ).toBe(400);
  });
  it('selects within excluding boundary, while intersects includes boundary', async () => {
    expect(
      (await execute(req('within', [3, 4], [0]))).layer.data.features,
    ).toHaveLength(1);
    expect(
      (await execute(req('intersects', [3, 4], [0]))).layer.data.features,
    ).toHaveLength(2);
  });
  it('measures WGS84 area, equatorial distance and length with independent constants', async () => {
    // Ellipsoid surface element at equator: a²(1-e²) cos(phi)/(1-e²sin²(phi))²; a 0.002° patch changes <1e-8 relatively.
    const a = 6378137,
      f = 1 / 298.257223563,
      e2 = f * (2 - f),
      d = (0.002 * Math.PI) / 180,
      expected = a * a * (1 - e2) * d * d;
    const area = (await execute(req('area', [0], null, { unit: 'm2' }))).layer
      .data.features[0].properties.attributes.value as number;
    expect(Math.abs(area - expected)).toBeLessThan(0.1);
    const ha = (await execute(req('area', [0], null, { unit: 'ha' }))).layer
      .data.features[0].properties.attributes.value as number;
    expect(ha).toBeCloseTo(area / 10000, 8);
    const length = (await execute(req('length', [5], null, { unit: 'm' })))
      .layer.data.features[0].properties.attributes.value;
    expect(length).toBeCloseTo(111.319490793, 5);
    const dist = (await execute(req('distance', [4], [6], { unit: 'km' })))
      .layer.data.features[0].properties.attributes.value as number;
    expect(dist).toBeCloseTo(0.0556597454, 7);
  });
  it('rejects measurement mismatch, CRS override, degree buffers and SQL fragments directly', async () => {
    for (const r of [
      req('area', [3], null, { unit: 'm2' }),
      req('length', [0], null, { unit: 'm' }),
      { ...req('buffer', [9], null, { distanceMetres: 1 }), crs: 'EPSG:3857' },
      { ...req('buffer', [9]), parameters: { distance: 1, unit: 'degrees' } },
      { ...req('area', [0], null, { unit: 'ha' }), sql: 'select 1' },
      req('dissolve', [0], null, { attribute: 'group; DROP TABLE x' }),
      { ...req('area', [0], null, { unit: 'ha' }), operation: null },
    ])
      expect((await direct(r)).status).toBe(400);
  });
  it('rejects guest, B2B read-only, other tenant, disabled user and forged project references', async () => {
    for (const who of ['guest', 'clientA', 'clientB', 'editorB', 'disabled'])
      expect([401, 403]).toContain(
        (await direct(req('area', [0], null, { unit: 'ha' }), who)).status,
      );
    expect(
      (
        await direct({
          ...req('area', [0], null, { unit: 'ha' }),
          projectId: state.projects.B,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await direct({
          ...req('area', [0], null, { unit: 'ha' }),
          source: { ...ref([0]), featureIds: [randomUUID()] },
        })
      ).status,
    ).toBe(403);
  });
  it('rejects revoked assignment despite old valid token', async () => {
    sql(
      `DELETE FROM p4i_vector.project_editors WHERE project_id='${state.projects.A}' AND user_id='${state.users.analyst}'`,
    );
    try {
      expect(
        (await direct(req('area', [0], null, { unit: 'ha' }))).status,
      ).toBe(403);
    } finally {
      sql(
        `INSERT INTO p4i_vector.project_editors VALUES('${state.projects.A}','${state.users.analyst}','owner')`,
      );
    }
  });
  it('rejects stale revision and oversized/duplicate feature requests', async () => {
    const r = req('area', [0], null, { unit: 'ha' });
    expect(
      (await direct({ ...r, source: { ...r.source, revision: 99 } })).status,
    ).toBe(409);
    expect(
      (
        await direct({
          ...r,
          source: {
            ...r.source,
            featureIds: Array(21).fill(doc.features[0].id),
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await direct({
          ...r,
          source: {
            ...r.source,
            featureIds: [doc.features[0].id, doc.features[0].id],
          },
        })
      ).status,
    ).toBe(400);
  });
  it('refuses wide extents, high latitude and zone-crossing buffer', async () => {
    for (const geometry of [
      {
        type: 'LineString',
        coordinates: [
          [103, 0],
          [105, 0],
        ],
      },
      { type: 'Point', coordinates: [103, 80] },
      {
        type: 'LineString',
        coordinates: [
          [107.999, 1],
          [108.001, 1],
        ],
      },
    ] as SketchGeometry[]) {
      const d = await repo().saveLayer({
        projectId: state.projects.public,
        layerId: null,
        expectedRevision: 0,
        requestId: randomUUID(),
        archive: false,
        layer: {
          ...layer,
          data: {
            type: 'FeatureCollection',
            features: [{ ...layer.data.features[0], geometry }],
          },
        },
      });
      const r = {
        ...req('buffer', [0], null, { distanceMetres: 500 }),
        projectId: d.projectId,
        source: {
          layerId: d.id,
          revision: d.revision,
          featureIds: [d.features[0].id],
        },
      };
      expect((await direct(r)).status).toBe(400);
    }
  });
  it('has actual connection statement timeout and bounded concurrent database slots', async () => {
    expect(
      sql("SELECT rolconfig::text FROM pg_roles WHERE rolname='authenticator'"),
    ).toContain('statement_timeout=3s');
    // Hold both engine slots in a separate transaction; no artificial application mock.
    const child = spawn('docker', [
      '--host=unix:///var/run/docker.sock',
      'exec',
      '-i',
      state.db,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'p4i_phase15_local',
      '-At',
    ]);
    let ready = '';
    child.stdout.on('data', (d) => {
      ready += d.toString();
    });
    child.stdin.end(
      "BEGIN; SELECT pg_advisory_xact_lock(16017,1); SELECT pg_advisory_xact_lock(16017,2); SELECT 'locked'; SELECT pg_sleep(2); COMMIT;",
    );
    while (!ready.includes('locked'))
      await new Promise((r) => setTimeout(r, 20));
    expect((await direct(req('area', [0], null, { unit: 'ha' }))).status).toBe(
      429,
    );
    await new Promise((r) => child.on('close', r));
  });
  it('enforces a real statement timeout on the same authenticated PostgREST connection', async () => {
    sql(
      "CREATE FUNCTION public.phase16_timeout_probe() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(4); RETURN 1; END $$; REVOKE ALL ON FUNCTION public.phase16_timeout_probe() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.phase16_timeout_probe() TO authenticated; NOTIFY pgrst,'reload schema';",
    );
    try {
      let response: Response | undefined;
      const start = Date.now();
      for (let i = 0; i < 30; i++) {
        response = await fetch(state.endpoint + '/rpc/phase16_timeout_probe', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${state.tokens.analyst}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        });
        if (response.status !== 404) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect((await response!.json()).code).toBe('57014');
      expect(Date.now() - start).toBeLessThan(6500);
    } finally {
      sql(
        "DROP FUNCTION public.phase16_timeout_probe(); NOTIFY pgrst,'reload schema';",
      );
    }
  }, 10000);
  it('rejects stored vertex workload and oversized output without mutating evidence', async () => {
    const dense = {
      ...layer,
      data: {
        type: 'FeatureCollection' as const,
        features: Array.from({ length: 17 }, (_, i) => ({
          ...layer.data.features[0],
          id: `local-feature-${i + 1}`,
          geometry: {
            type: 'LineString' as const,
            coordinates: Array.from(
              { length: 128 },
              (_, j) => [103, j % 2 === 0 ? 0.001 : 0.002] as [number, number],
            ),
          },
        })),
      },
    };
    const d = await repo().saveLayer({
      projectId: state.projects.public,
      layerId: null,
      expectedRevision: 0,
      requestId: randomUUID(),
      archive: false,
      layer: dense,
    });
    const r = {
      ...req('length', [0], null, { unit: 'm' }),
      projectId: d.projectId,
      source: {
        layerId: d.id,
        revision: 1,
        featureIds: d.features.map((f) => f.id),
      },
    };
    expect((await direct(r)).status).toBe(400);
    expect(await repo().readLayer(d.projectId, d.id)).toEqual(d);
  });
  it('normalizes every MultiPoint component and refuses oversized multipart output', async () => {
    const points = await execute(req('union', [3], [11]));
    expect(points.layer.data.features.map((f) => f.geometry.type)).toEqual([
      'Point',
      'Point',
    ]);
    const sparse = {
      ...layer,
      data: {
        type: 'FeatureCollection' as const,
        features: Array.from({ length: 9 }, (_, i) => ({
          ...layer.data.features[0],
          id: `local-feature-${i + 1}`,
          geometry: {
            type: 'Point' as const,
            coordinates: [103 + i * 0.01, -1] as [number, number],
          },
        })),
      },
    };
    const d = await repo().saveLayer({
      projectId: state.projects.public,
      layerId: null,
      expectedRevision: 0,
      requestId: randomUUID(),
      archive: false,
      layer: sparse,
    });
    const r = {
      ...req('buffer', [0], null, { distanceMetres: 10 }),
      projectId: d.projectId,
      source: {
        layerId: d.id,
        revision: 1,
        featureIds: d.features.map((f) => f.id),
      },
    };
    const response = await direct(r);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Part limit');
    expect(await repo().readLayer(d.projectId, d.id)).toEqual(d);
  });
  it('saves results only through existing authorized revision workflow, retaining conflicts', async () => {
    const r = await execute(req('intersection', [0], [1]));
    const saved = await repo().saveLayer({
      projectId: state.projects.A,
      layerId: null,
      expectedRevision: 0,
      requestId: randomUUID(),
      archive: false,
      layer: r.layer,
    });
    expect(saved.id).not.toBe(doc.id);
    await expect(
      repo('clientA').saveLayer({
        projectId: state.projects.A,
        layerId: saved.id,
        expectedRevision: saved.revision,
        requestId: randomUUID(),
        archive: false,
        layer: r.layer,
      }),
    ).rejects.toThrow('Akses');
    await expect(
      repo().saveLayer({
        projectId: state.projects.A,
        layerId: saved.id,
        expectedRevision: 99,
        requestId: randomUUID(),
        archive: false,
        layer: r.layer,
      }),
    ).rejects.toThrow('Konflik');
    expect(await repo().readLayer(state.projects.A, doc.id)).toEqual(doc);
  });
});
