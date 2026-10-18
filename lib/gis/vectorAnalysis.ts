import { GisInputError, record } from './validation';
import { uuid } from './vectorPersistence';
import {
  DEFAULT_SKETCH_STYLE,
  parseSketchLayers,
  type SketchLayer,
} from './vectorEditing';
export const VECTOR_ANALYSIS_OPERATIONS = [
  'buffer',
  'intersection',
  'union',
  'difference',
  'clip',
  'dissolve',
  'intersects',
  'within',
  'area',
  'length',
  'distance',
] as const;
export type VectorAnalysisOperation =
  (typeof VECTOR_ANALYSIS_OPERATIONS)[number];
export interface VectorAnalysisSource {
  layerId: string;
  revision: number;
  featureIds: string[];
}
export interface VectorAnalysisRequest {
  operation: VectorAnalysisOperation;
  projectId: string;
  source: VectorAnalysisSource;
  target: VectorAnalysisSource | null;
  parameters: {
    distanceMetres?: number;
    attribute?: string;
    unit?: 'm2' | 'ha' | 'm' | 'km';
  };
}
export interface VectorAnalysisResult {
  request: VectorAnalysisRequest;
  engine: 'PostGIS';
  crs: 'EPSG:4326';
  metric: 'WGS84 spheroid / local UTM buffer';
  createdAt: string;
  estimate: {
    features: number;
    vertices: number;
    pairTests: number;
    costClass: 'LOW_COST_ANALYSIS';
  };
  warnings: string[];
  layer: SketchLayer;
}
function exact(v: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw new GisInputError('Parameter analisis tidak valid');
}
function source(v: unknown): VectorAnalysisSource {
  if (!record(v)) throw new GisInputError('Sumber harus referensi database');
  exact(v, ['layerId', 'revision', 'featureIds']);
  if (
    !uuid(v.layerId) ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1 ||
    !Array.isArray(v.featureIds) ||
    v.featureIds.length < 1 ||
    v.featureIds.length > 20 ||
    v.featureIds.some((id) => !uuid(id)) ||
    new Set(v.featureIds).size !== v.featureIds.length
  )
    throw new GisInputError(
      'Pilih 1–20 UUID fitur tersimpan dengan revisi layer',
    );
  return v as unknown as VectorAnalysisSource;
}
export function parseVectorAnalysisRequest(v: unknown): VectorAnalysisRequest {
  if (!record(v)) throw new GisInputError('Permintaan analisis tidak valid');
  exact(v, ['operation', 'projectId', 'source', 'target', 'parameters']);
  if (
    !VECTOR_ANALYSIS_OPERATIONS.includes(
      v.operation as VectorAnalysisOperation,
    ) ||
    !uuid(v.projectId) ||
    !record(v.parameters)
  )
    throw new GisInputError('Operasi/proyek tidak valid');
  const operation = v.operation as VectorAnalysisOperation;
  const binary = [
    'intersection',
    'union',
    'difference',
    'clip',
    'intersects',
    'within',
    'distance',
  ].includes(operation);
  if (binary ? v.target === null : v.target !== null)
    throw new GisInputError('Jumlah sumber tidak sesuai operasi');
  const p = v.parameters;
  const keys =
    operation === 'buffer'
      ? ['distanceMetres']
      : operation === 'dissolve'
        ? ['attribute']
        : ['area', 'length', 'distance'].includes(operation)
          ? ['unit']
          : [];
  exact(p, keys);
  if (
    operation === 'buffer' &&
    (typeof p.distanceMetres !== 'number' ||
      !Number.isFinite(p.distanceMetres) ||
      p.distanceMetres < 1 ||
      p.distanceMetres > 10000)
  )
    throw new GisInputError('Buffer harus 1–10000 meter');
  if (
    operation === 'dissolve' &&
    (typeof p.attribute !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(p.attribute) ||
      ['constructor', 'prototype', '__proto__'].includes(p.attribute))
  )
    throw new GisInputError('Atribut dissolve tidak valid');
  if (
    keys[0] === 'unit' &&
    !(operation === 'area' ? ['m2', 'ha'] : ['m', 'km']).includes(
      String(p.unit),
    )
  )
    throw new GisInputError('Unit tidak sesuai operasi');
  return {
    operation,
    projectId: v.projectId as string,
    source: source(v.source),
    target: binary ? source(v.target) : null,
    parameters: p,
  };
}
export function analysisLayer(features: unknown): SketchLayer {
  return parseSketchLayers([
    {
      id: 'local-vector-1',
      name: 'Hasil analisis PostGIS',
      visible: true,
      opacity: 1,
      style: {
        ...DEFAULT_SKETCH_STYLE,
        color: '#b45309',
        fillColor: '#f59e0b',
      },
      data: { type: 'FeatureCollection', features },
    },
  ])[0];
}
export function parseVectorAnalysisResult(v: unknown): VectorAnalysisResult {
  if (
    !record(v) ||
    v.engine !== 'PostGIS' ||
    v.crs !== 'EPSG:4326' ||
    v.metric !== 'WGS84 spheroid / local UTM buffer' ||
    typeof v.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAt)) ||
    !record(v.estimate) ||
    v.estimate.costClass !== 'LOW_COST_ANALYSIS' ||
    !Array.isArray(v.warnings) ||
    v.warnings.length > 8 ||
    v.warnings.some((x) => typeof x !== 'string' || x.length > 300)
  )
    throw new GisInputError('Hasil analisis tidak valid');
  for (const [k, limit] of [
    ['features', 40],
    ['vertices', 2048],
    ['pairTests', 400],
  ] as const)
    if (
      !Number.isSafeInteger(v.estimate[k]) ||
      Number(v.estimate[k]) < 0 ||
      Number(v.estimate[k]) > limit
    )
      throw new GisInputError('Estimasi hasil tidak valid');
  if (new TextEncoder().encode(JSON.stringify(v)).length > 65536)
    throw new GisInputError('Hasil melebihi batas 64 KiB');
  return {
    ...v,
    request: parseVectorAnalysisRequest(v.request),
    layer: parseSketchLayers([v.layer])[0],
  } as unknown as VectorAnalysisResult;
}

