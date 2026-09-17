import type { GeoJsonMultiPolygon } from './geojson';

export const FLOOD_CRITERIA = ['rainfall', 'slope', 'soil', 'land_cover'] as const;
export type FloodCriterion = (typeof FLOOD_CRITERIA)[number];

export type FloodWeights = Record<FloodCriterion, number>;

export interface AnalysisPeriod {
  start: string;
  end: string;
}

export type FloodClassification =
  | 'very_low'
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high';

export interface CriterionBreakdown {
  raw: number | Record<string, number> | null;
  normalized: number;
  susceptibility: number;
  weight: number;
  contribution: number;
}

export type FloodCriteriaBreakdown = Record<FloodCriterion, CriterionBreakdown>;

export interface FloodAnalysisResult {
  kecamatan_id: string;
  kecamatan_name: string;
  score: number;
  classification: FloodClassification;
  criteria_breakdown: FloodCriteriaBreakdown;
  weights_used: FloodWeights;
  model_version: string;
  dataset_version: string;
  period: AnalysisPeriod;
  tile_url_template: string | null;
  tile_expires_at: string | null;
  computed_at: string;
  expires_at: string;
  cache_status: 'hit' | 'miss';
  warning?: string;
}

export type AdministrativeLevel = 'provinsi' | 'kota' | 'kecamatan';

export interface AdministrativeBoundaryProperties extends Record<string, unknown> {
  id: string;
  kode_wilayah: string;
  nama: string;
  level: AdministrativeLevel;
  parent_id: string | null;
  source: string;
  source_version: string;
}

export interface AdministrativeBoundaryRow extends AdministrativeBoundaryProperties {
  geojson: GeoJsonMultiPolygon;
}

