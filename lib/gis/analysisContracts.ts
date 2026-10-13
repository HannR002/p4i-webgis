import type {
  MapRecipe,
  RasterCoordinate,
  RasterMetadata,
  Dataset,
  RasterOperation,
} from './contracts';
import type { AHPResult } from '../../utils/ahpCalculator';

export type CriterionWeights = AHPResult['weights'];
export interface PairwisePreferences {
  bencanaVsKesuburan: number;
  bencanaVsKepadatan: number;
  kesuburanVsKepadatan: number;
}
export type ClassificationMapping =
  | {
      kind: 'intervals';
      rules: { from: number; to: number; output: number; label: string }[];
    }
  | {
      kind: 'upper-bounds';
      rules: { maxInclusive: number | null; output: number; label: string }[];
    }
  | {
      kind: 'categories';
      rules: { input: number; output: number; label: string }[];
    };
export interface AnalysisCriterion {
  id: string;
  label: string;
  datasetId: string | null;
  band: string | null;
}
export interface AnalysisSourceMetadata {
  datasetId: string;
  source: string;
  provider: string;
  license: string;
  version: string;
  provenance: string;
  raster: RasterMetadata | null;
}
interface ConfigurationBase {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  version: number;
  inputDatasetIds: string[];
  criteria: AnalysisCriterion[];
  weights: Record<string, number>;
  classificationRules: Record<string, ClassificationMapping>;
  selectedAOI: MapRecipe['aoi'];
  spatialResolution: {
    crs: string;
    resolution: RasterMetadata['resolution'];
  } | null;
  analysisPeriod: RasterMetadata['period'] | null;
  sourceMetadata: AnalysisSourceMetadata[];
  createdAt: string;
  updatedAt: string;
  notes: string;
  experimental: true;
}
export type GISAnalysisConfiguration = ConfigurationBase &
  (
    | {
        analysisType: 'ahp-smce';
        parameters: { pairwise: PairwisePreferences };
      }
    | {
        analysisType: 'wlc';
        parameters: {
          scores: Record<keyof CriterionWeights, number | null>;
          constraint: 0 | 1;
        };
      }
    | {
        analysisType: 'flood-susceptibility';
        parameters: { modelVersion: string };
      }
    | {
        analysisType: 'raster-reclassification';
        parameters: { coordinate: RasterCoordinate };
      }
    | {
        analysisType: 'zonal-statistics';
        parameters: { method: 'native-cell-centers' };
      }
    | {
        analysisType: 'raster-normalization';
        parameters: { coordinate: RasterCoordinate; min: number; max: number };
      }
    | {
        analysisType: 'raster-arithmetic';
        parameters: {
          coordinate: RasterCoordinate;
          operator: 'add' | 'subtract' | 'multiply' | 'divide';
          constant: number;
          unit: string;
        };
      }
    | { analysisType: 'clip'; parameters: { rule: 'cell-center' } }
    | { analysisType: 'mask'; parameters: { keep: 'inside' | 'outside' } }
  );
export type GISAnalysisType = GISAnalysisConfiguration['analysisType'];
export interface AnalysisConfigurationRepository {
  list(): GISAnalysisConfiguration[];
  get(id: string): GISAnalysisConfiguration | null;
  save(configuration: GISAnalysisConfiguration): GISAnalysisConfiguration;
  duplicate(configuration: GISAnalysisConfiguration): GISAnalysisConfiguration;
  delete(id: string, expectedVersion: number): void;
}
export type ConfigurationApplication =
  | {
      kind: 'preferences';
      configuration: GISAnalysisConfiguration;
      recipe: MapRecipe;
      weights: CriterionWeights;
      pairwise: PairwisePreferences | null;
    }
  | {
      kind: 'raster';
      configuration: GISAnalysisConfiguration;
      recipe: MapRecipe;
      operation: RasterOperation;
    }
  | {
      kind: 'configuration-only';
      configuration: GISAnalysisConfiguration;
      reason: string;
    };
export interface AnalysisConfigurationContext {
  catalog: readonly Dataset[];
  mode: 'demo' | 'unavailable' | 'available';
}
