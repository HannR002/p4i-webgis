import type { VectorAnalysisProposal } from "./vectorAnalysis";
import type {
  ComputeToolRequest,
  ComputeJob,
  ComputeCostClass,
} from "./computeContracts";
import type {
  Dataset,
  GisContext,
  MapAction,
  MapRecipe,
  PixelSample,
  RasterMetadata,
  RasterStyle,
  RasterOperation,
  VectorStyle,
} from "./contracts";
import type { GISAnalysisConfiguration } from "./analysisContracts";
import type { AnalysisConfigurationToolRequest } from "./analysisTools";
import type { PixelQuery } from "./rasterValidation";
export type MapRecipeAction = MapAction;
export type GISIntent =
  | "build-map"
  | "modify-map"
  | "read-map"
  | "analysis-configuration"
  | "unsupported";
export type GISToolRequest =
  | VectorAnalysisProposal
  | ComputeToolRequest
  | MapRecipeAction
  | { tool: "styleLayer"; layerId: string; style: RasterStyle | VectorStyle }
  | { tool: "changeLayerOpacity"; layerId: string; opacity: number }
  | { tool: "searchDatasetCatalog"; query: string; type?: "raster" | "vector" }
  | { tool: "listAvailableLayers" }
  | { tool: "getDatasetMetadata"; datasetId: string }
  | { tool: "summarizeCurrentMap" }
  | { tool: "prepareClientDeliverableDraft" }
  | ({ tool: "inspectPixel" } & PixelQuery)
  | Exclude<
      AnalysisConfigurationToolRequest,
      { tool: "prepareConfiguredAnalysis" }
    >
  | { tool: "prepareAnalysis"; configurationId: string }
  | { tool: "applyAnalysisConfiguration"; configurationId: string }
  | { tool: "requestConfigurationSave"; configurationId: string }
  | { tool: "publishMap" }
  | { tool: "runFloodAnalysis" };
export type GISToolName = GISToolRequest["tool"];
export type GISRisk =
  "read" | "map-session" | "session-draft" | "approval-required";
export interface GISToolDefinition {
  name: GISToolName;
  level: GISRisk;
  costClass: ComputeCostClass;
  description: string;
  available: boolean;
}
export type GISToolRegistry = Readonly<Record<GISToolName, GISToolDefinition>>;
export interface GISToolCall {
  id: string;
  action: GISToolRequest;
}
export interface AIProviderDescriptor {
  id: string;
  mode: "demo" | "real";
}
export interface GISExecutionPlan {
  schemaVersion: 1;
  id: string;
  provider: AIProviderDescriptor;
  intent: GISIntent;
  resolution: "ready" | "needs-input" | "unsupported";
  message: string;
  steps: GISToolCall[];
  limitations: string[];
}
export interface GISDatasetInfo {
  id: string;
  title: string;
  type: Dataset["type"];
  status: Dataset["status"];
  accessTier: Dataset["accessTier"];
  source: string;
  provider: string;
  license: string;
  version: string;
  provenance: string;
  raster: RasterMetadata | null;
}
export interface GISConfigurationSummary {
  id: string;
  name: string;
  analysisType: GISAnalysisConfiguration["analysisType"];
  version: number;
  experimental: true;
}
export interface GISPlanningInput {
  selectedVectorIds?: string[];
  prompt: string;
  recipe: MapRecipe;
  catalog: readonly GISDatasetInfo[];
  configurations: readonly GISAnalysisConfiguration[];
  aois: readonly NonNullable<MapRecipe["aoi"]>[];
}
export interface AIProvider extends AIProviderDescriptor {
  plan(input: GISPlanningInput, signal?: AbortSignal): Promise<unknown>;
}
export type GISResultData =
  | { kind: "vector-analysis-preparation"; proposal: VectorAnalysisProposal }
  | { kind: "compute"; job: ComputeJob }
  | { kind: "datasets"; datasets: GISDatasetInfo[] }
  | { kind: "metadata"; dataset: GISDatasetInfo }
  | { kind: "summary"; title: string; layerCount: number; aoi: string | null }
  | { kind: "map-change"; action: MapAction | null }
  | { kind: "pixels"; samples: PixelSample[] }
  | { kind: "configurations"; configurations: GISConfigurationSummary[] }
  | {
      kind: "configuration";
      configuration: GISAnalysisConfiguration;
      disposition: "selection" | "draft";
    }
  | {
      kind: "preparation";
      configuration: GISAnalysisConfiguration;
      request: RasterOperation | null;
      reason: string;
      executable: boolean;
    };
export interface GISActionResult {
  stepId: string;
  tool: GISToolName;
  summary: string;
  data: GISResultData;
}
export interface GISExecutionTrace {
  id: string;
  planId: string;
  provider: AIProviderDescriptor;
  status: GISRunStatus;
  elapsedMs: number;
  entries: {
    stepId: string;
    tool: GISToolName;
    level: GISRisk;
    status: "completed" | "preview" | "approval-required";
    summary: string;
  }[];
}
export type GISRunStatus =
  "completed" | "preview" | "needs-input" | "unsupported" | "approval-required";
export interface GISApprovalRequest {
  tool: "requestConfigurationSave" | "publishMap" | "runFloodAnalysis";
  supported: boolean;
  reason: string;
  configuration: GISAnalysisConfiguration | null;
}
export interface GISRunResponse {
  schemaVersion: 1;
  status: GISRunStatus;
  plan: GISExecutionPlan;
  trace: GISExecutionTrace;
  recipe: MapRecipe;
  changed: boolean;
  results: GISActionResult[];
  approval: GISApprovalRequest | null;
}
export interface GISExecutionContext {
  catalog: readonly Dataset[];
  context: GisContext;
  mode: "demo" | "available" | "unavailable";
  configurations: readonly GISAnalysisConfiguration[];
}
export const COPILOT_LIMITS = Object.freeze({
  planningBytes: 131072,
  steps: 16,
  pixelSamples: 8,
  configurations: 32,
  catalogResults: 50,
  planBytes: 32768,
  resultBytes: 65536,
  responseBytes: 262144,
  plannerMs: 5000,
  executionMs: 10000,
});
