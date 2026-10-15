import type { GISAnalysisConfiguration } from './analysisContracts';
import type { MapRecipe, RasterProcessingResult } from './contracts';
export type ComputeState =
  | 'DRAFT'
  | 'ESTIMATING'
  | 'AWAITING_APPROVAL'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED';
export type ComputeCostClass =
  | 'READ_ONLY'
  | 'REVERSIBLE_MAP_ACTION'
  | 'LOW_COST_ANALYSIS'
  | 'APPROVAL_REQUIRED_ANALYSIS'
  | 'PERSISTENT_SENSITIVE_ACTION';
export type ComputeToolRequest =
  | { tool: 'runConfiguredAnalysis'; configurationId: string }
  | { tool: 'calculateArea'; aoiId: string }
  | { tool: 'calculateDistance'; points: [[number, number], [number, number]] }
  | { tool: 'spatialSelection'; point: [number, number] };
export const COMPUTE_TOOLS = [
  'runConfiguredAnalysis',
  'calculateArea',
  'calculateDistance',
  'spatialSelection',
] as const;
export interface ComputeRequest {
  schemaVersion: 1;
  operation: ComputeToolRequest;
  configuration: GISAnalysisConfiguration | null;
  projectId: string | null;
  idempotencyKey: string;
}
export interface ComputeCeiling {
  cells: number;
  providerCalls: number;
  durationMs: number;
  aoiSquareMetres: number;
}
export interface ComputeEstimate {
  costClass: ComputeCostClass;
  monetaryCost: 'LOCAL_NO_EXTERNAL_CHARGE' | 'UNKNOWN';
  ceiling: ComputeCeiling;
  adapterAvailable: boolean;
  reason: string;
}
export interface ComputeApproval {
  requestHash: string;
  requesterId: string;
  projectId: string | null;
  ceiling: ComputeCeiling;
  expiresAt: number;
  consumed: boolean;
}
export interface ComputeUsageRecord {
  attempt: number;
  startedAt: string;
  elapsedMs: number;
  reserved: ComputeCeiling;
  // These are instrumented calls, never provider billing or inferred raster cell counts.
  adapterCalls: number;
  outcome: ComputeState;
}
export interface AnalysisMapResult {
  jobId: string;
  title: string;
  summary: string;
  datasetIds: string[];
  configurationVersion: number | null;
  experimental: true;
  demo: boolean;
  provenance: string;
  createdAt: string;
  points: [number, number][];
}
export interface ComputeResult {
  artifact: AnalysisMapResult;
  raster: RasterProcessingResult | null;
  values: Record<string, number | string | null>;
  limitations: string[];
}
export interface ComputeJob {
  id: string;
  request: ComputeRequest;
  requestHash: string;
  state: ComputeState;
  history: { state: ComputeState; at: string }[];
  estimate: ComputeEstimate;
  attempt: number;
  result: ComputeResult | null;
  usage: ComputeUsageRecord[];
  error: string | null;
}
export interface ComputeExecutionAdapter {
  execute(
    request: ComputeRequest,
    recipe: MapRecipe,
    signal: AbortSignal,
  ): Promise<ComputeResult>;
}
export const COMPUTE_LIMITS = Object.freeze({
  autoCells: 1024,
  cells: 4096,
  providerCalls: 4096,
  durationMs: 5000,
  aoiSquareMetres: 2e9,
  jobsPerUser: 32,
  jobs: 128,
  ttlMs: 30 * 60 * 1000,
  approvalMs: 5 * 60 * 1000,
  attempts: 3,
});
