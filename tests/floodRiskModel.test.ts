import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOOD_WEIGHTS,
  FloodInputError,
  buildFloodCacheIdentity,
  canonicalizeFloodWeights,
  classifyFloodScore,
  parseFloodAnalysisInput,
} from '../config/floodRiskModel';

const KECAMATAN_ID = '123e4567-e89b-42d3-a456-426614174000';
const PERIOD = { start: '2025-01-01', end: '2025-12-31' };

describe('flood input validation', () => {
  it('canonicalizes omitted weights before cache identity is built', () => {
    const omitted = canonicalizeFloodWeights();
    const explicit = canonicalizeFloodWeights({
      soil: 0.2,
      rainfall: 0.35,
      land_cover: 0.2,
      slope: 0.25,
    });

    expect(omitted).toEqual(DEFAULT_FLOOD_WEIGHTS);
    expect(buildFloodCacheIdentity({
      kecamatanId: KECAMATAN_ID,
      weights: omitted,
      modelVersion: 'model-v1',
      datasetVersion: 'dataset-v1',
      period: PERIOD,
    })).toBe(buildFloodCacheIdentity({
      kecamatanId: KECAMATAN_ID,
      weights: explicit,
      modelVersion: 'model-v1',
      datasetVersion: 'dataset-v1',
      period: PERIOD,
    }));
  });

  it.each([
    [{ rainfall: 0.5, slope: 0.2, soil: 0.2, land_cover: 0.2 }],
    [{ rainfall: -0.1, slope: 0.5, soil: 0.3, land_cover: 0.3 }],
    [{ rainfall: 0.4, slope: 0.2, soil: 0.2, land_cover: 0.2, extra: 0 }],
  ])('rejects invalid weights %#', (weights) => {
    expect(() => canonicalizeFloodWeights(weights)).toThrow(FloodInputError);
  });

  it('rejects invalid IDs and non-reproducible periods', () => {
    expect(() => parseFloodAnalysisInput({ kecamatan_id: 'not-a-uuid' })).toThrow(FloodInputError);
    expect(() => parseFloodAnalysisInput({
      kecamatan_id: KECAMATAN_ID,
      period: { start: '2025-12-31', end: '2025-01-01' },
    })).toThrow(FloodInputError);
  });
});

describe('flood classification', () => {
  it.each([
    [0, 'very_low'],
    [19.999, 'very_low'],
    [20, 'low'],
    [40, 'moderate'],
    [60, 'high'],
    [80, 'very_high'],
    [100, 'very_high'],
  ] as const)('classifies %s as %s', (score, classification) => {
    expect(classifyFloodScore(score)).toBe(classification);
  });
});

