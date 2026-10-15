import { calculateAHP, type AHPResult } from './ahpCalculator';
import type {
  CriterionWeights,
  PairwisePreferences,
} from '../lib/gis/analysisContracts';

export const PREFERENCE_CRITERIA = [
  'bencana',
  'kesuburan',
  'kepadatan',
] as const;
export const DEFAULT_PAIRWISE: PairwisePreferences = {
  bencanaVsKesuburan: 1,
  bencanaVsKepadatan: 1,
  kesuburanVsKepadatan: 1,
};
export function validatePreferenceWeights(value: unknown): CriterionWeights {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Bobot tidak valid');
  const weights = value as Record<string, unknown>;
  if (
    Object.keys(weights).length !== 3 ||
    !PREFERENCE_CRITERIA.every(
      (key) =>
        typeof weights[key] === 'number' &&
        Number.isFinite(weights[key]) &&
        (weights[key] as number) >= 0 &&
        (weights[key] as number) <= 1,
    )
  )
    throw Error('Bobot harus finite, 0–1 dan memuat tiga kriteria');
  if (
    Math.abs(
      PREFERENCE_CRITERIA.reduce(
        (total, key) => total + (weights[key] as number),
        0,
      ) - 1,
    ) > 1e-6
  )
    throw Error('Total bobot harus 1 (100%)');
  return {
    bencana: weights.bencana as number,
    kesuburan: weights.kesuburan as number,
    kepadatan: weights.kepadatan as number,
  };
}
export function calculatePreferences(value: unknown): AHPResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Matriks preferensi tidak valid');
  const v = value as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_PAIRWISE);
  if (
    Object.keys(v).length !== 3 ||
    !keys.every(
      (key) =>
        typeof v[key] === 'number' &&
        Number.isFinite(v[key]) &&
        (v[key] as number) >= 1 / 9 &&
        (v[key] as number) <= 9,
    )
  )
    throw Error('Perbandingan AHP harus 1/9 sampai 9');
  const p = v as unknown as PairwisePreferences;
  return calculateAHP([
    [1, p.bencanaVsKesuburan, p.bencanaVsKepadatan],
    [1 / p.bencanaVsKesuburan, 1, p.kesuburanVsKepadatan],
    [1 / p.bencanaVsKepadatan, 1 / p.kesuburanVsKepadatan, 1],
  ]);
}
// The existing SpatialMap cost/benefit formula, shared with explicit input scenarios.
// Null inputs remain unavailable. No synthetic measurements are filled in.
export function calculateLegacyWLC(
  scores: Record<keyof CriterionWeights, number | null>,
  weights: CriterionWeights,
  constraint: 0 | 1 = 1,
): number | null {
  validatePreferenceWeights(weights);
  if (
    !PREFERENCE_CRITERIA.every(
      (key) => scores[key] !== null && Number.isFinite(scores[key]),
    )
  )
    return null;
  return (
    ((6 - scores.bencana!) * weights.bencana +
      scores.kesuburan! * weights.kesuburan +
      scores.kepadatan! * weights.kepadatan) *
    constraint
  );
}
