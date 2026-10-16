# Historical Earth Engine adapter — non-runtime reference

Archived verbatim from Phase 11 commit `32dbdbe896f94ca8b14c532611a0c6796e475c59`. This Markdown is not an
installable package, workspace, executable source module or deployment adapter. No SDK
is installed by the main application. Do not copy it into runtime to enable GEE.

It retains the experimental flood graph, provider calls, credential initialization and
old ambient declarations for future engineering review. These are **not validated real
analyses**. The old dependency chain remains vulnerable upstream. See
[Phase 12 activation requirements](../PHASE_12_RESIDUAL_DEPENDENCY_RESOLUTION.md).

## lib/server/earthEngine.ts

Original SHA256: `1abe74d17e5813a92571ff797b4144587e07db8a898760df7172edeb16fac724`.

```typescript
import 'server-only';

import earthEngine from '@google/earthengine';
import { requireGovernedEarthEngine } from './integration/readiness';

let initializationPromise: Promise<typeof earthEngine> | null = null;

function readServiceAccount(): Record<string, unknown> {
  const encoded = process.env.GEE_SERVICE_ACCOUNT_JSON_BASE64;
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'Earth Engine credentials are not configured (GEE_SERVICE_ACCOUNT_JSON or GEE_SERVICE_ACCOUNT_JSON_BASE64)',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Earth Engine service-account JSON is invalid');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'Earth Engine service-account credentials must be a JSON object',
    );
  }

  const credentials = parsed as Record<string, unknown>;
  if (
    typeof credentials.client_email !== 'string' ||
    typeof credentials.private_key !== 'string'
  ) {
    throw new Error(
      'Earth Engine credentials must contain client_email and private_key',
    );
  }
  return credentials;
}

export function initializeEarthEngine(): Promise<typeof earthEngine> {
  requireGovernedEarthEngine();
  if (initializationPromise) return initializationPromise;

  initializationPromise = new Promise((resolve, reject) => {
    const project = process.env.GEE_PROJECT_ID;
    if (!project) {
      reject(new Error('GEE_PROJECT_ID is not configured'));
      return;
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = readServiceAccount();
    } catch (error: unknown) {
      reject(error);
      return;
    }

    earthEngine.data.authenticateViaPrivateKey(
      credentials,
      () => {
        earthEngine.initialize(
          null,
          null,
          () => resolve(earthEngine),
          (error) => {
            initializationPromise = null;
            reject(new Error(`Earth Engine initialization failed: ${error}`));
          },
          null,
          project,
        );
      },
      (error) => {
        initializationPromise = null;
        reject(new Error(`Earth Engine authentication failed: ${error}`));
      },
    );
  });

  return initializationPromise;
}

export function evaluateEeObject(object: {
  evaluate: (callback: (result: unknown, error?: string) => void) => void;
}) {
  return new Promise<unknown>((resolve, reject) => {
    object.evaluate((result, error) => {
      if (error) reject(new Error(error));
      else resolve(result);
    });
  });
}

export function getEeMapUrl(
  image: {
    getMapId: (
      visualization: Record<string, unknown>,
      callback: (
        map: { urlFormat: string } | undefined,
        error?: string,
      ) => void,
    ) => void;
  },
  visualization: Record<string, unknown>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    image.getMapId(visualization, (map, error) => {
      if (error || !map?.urlFormat) {
        reject(new Error(error || 'Earth Engine did not return a tile URL'));
      } else {
        resolve(map.urlFormat);
      }
    });
  });
}
```

## lib/server/floodAnalysis.ts

Original SHA256: `5b8dffc2f42d408c043f6346db6d88379eb1319085ffa8a276cac8245dc4de5b`.

