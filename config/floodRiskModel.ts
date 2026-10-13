import {
  FLOOD_CRITERIA,
  type AnalysisPeriod,
  type FloodClassification,
  type FloodWeights,
} from '../types/flood';

export const FLOOD_MODEL_VERSION = 'p4i-flood-wlc-v1.0.0';
export const FLOOD_DATASET_VERSION_BASE =
  'chirps-daily+esa-worldcover-v200';

export const DEFAULT_FLOOD_WEIGHTS: FloodWeights = Object.freeze({
  rainfall: 0.35,
  slope: 0.25,
  soil: 0.2,
  land_cover: 0.2,
});

export const NUMERIC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TILE_TOKEN_TTL_MS = 45 * 60 * 1000;
export const WEIGHT_TOTAL_TOLERANCE = 1e-6;
export const MAX_ANALYSIS_PERIOD_DAYS = 366;

// Experimental defaults, not official P4I scientific thresholds.
// Scientific methodology validation is postponed; it is not an execution workflow.
// TODO(P4I-GIS-VALIDATION): replace with locally calibrated susceptibility.
export const RAINFALL_SUSCEPTIBILITY = [
  { maxMm: 500, value: 0.1 },
  { maxMm: 1000, value: 0.3 },
  { maxMm: 1500, value: 0.5 },
  { maxMm: 2000, value: 0.7 },
  { maxMm: 3000, value: 0.9 },
  { maxMm: Number.POSITIVE_INFINITY, value: 1 },
] as const;

// Flat terrain receives higher flood susceptibility; steep terrain is not
// blindly treated as increasingly flood-prone.
export const SLOPE_SUSCEPTIBILITY = [
  { maxDegrees: 2, value: 1 },
  { maxDegrees: 5, value: 0.8 },
  { maxDegrees: 15, value: 0.5 },
  { maxDegrees: 30, value: 0.25 },
  { maxDegrees: Number.POSITIVE_INFINITY, value: 0.1 },
] as const;

// TEMPORARY P4I soil class mapping until the GIS team supplies the approved
// asset legend and hydrologic-soil susceptibility table.
export const SOIL_CLASS_SUSCEPTIBILITY: Readonly<Record<number, number>> = {
  1: 0.2,
  2: 0.45,
  3: 0.7,
  4: 0.9,
};

// ESA WorldCover v200 class codes explicitly reclassified to flood
// susceptibility. Values are provisional, not scientific findings.
export const LAND_COVER_SUSCEPTIBILITY: Readonly<Record<number, number>> = {
  10: 0.25, // tree cover
  20: 0.35, // shrubland
  30: 0.45, // grassland
  40: 0.65, // cropland
  50: 0.85, // built-up
  60: 0.3,  // bare / sparse vegetation
  70: 0.1,  // snow and ice
  80: 1,    // permanent water
  90: 0.95, // herbaceous wetland
  95: 0.9,  // mangroves
  100: 0.7, // moss and lichen
};

export class FloodInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FloodInputError';
  }
}

export interface FloodAnalysisInput {
  kecamatan_id: string;
  weights: FloodWeights;
  period: AnalysisPeriod;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getDefaultAnalysisPeriod(now = new Date()): AnalysisPeriod {
  const year = now.getUTCFullYear() - 1;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function canonicalizeFloodWeights(value?: unknown): FloodWeights {
  if (value === undefined) return { ...DEFAULT_FLOOD_WEIGHTS };
  if (!isRecord(value)) throw new FloodInputError('weights must be an object');

  const keys = Object.keys(value).sort();
  const allowedKeys = [...FLOOD_CRITERIA].sort();
  if (keys.length !== allowedKeys.length || keys.some((key, index) => key !== allowedKeys[index])) {
    throw new FloodInputError(`weights must contain only: ${FLOOD_CRITERIA.join(', ')}`);
  }

  const raw = FLOOD_CRITERIA.map((criterion) => value[criterion]);
  if (raw.some((weight) => typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0)) {
    throw new FloodInputError('Every weight must be a finite, non-negative number');
  }

  const numeric = raw as number[];
  const total = numeric.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 1) > WEIGHT_TOTAL_TOLERANCE) {
    throw new FloodInputError('weights must total 1.0');
  }

  const normalized = numeric.map((weight) => Number((weight / total).toFixed(12)));
  normalized[normalized.length - 1] = Number(
    (1 - normalized.slice(0, -1).reduce((sum, weight) => sum + weight, 0)).toFixed(12),
  );

  return {
    rainfall: normalized[0],
    slope: normalized[1],
    soil: normalized[2],
    land_cover: normalized[3],
  };
}

export function validateAnalysisPeriod(value: unknown, now = new Date()): AnalysisPeriod {
  if (value === undefined) return getDefaultAnalysisPeriod(now);
  if (!isRecord(value) || typeof value.start !== 'string' || typeof value.end !== 'string') {
    throw new FloodInputError('period must contain ISO dates start and end');
  }
  if (!isValidIsoDate(value.start) || !isValidIsoDate(value.end)) {
    throw new FloodInputError('period dates must use YYYY-MM-DD');
  }

  const start = new Date(`${value.start}T00:00:00.000Z`);
  const end = new Date(`${value.end}T00:00:00.000Z`);
  const durationDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (durationDays < 1 || durationDays > MAX_ANALYSIS_PERIOD_DAYS) {
    throw new FloodInputError(`period must be between 1 and ${MAX_ANALYSIS_PERIOD_DAYS} days`);
  }

  return { start: value.start, end: value.end };
}

export function parseFloodAnalysisInput(value: unknown, now = new Date()): FloodAnalysisInput {
  if (!isRecord(value)) throw new FloodInputError('Request body must be a JSON object');
  const allowed = new Set(['kecamatan_id', 'weights', 'period']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new FloodInputError('Request contains unsupported fields');
  }
  if (typeof value.kecamatan_id !== 'string' || !UUID_PATTERN.test(value.kecamatan_id)) {
    throw new FloodInputError('kecamatan_id must be a valid UUID');
  }

  return {
    kecamatan_id: value.kecamatan_id,
    weights: canonicalizeFloodWeights(value.weights),
    period: validateAnalysisPeriod(value.period, now),
  };
}

export function classifyFloodScore(score: number): FloodClassification {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new FloodInputError('Flood score must be between 0 and 100');
  }
  if (score < 20) return 'very_low';
  if (score < 40) return 'low';
  if (score < 60) return 'moderate';
  if (score < 80) return 'high';
  return 'very_high';
}

export function buildFloodCacheIdentity(input: {
  kecamatanId: string;
  weights: FloodWeights;
  modelVersion: string;
  datasetVersion: string;
  period: AnalysisPeriod;
}): string {
  return JSON.stringify({
    kecamatan_id: input.kecamatanId,
    weights: FLOOD_CRITERIA.map((criterion) => [criterion, input.weights[criterion]]),
    model_version: input.modelVersion,
    dataset_version: input.datasetVersion,
    period_start: input.period.start,
    period_end: input.period.end,
  });
}

export function toEarthEngineExclusiveEnd(period: AnalysisPeriod): string {
  const end = new Date(`${period.end}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}
