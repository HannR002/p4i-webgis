import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  parseVectorAnalysisRequest,
  parseVectorAnalysisResult,
  parseVectorAnalysisProposal,
  analysisLayer,
} from '../lib/gis/vectorAnalysis';
import {
  createVectorSpatialAnalysis,
  getLocalVectorAnalysis,
} from '../lib/server/database/vector/analysis';
import { localVectorEndpoint } from '../lib/server/database/vector/local';
import { planSpatialAnalysis } from '../lib/server/ai/providers/spatialAnalysisPlanner';
import { parseGISToolRequest } from '../lib/gis/copilotValidation';
import { emptyRecipe } from '../lib/gis/catalog';
import { DEFAULT_SKETCH_STYLE } from '../lib/gis/vectorEditing';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request = () => ({
  operation: 'buffer',
  projectId: id,
  source: { layerId: id, revision: 1, featureIds: [id] },
  target: null,
  parameters: { distanceMetres: 500 },
});
const result = () => ({
  request: request(),
  engine: 'PostGIS',
  crs: 'EPSG:4326',
  metric: 'WGS84 spheroid / local UTM buffer',
  createdAt: '2026-10-18T00:00:00Z',
  estimate: {
    features: 1,
    vertices: 1,
    pairTests: 0,
    costClass: 'LOW_COST_ANALYSIS',
  },
  warnings: [],
  layer: analysisLayer([]),
});
const input = () => ({
  prompt: 'Buat buffer 500 meter dari titik A.',
  recipe: {
    ...emptyRecipe(),
    sketchLayers: [
      {
        id: 'local-vector-1',
        name: 'Survei',
        visible: true,
        opacity: 1,
        style: DEFAULT_SKETCH_STYLE,
        data: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              id: 'local-feature-1',
              geometry: {
                type: 'Point' as const,
                coordinates: [103, -1] as [number, number],
              },
              properties: { name: 'A', description: '', attributes: {} },
            },
          ],
        },
      },
    ],
  },
  catalog: [],
  configurations: [],
  aois: [],
});
beforeEach(() => vi.restoreAllMocks());
describe('vector spatial contracts and controlled preparation', () => {
  it('accepts bounded typed stored references and empty genuine results', () => {
    expect(
      parseVectorAnalysisRequest(request()).parameters.distanceMetres,
    ).toBe(500);
    expect(parseVectorAnalysisResult(result()).layer.data.features).toEqual([]);
  });
  it.each([
    { ...request(), role: 'super_admin' },
    { ...request(), sql: 'SELECT 1' },
    {
      ...request(),
      source: { ...request().source, layerId: 'local-vector-1' },
    },
    { ...request(), source: { ...request().source, featureIds: [id, id] } },
    { ...request(), source: { ...request().source, revision: 1.5 } },
    { ...request(), parameters: { distanceMetres: Infinity } },
    { ...request(), parameters: { distanceMetres: 10001 } },
    { ...request(), parameters: { distanceMetres: 500, unit: 'degrees' } },
    { ...request(), operation: 'intersection' },
    { ...request(), target: request().source },
    { ...request(), operation: 'area', parameters: { unit: 'm' } },
  ])('rejects adversarial or incorrect request %j', (v) => {
    expect(() => parseVectorAnalysisRequest(v)).toThrow();
  });
  it('rejects invalid provider geometry, unknown CRS, oversized results and request substitution', async () => {
    expect(() =>
      parseVectorAnalysisResult({ ...result(), crs: 'EPSG:3857' }),
    ).toThrow();
    expect(() =>
      parseVectorAnalysisResult({
        ...result(),
        estimate: {
          features: 999,
          vertices: 1,
          pairTests: 0,
          costClass: 'LOW_COST_ANALYSIS',
        },
      }),
    ).toThrow();
    await expect(
      createVectorSpatialAnalysis(async () => ({
        ...result(),
        request: { ...request(), parameters: { distanceMetres: 100 } },
      })).execute(parseVectorAnalysisRequest(request())),
    ).rejects.toThrow('tidak sesuai');
  });
  it('fails closed without local adapter, production refuses fixture, no external fallback', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(
      localVectorEndpoint({
        NODE_ENV: 'production',
        VECTOR_STORAGE_MODE: 'local-postgis',
        VECTOR_STORAGE_LOCAL_ACK: 'synthetic-only',
        VECTOR_STORAGE_LOCAL_URL: 'http://127.0.0.1:1234',
      }),
    ).toBeNull();
    expect(() => getLocalVectorAnalysis(null)).toThrow('Autentikasi');
    const old = process.env.VECTOR_STORAGE_MODE;
    process.env.VECTOR_STORAGE_MODE = 'disabled';
    try {
      expect(() => getLocalVectorAnalysis('synthetic')).toThrow(
        'belum tersedia',
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      process.env.VECTOR_STORAGE_MODE = old;
    }
  });
  it('registers a validated AI preparation without assigning database identity', () => {
    const p = planSpatialAnalysis(input());
    expect(p).toMatchObject({
      tool: 'prepareVectorAnalysis',
      operation: 'buffer',
      featureIds: ['local-feature-1'],
    });
    expect(parseGISToolRequest(p)).toEqual(p);
    expect(() =>
      parseVectorAnalysisProposal({ ...p, projectId: id }),
    ).toThrow();
  });
  it('asks for missing and ambiguous names instead of inventing geometry', () => {
    expect(
      planSpatialAnalysis({
        ...input(),
        prompt: 'Buat buffer 500 meter dari titik Hilang.',
      }),
    ).toHaveProperty('clarification');
    const i = input();
    i.recipe.sketchLayers[0].data.features.push({
      ...i.recipe.sketchLayers[0].data.features[0],
      id: 'local-feature-2',
    });
    expect(planSpatialAnalysis(i)).toHaveProperty('clarification');
  });
  it('rejects unsupported scientific type and excessive distance with clarification', () => {
    expect(
      planSpatialAnalysis({
        ...input(),
        prompt: 'Hitung luas A dalam hektare.',
      }),
    ).toHaveProperty('clarification');
    expect(
      planSpatialAnalysis({
        ...input(),
        prompt: 'Buat buffer 50000 meter dari titik A.',
      }),
    ).toHaveProperty('clarification');
  });
  it('transient result does not mutate recipe/history or save to storage', () => {
    const s = useWorkspaceStore.getState(),
      before = s.recipe,
      past = s.past;
    s.setVectorAnalysisResult(parseVectorAnalysisResult(result()));
    expect(useWorkspaceStore.getState().recipe).toBe(before);
    expect(useWorkspaceStore.getState().past).toBe(past);
    s.setVectorAnalysisResult(null);
    expect(useWorkspaceStore.getState().recipe).toBe(before);
  });
});

it('runs the existing planner/executor/response validation chain for spatial preparation without compute or mutation', async () => {
  const { createControlledDemoProvider } =
    await import('../lib/server/ai/providers/controlledDemo');
  const { planWithProvider, executeGISPlan } =
    await import('../lib/server/ai/execution');
  const { parseGISRunResponse } = await import('../lib/gis/copilotValidation');
  const { createDemoGisProvider } =
    await import('../lib/server/gis/providers/demo');
  const gis = createDemoGisProvider();
  const { getRasterProvider } =
    await import('../lib/server/gis/rasterProvider');
  const i = input();
  const provider = createControlledDemoProvider();
  const plan = await planWithProvider(provider, i);
  const env = {
    catalog: gis.catalog(),
    context: { role: 'guest' as const, entitledProjectIds: [] },
    mode: 'demo' as const,
    configurations: [],
    signal: new AbortController().signal,
    raster: getRasterProvider(gis),
  };
  const result = await executeGISPlan(plan, i.recipe, env);
  expect(parseGISRunResponse(result, env).changed).toBe(false);
  expect(result.results[0].data.kind).toBe('vector-analysis-preparation');
});
