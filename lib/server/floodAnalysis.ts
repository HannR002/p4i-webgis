import 'server-only';

import { createHash } from 'node:crypto';
import {
  FLOOD_DATASET_VERSION_BASE,
  FLOOD_MODEL_VERSION,
  LAND_COVER_SUSCEPTIBILITY,
  NUMERIC_CACHE_TTL_MS,
  RAINFALL_SUSCEPTIBILITY,
  SLOPE_SUSCEPTIBILITY,
  SOIL_CLASS_SUSCEPTIBILITY,
  TILE_TOKEN_TTL_MS,
  buildFloodCacheIdentity,
  classifyFloodScore,
  toEarthEngineExclusiveEnd,
  type FloodAnalysisInput,
} from '../../config/floodRiskModel';
import type {
  FloodAnalysisResult,
  FloodCriteriaBreakdown,
  FloodWeights,
} from '../../types/flood';
import type { GeoJsonMultiPolygon, GeoJsonPolygon } from '../../types/geojson';
import { getDatabaseRepositories } from './database';
import type { AnalysisBoundary, CachedFloodResult } from './database/contracts';
import { evaluateEeObject, getEeMapUrl, initializeEarthEngine } from './earthEngine';

type AoiGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

interface NumericAnalysis {
  score: number;
  criteriaBreakdown: FloodCriteriaBreakdown;
}

interface FloodImageGraph {
  riskImage: {
    getMapId: (
      visualization: Record<string, unknown>,
      callback: (map: { urlFormat: string } | undefined, error?: string) => void,
    ) => void;
  };
  summary: { evaluate: (callback: (result: unknown, error?: string) => void) => void };
  soilHistogram: { evaluate: (callback: (result: unknown, error?: string) => void) => void };
  landCoverHistogram: { evaluate: (callback: (result: unknown, error?: string) => void) => void };
}

export class FloodAnalysisServiceError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 503 = 503,
  ) {
    super(message);
    this.name = 'FloodAnalysisServiceError';
  }
}

const inFlight = new Map<string, Promise<FloodAnalysisResult>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseGeometry(value: AoiGeometry | string): AoiGeometry {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new FloodAnalysisServiceError('Stored boundary geometry is invalid');
    }
  }
  if (!isRecord(parsed) || (parsed.type !== 'Polygon' && parsed.type !== 'MultiPolygon')) {
    throw new FloodAnalysisServiceError('Stored boundary geometry must be Polygon or MultiPolygon');
  }
  if (!Array.isArray(parsed.coordinates)) {
    throw new FloodAnalysisServiceError('Stored boundary geometry has invalid coordinates');
  }
  return parsed as unknown as AoiGeometry;
}

function asFiniteNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new FloodAnalysisServiceError(`Earth Engine result is missing ${key}`);
  }
  return numeric;
}