```typescript
import 'server-only';
import { requireGovernedEarthEngine } from './integration/readiness';
import {
  finiteFloodValue,
  unitFloodValue,
  floodHistogram,
} from './integration/floodValues';

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
import {
  evaluateEeObject,
  getEeMapUrl,
  initializeEarthEngine,
} from './earthEngine';

type AoiGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

interface NumericAnalysis {
  score: number;
  criteriaBreakdown: FloodCriteriaBreakdown;
}

interface FloodImageGraph {
  riskImage: {
    getMapId: (
      visualization: Record<string, unknown>,
      callback: (
        map: { urlFormat: string } | undefined,
        error?: string,
      ) => void,
    ) => void;
  };
  summary: {
    evaluate: (callback: (result: unknown, error?: string) => void) => void;
  };
  soilHistogram: {
    evaluate: (callback: (result: unknown, error?: string) => void) => void;
  };
  landCoverHistogram: {
    evaluate: (callback: (result: unknown, error?: string) => void) => void;
  };
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
      throw new FloodAnalysisServiceError(
        'Stored boundary geometry is invalid',
      );
    }
  }
  if (
    !isRecord(parsed) ||
    (parsed.type !== 'Polygon' && parsed.type !== 'MultiPolygon')
  ) {
    throw new FloodAnalysisServiceError(
      'Stored boundary geometry must be Polygon or MultiPolygon',
    );
  }
  if (!Array.isArray(parsed.coordinates)) {
    throw new FloodAnalysisServiceError(
      'Stored boundary geometry has invalid coordinates',
    );
  }
  return parsed as unknown as AoiGeometry;
}

function toBreakdown(
  means: Record<string, unknown>,
  soilHistogram: unknown,
  landCoverHistogram: unknown,
  weights: FloodWeights,
): NumericAnalysis {
  const rainfallSusceptibility = unitFloodValue(
    finiteFloodValue(means, 'rainfall_susceptibility'),
  );
  const slopeSusceptibility = unitFloodValue(
    finiteFloodValue(means, 'slope_susceptibility'),
  );
  const soilSusceptibility = unitFloodValue(
    finiteFloodValue(means, 'soil_susceptibility'),
  );
  const landCoverSusceptibility = unitFloodValue(
    finiteFloodValue(means, 'land_cover_susceptibility'),
  );
  const score = Number(
    (unitFloodValue(finiteFloodValue(means, 'flood_risk')) * 100).toFixed(4),
  );

  return {
    score,
    criteriaBreakdown: {
      rainfall: {
        raw: Number(finiteFloodValue(means, 'rainfall_raw').toFixed(4)),
        normalized: rainfallSusceptibility,
        susceptibility: rainfallSusceptibility,
        weight: weights.rainfall,
        contribution: Number(
          (rainfallSusceptibility * weights.rainfall).toFixed(6),
        ),
      },
      slope: {
        raw: Number(finiteFloodValue(means, 'slope_raw').toFixed(4)),
        normalized: slopeSusceptibility,
        susceptibility: slopeSusceptibility,
        weight: weights.slope,
        contribution: Number((slopeSusceptibility * weights.slope).toFixed(6)),
      },
      soil: {
        raw: floodHistogram(soilHistogram, 'soil_raw'),
        normalized: soilSusceptibility,
        susceptibility: soilSusceptibility,
        weight: weights.soil,
        contribution: Number((soilSusceptibility * weights.soil).toFixed(6)),
      },
      land_cover: {
        raw: floodHistogram(landCoverHistogram, 'land_cover_raw'),
        normalized: landCoverSusceptibility,
        susceptibility: landCoverSusceptibility,
        weight: weights.land_cover,
        contribution: Number(
          (landCoverSusceptibility * weights.land_cover).toFixed(6),
        ),
      },
    },
  };
}

async function getBoundary(kecamatanId: string): Promise<AnalysisBoundary> {
  const boundary =
    await getDatabaseRepositories().boundaries.findAnalysisBoundary(
      kecamatanId,
    );
  if (!boundary || boundary.level !== 'kecamatan') {
    throw new FloodAnalysisServiceError('Kecamatan boundary not found', 404);
  }
  return boundary;
}

function getDatasetVersion(boundary: AnalysisBoundary): string {
  const soilVersion =
    process.env.GEE_SOIL_DATASET_VERSION || 'p4i-soil-unvalidated-v1';
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
  return thresholds.reduceRight(
    (fallback, threshold) =>
      Number.isFinite(threshold.maximum)
        ? `${variable} <= ${threshold.maximum} ? ${threshold.value} : (${fallback})`
        : String(threshold.value),
    '0.5',
  );
}

async function buildImageGraph(
  geometry: AoiGeometry,
  input: FloodAnalysisInput,
): Promise<FloodImageGraph> {
  const ee = await initializeEarthEngine();
  const soilAssetId = process.env.GEE_SOIL_ASSET_ID;
  if (!soilAssetId)
    throw new FloodAnalysisServiceError('GEE_SOIL_ASSET_ID is not configured');
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
  const landCoverValues = landCoverCodes.map(
    (code) => LAND_COVER_SUSCEPTIBILITY[code],
  );
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
    maxPixels: 1_000_000,
    bestEffort: false,
    crs: 'EPSG:4326',
    tileScale: 4,
  };

  return {
    riskImage,
    summary: summaryImage.reduceRegion({
      ...reduceParameters,
      reducer: ee.Reducer.mean(),
    }),
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

async function generateTile(
  graph: FloodImageGraph,
): Promise<{ url: string; expiresAt: string }> {
  const url = await getEeMapUrl(graph.riskImage, {
    min: 0,
    max: 1,
    palette: ['1a9850', '91cf60', 'fee08b', 'fc8d59', 'd73027'],
  });
  return {
    url,
    expiresAt: new Date(Date.now() + TILE_TOKEN_TTL_MS).toISOString(),
  };
}

async function computeNumeric(
  graph: FloodImageGraph,
  weights: FloodWeights,
): Promise<NumericAnalysis> {
  const [summary, soilHistogram, landCoverHistogram] = await Promise.all([
    evaluateEeObject(graph.summary),
    evaluateEeObject(graph.soilHistogram),
    evaluateEeObject(graph.landCoverHistogram),
  ]);
  if (!isRecord(summary)) {
    throw new FloodAnalysisServiceError(
      'Earth Engine returned an invalid summary',
    );
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
  const cachedData = await getDatabaseRepositories().flood.findValidCached(
    cacheKey,
    nowIso,
  );

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
  requireGovernedEarthEngine();
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

  const operation = runFloodAnalysis(
    input,
    computedBy,
    boundary,
    datasetVersion,
    cacheKey,
  ).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, operation);
  return operation;
}
```