/** AI preparation uses local references only. These never authorize database queries. */
export interface VectorAnalysisProposal {
  tool: 'prepareVectorAnalysis';
  operation: 'buffer' | 'area' | 'length';
  layerId: string;
  featureIds: string[];
  parameters: VectorAnalysisRequest['parameters'];
}
export function parseVectorAnalysisProposal(
  v: unknown,
): VectorAnalysisProposal {
  if (!record(v)) throw new GisInputError('Usulan analisis tidak valid');
  exact(v, ['tool', 'operation', 'layerId', 'featureIds', 'parameters']);
  if (
    v.tool !== 'prepareVectorAnalysis' ||
    !['buffer', 'area', 'length'].includes(String(v.operation)) ||
    typeof v.layerId !== 'string' ||
    !/^local-vector-\d+$/.test(v.layerId) ||
    !Array.isArray(v.featureIds) ||
    v.featureIds.length < 1 ||
    v.featureIds.length > 20 ||
    new Set(v.featureIds).size !== v.featureIds.length ||
    v.featureIds.some(
      (id) => typeof id !== 'string' || !/^local-feature-\d+$/.test(id),
    )
  )
    throw new GisInputError('Referensi usulan tidak valid');
  // Reuse parameter validation without assigning trusted identity to these local keys.
  parseVectorAnalysisRequest({
    operation: v.operation,
    projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    source: {
      layerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      revision: 1,
      featureIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    },
    target: null,
    parameters: v.parameters,
  });
  return v as unknown as VectorAnalysisProposal;
}