function readHistogram(value: unknown, key: string): Record<string, number> {
  if (!isRecord(value) || !isRecord(value[key])) return {};
  return Object.fromEntries(
    Object.entries(value[key]).flatMap(([classCode, count]) => {
      const numeric = typeof count === 'number' ? count : Number(count);
      return Number.isFinite(numeric) ? [[classCode, numeric]] : [];
    }),
  );
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toBreakdown(
  means: Record<string, unknown>,
  soilHistogram: unknown,
  landCoverHistogram: unknown,
  weights: FloodWeights,
): NumericAnalysis {
  const rainfallSusceptibility = clampUnit(asFiniteNumber(means, 'rainfall_susceptibility'));
  const slopeSusceptibility = clampUnit(asFiniteNumber(means, 'slope_susceptibility'));
  const soilSusceptibility = clampUnit(asFiniteNumber(means, 'soil_susceptibility'));
  const landCoverSusceptibility = clampUnit(asFiniteNumber(means, 'land_cover_susceptibility'));
  const score = Number((clampUnit(asFiniteNumber(means, 'flood_risk')) * 100).toFixed(4));

  return {
    score,
    criteriaBreakdown: {
      rainfall: {
        raw: Number(asFiniteNumber(means, 'rainfall_raw').toFixed(4)),
        normalized: rainfallSusceptibility,
        susceptibility: rainfallSusceptibility,
        weight: weights.rainfall,
        contribution: Number((rainfallSusceptibility * weights.rainfall).toFixed(6)),
      },
      slope: {
        raw: Number(asFiniteNumber(means, 'slope_raw').toFixed(4)),
        normalized: slopeSusceptibility,
        susceptibility: slopeSusceptibility,
        weight: weights.slope,
        contribution: Number((slopeSusceptibility * weights.slope).toFixed(6)),
      },
      soil: {
        raw: readHistogram(soilHistogram, 'soil_raw'),
        normalized: soilSusceptibility,
        susceptibility: soilSusceptibility,
        weight: weights.soil,
        contribution: Number((soilSusceptibility * weights.soil).toFixed(6)),
      },
      land_cover: {
        raw: readHistogram(landCoverHistogram, 'land_cover_raw'),
        normalized: landCoverSusceptibility,
        susceptibility: landCoverSusceptibility,
        weight: weights.land_cover,
        contribution: Number((landCoverSusceptibility * weights.land_cover).toFixed(6)),
      },
    },
  };
}

async function getBoundary(kecamatanId: string): Promise<AnalysisBoundary> {
  const boundary = await getDatabaseRepositories().boundaries.findAnalysisBoundary(kecamatanId);
  if (!boundary || boundary.level !== 'kecamatan') {
    throw new FloodAnalysisServiceError('Kecamatan boundary not found', 404);
  }
  return boundary;
}

function getDatasetVersion(boundary: AnalysisBoundary): string {
  const soilVersion = process.env.GEE_SOIL_DATASET_VERSION || 'p4i-soil-unvalidated-v1';
  const demVersion = process.env.GEE_DEM_DATASET_VERSION || 'usgs-srtmgl1-003';
  return [
    FLOOD_DATASET_VERSION_BASE,
    `dem:${demVersion}`,
    `soil:${soilVersion}`,
    `boundary:${boundary.source}@${boundary.source_version}`,
  ].join('+');
}

function buildThresholdExpression(
  variable: string,
  thresholds: ReadonlyArray<{ maximum: number; value: number }>,
): string {
  return thresholds.reduceRight((fallback, threshold) => (
    Number.isFinite(threshold.maximum)
      ? `${variable} <= ${threshold.maximum} ? ${threshold.value} : (${fallback})`
      : String(threshold.value)
  ), '0.5');
}

async function buildImageGraph(
  geometry: AoiGeometry,
  input: FloodAnalysisInput,
): Promise<FloodImageGraph> {
  const ee = await initializeEarthEngine();
  const soilAssetId = process.env.GEE_SOIL_ASSET_ID;
  if (!soilAssetId) throw new FloodAnalysisServiceError('GEE_SOIL_ASSET_ID is not configured');
  const soilBand = process.env.GEE_SOIL_BAND || 'soil_class';
  const aoi = ee.Geometry(geometry as unknown as Record<string, unknown>);

  const rainfallRaw = ee
    .ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate(input.period.start, toEarthEngineExclusiveEnd(input.period))
    .filterBounds(aoi)
    .select('precipitation')
    .sum()
    .rename('rainfall_raw');
  const rainfallSusceptibility = rainfallRaw
    .expression(
      buildThresholdExpression(
        'rainfall',
        RAINFALL_SUSCEPTIBILITY.map((threshold) => ({
          maximum: threshold.maxMm,
          value: threshold.value,
        })),
      ),
      { rainfall: rainfallRaw },
    )
    .rename('rainfall_susceptibility');

  const demAssetId = process.env.GEE_DEM_ASSET_ID || 'USGS/SRTMGL1_003';
  const demBand = process.env.GEE_DEM_BAND || 'elevation';
  const slopeRaw = ee.Terrain.slope(
    ee.Image(demAssetId).select(demBand),
  ).rename('slope_raw');
  const slopeSusceptibility = slopeRaw
    .expression(
      buildThresholdExpression(
        'slope',
        SLOPE_SUSCEPTIBILITY.map((threshold) => ({
          maximum: threshold.maxDegrees,
          value: threshold.value,
        })),
      ),
      { slope: slopeRaw },
    )
    .rename('slope_susceptibility');

  const soilRaw = ee.Image(soilAssetId).select(soilBand).rename('soil_raw');
  const soilCodes = Object.keys(SOIL_CLASS_SUSCEPTIBILITY).map(Number);
  const soilValues = soilCodes.map((code) => SOIL_CLASS_SUSCEPTIBILITY[code]);
  const soilSusceptibility = soilRaw
    .remap(soilCodes, soilValues)
    .rename('soil_susceptibility');

  const landCoverRaw = ee
    .Image(ee.ImageCollection('ESA/WorldCover/v200').first())
    .select('Map')
    .rename('land_cover_raw');
  const landCoverCodes = Object.keys(LAND_COVER_SUSCEPTIBILITY).map(Number);
  const landCoverValues = landCoverCodes.map((code) => LAND_COVER_SUSCEPTIBILITY[code]);
  const landCoverSusceptibility = landCoverRaw
    .remap(landCoverCodes, landCoverValues)
    .rename('land_cover_susceptibility');

  const riskImage = rainfallSusceptibility
    .multiply(input.weights.rainfall)
    .add(slopeSusceptibility.multiply(input.weights.slope))
    .add(soilSusceptibility.multiply(input.weights.soil))
    .add(landCoverSusceptibility.multiply(input.weights.land_cover))
    .rename('flood_risk')
    .clip(aoi);

  const summaryImage = rainfallRaw
    .addBands(rainfallSusceptibility)
    .addBands(slopeRaw)
    .addBands(slopeSusceptibility)
    .addBands(soilSusceptibility)
    .addBands(landCoverSusceptibility)
    .addBands(riskImage);
  const reduceParameters = {
    geometry: aoi,
    scale: 250,
    maxPixels: 1_000_000_000,
    bestEffort: true,
    tileScale: 4,
  };

  return {
    riskImage,
    summary: summaryImage.reduceRegion({ ...reduceParameters, reducer: ee.Reducer.mean() }),
    soilHistogram: soilRaw.reduceRegion({
      ...reduceParameters,
      reducer: ee.Reducer.frequencyHistogram(),
    }),
    landCoverHistogram: landCoverRaw.reduceRegion({
      ...reduceParameters,
      reducer: ee.Reducer.frequencyHistogram(),
    }),
  };
}

async function generateTile(graph: FloodImageGraph): Promise<{ url: string; expiresAt: string }> {
  const url = await getEeMapUrl(graph.riskImage, {
    min: 0,
    max: 1,
    palette: ['1a9850', '91cf60', 'fee08b', 'fc8d59', 'd73027'],
  });
  return { url, expiresAt: new Date(Date.now() + TILE_TOKEN_TTL_MS).toISOString() };
}

async function computeNumeric(graph: FloodImageGraph, weights: FloodWeights): Promise<NumericAnalysis> {
  const [summary, soilHistogram, landCoverHistogram] = await Promise.all([
    evaluateEeObject(graph.summary),
    evaluateEeObject(graph.soilHistogram),
    evaluateEeObject(graph.landCoverHistogram),
  ]);
  if (!isRecord(summary)) {
    throw new FloodAnalysisServiceError('Earth Engine returned an invalid summary');
  }
  return toBreakdown(summary, soilHistogram, landCoverHistogram, weights);
}

async function runFloodAnalysis(
  input: FloodAnalysisInput,
  computedBy: string,
  boundary: AnalysisBoundary,
  datasetVersion: string,
  cacheKey: string,
): Promise<FloodAnalysisResult> {
  const nowIso = new Date().toISOString();
  const cachedData = await getDatabaseRepositories().flood.findValidCached(cacheKey, nowIso);

  const geometry = parseGeometry(boundary.geometry);
  const graph = await buildImageGraph(geometry, input);
  if (cachedData) {
    const tile = await generateTile(graph);
    const cached = cachedData as CachedFloodResult;
    return {
      kecamatan_id: boundary.id,
      kecamatan_name: boundary.nama,
      score: Number(cached.score),
      classification: cached.classification,
      criteria_breakdown: cached.criteria_breakdown,
      weights_used: input.weights,
      model_version: FLOOD_MODEL_VERSION,
      dataset_version: datasetVersion,
      period: input.period,
      tile_url_template: tile.url,
      tile_expires_at: tile.expiresAt,
      computed_at: cached.computed_at,
      expires_at: cached.expires_at,
      cache_status: 'hit',
    };
  }

  const [tile, numeric] = await Promise.all([
    generateTile(graph),
    computeNumeric(graph, input.weights),
  ]);
  const computedAt = new Date();
  const expiresAt = new Date(computedAt.getTime() + NUMERIC_CACHE_TTL_MS);
  const classification = classifyFloodScore(numeric.score);
  await getDatabaseRepositories().flood.upsert({
      cacheKey,
      kecamatanId: boundary.id,
      modelVersion: FLOOD_MODEL_VERSION,
      datasetVersion,
      periodStart: input.period.start,
      periodEnd: input.period.end,
      criteriaWeights: input.weights,
      criteriaBreakdown: numeric.criteriaBreakdown,
      score: numeric.score,
      classification,
      computedBy,
      computedAt: computedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

  return {
    kecamatan_id: boundary.id,
    kecamatan_name: boundary.nama,
    score: numeric.score,
    classification,
    criteria_breakdown: numeric.criteriaBreakdown,
    weights_used: input.weights,
    model_version: FLOOD_MODEL_VERSION,
    dataset_version: datasetVersion,
    period: input.period,
    tile_url_template: tile.url,
    tile_expires_at: tile.expiresAt,
    computed_at: computedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    cache_status: 'miss',
  };
}

export async function analyzeFloodRisk(
  input: FloodAnalysisInput,
  computedBy: string,
): Promise<FloodAnalysisResult> {
  const boundary = await getBoundary(input.kecamatan_id);
  const datasetVersion = getDatasetVersion(boundary);
  const identity = buildFloodCacheIdentity({
    kecamatanId: input.kecamatan_id,
    weights: input.weights,
    modelVersion: FLOOD_MODEL_VERSION,
    datasetVersion,
    period: input.period,
  });
  const cacheKey = createHash('sha256').update(identity).digest('hex');
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const operation = runFloodAnalysis(input, computedBy, boundary, datasetVersion, cacheKey).finally(
    () => inFlight.delete(cacheKey),
  );
  inFlight.set(cacheKey, operation);
  return operation;
}