## types/earthengine.d.ts

Original SHA256: `923d4f43a96196557fc9e2431134497eb7bf461a40141538ed66ed86d863c9e1`.

```typescript
declare module '@google/earthengine' {
  interface EeComputedObject {
    evaluate(callback: (result: unknown, error?: string) => void): void;
  }

  type EeGeometry = EeComputedObject;

  type EeDictionary = EeComputedObject;

  interface EeImage extends EeComputedObject {
    select(selectors: string | string[]): EeImage;
    rename(names: string | string[]): EeImage;
    expression(expression: string, variables?: Record<string, EeImage>): EeImage;
    remap(from: number[], to: number[], defaultValue?: number): EeImage;
    multiply(value: number | EeImage): EeImage;
    add(value: number | EeImage): EeImage;
    addBands(image: EeImage): EeImage;
    clip(geometry: EeGeometry): EeImage;
    reduceRegion(parameters: Record<string, unknown>): EeDictionary;
    getMapId(
      visualization: Record<string, unknown>,
      callback: (map: EeMapId | undefined, error?: string) => void,
    ): void;
  }

  interface EeImageCollection extends EeComputedObject {
    filterDate(start: string, end: string): EeImageCollection;
    filterBounds(geometry: EeGeometry): EeImageCollection;
    select(selectors: string | string[]): EeImageCollection;
    sum(): EeImage;
    first(): EeComputedObject;
  }

  interface EeMapId {
    mapid: string;
    token: string;
    urlFormat: string;
  }

  interface EarthEngineModule {
    data: {
      authenticateViaPrivateKey(
        privateKey: Record<string, unknown>,
        success: () => void,
        failure: (error: string) => void,
      ): void;
    };
    initialize(
      apiBaseUrl: string | null,
      tileBaseUrl: string | null,
      success: () => void,
      failure: (error: string) => void,
      xsrfToken: string | null,
      project: string,
    ): void;
    Geometry(geojson: Record<string, unknown>): EeGeometry;
    Image(input: string | EeComputedObject): EeImage;
    ImageCollection(id: string): EeImageCollection;
    Terrain: {
      slope(image: EeImage): EeImage;
    };
    Reducer: {
      mean(): EeComputedObject;
      frequencyHistogram(): EeComputedObject;
    };
  }

  const earthEngine: EarthEngineModule;
  export default earthEngine;
}
```
