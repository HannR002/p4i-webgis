import { COMPUTE_TOOLS } from "./computeContracts";
import { parseComputeTool, parseComputeJob } from "./computeValidation";
import type {
  AIProviderDescriptor,
  GISExecutionPlan,
  GISToolRequest,
  GISDatasetInfo,
  GISActionResult,
  GISRunResponse,
  GISExecutionContext,
} from "./copilotContracts";
import { COPILOT_LIMITS } from "./copilotContracts";
import {
  parseMapAction,
  parseRecipe,
  record,
  text,
  finite,
  GisInputError,
  parsePixelSample,
  validateRasterMetadata,
} from "./validation";
import {
  parsePixelQuery,
  parseRasterOperation,
  operationDatasetIds,
} from "./rasterValidation";
import { parseAnalysisConfiguration } from "./analysisConfiguration";
import { ANALYSIS_TYPES } from "./analysisConfiguration";
import { GIS_TOOL_REGISTRY } from "./copilotRegistry";
import { canAccessDataset, assertRecipeAccess } from "./recipe";
import type { Dataset } from "./contracts";
export function exact(
  v: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (Object.keys(v).some((k) => !keys.includes(k)))
    throw new GisInputError("Parameter Copilot tidak diizinkan");
}
export function byteSize(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).length;
  } catch {
    return Infinity;
  }
}
const mapTools = [
  "createMap",
  "setMapTitle",
  "setBasemap",
  "setViewport",
  "addLayer",
  "removeLayer",
  "toggleLayer",
  "reorderLayer",
  "setLayerOpacity",
  "styleVectorLayer",
  "styleRasterLayer",
  "zoomToLayer",
  "selectAOI",
  "generateLegend",
];
export function mapActionFor(request: GISToolRequest) {
  if (request.tool === "changeLayerOpacity")
    return parseMapAction({ ...request, tool: "setLayerOpacity" });
  if (request.tool === "styleLayer")
    return parseMapAction({
      ...request,
      tool:
        "palette" in request.style ? "styleRasterLayer" : "styleVectorLayer",
    });
  return mapTools.includes(request.tool) ? parseMapAction(request) : null;
}
export function parseGISToolRequest(value: unknown): GISToolRequest {
  if (
    !record(value) ||
    typeof value.tool !== "string" ||
    !Object.hasOwn(GIS_TOOL_REGISTRY, value.tool)
  )
    throw new GisInputError("Tool GIS tidak dikenal");
  const tool = value.tool;
  if ((COMPUTE_TOOLS as readonly string[]).includes(tool))
    return parseComputeTool(value);
  if (mapTools.includes(tool)) return parseMapAction(value);
  if (tool === "changeLayerOpacity") {
    exact(value, ["tool", "layerId", "opacity"]);
    return {
      ...parseMapAction({ ...value, tool: "setLayerOpacity" }),
      tool,
    } as GISToolRequest;
  }
  if (tool === "styleLayer") {
    exact(value, ["tool", "layerId", "style"]);
    if (!record(value.style)) throw new GisInputError("Style tidak valid");
    const parsed = parseMapAction({
      ...value,
      tool: "palette" in value.style ? "styleRasterLayer" : "styleVectorLayer",
    });
    return { ...parsed, tool } as GISToolRequest;
  }
  if (
    [
      "listAvailableLayers",
      "summarizeCurrentMap",
      "prepareClientDeliverableDraft",
      "listAnalysisConfigurations",
      "publishMap",
      "runFloodAnalysis",
    ].includes(tool)
  ) {
    exact(value, ["tool"]);
    return { tool } as GISToolRequest;
  }
  if (tool === "searchDatasetCatalog") {
    exact(value, ["tool", "query", "type"]);
    if (
      !text(value.query, 100) ||
      !(
        value.type === undefined ||
        ["raster", "vector"].includes(String(value.type))
      )
    )
      throw new GisInputError("Pencarian tidak valid");
    return { ...value } as unknown as GISToolRequest;
  }
  if (tool === "getDatasetMetadata") {
    exact(value, ["tool", "datasetId"]);
    if (!text(value.datasetId, 100))
      throw new GisInputError("Dataset diperlukan");
    return { tool, datasetId: value.datasetId };
  }
  if (tool === "inspectPixel") {
    const { tool: ignored, ...raw } = value;
    void ignored;
    return { tool, ...parsePixelQuery(raw) };
  }
  if (
    [
      "selectAnalysisConfiguration",
      "prepareAnalysis",
      "applyAnalysisConfiguration",
      "requestConfigurationSave",
    ].includes(tool)
  ) {
    const key =
      tool === "selectAnalysisConfiguration" ? "id" : "configurationId";
    exact(value, ["tool", key]);
    if (!text(value[key], 100))
      throw new GisInputError("ID konfigurasi diperlukan");
    return { ...value } as unknown as GISToolRequest;
  }
  if (tool === "createAnalysisConfigurationDraft") {
    exact(value, ["tool", "analysisType", "name"]);
    if (
      !ANALYSIS_TYPES.some((t) => t.type === value.analysisType) ||
      !(value.name === undefined || text(value.name, 120))
    )
      throw new GisInputError("Jenis/nama draft tidak valid");
    return { ...value } as unknown as GISToolRequest;
  }
  exact(value, ["tool", "id", "changes"]);
  if (
    !text(value.id, 100) ||
    !record(value.changes) ||
    byteSize(value.changes) > 16384
  )
    throw new GisInputError("Perubahan konfigurasi tidak valid");
  exact(value.changes, [
    "name",
    "description",
    "notes",
    "criteria",
    "parameters",
    "weights",
    "classificationRules",
    "selectedAOI",
  ]);
  return structuredClone(value) as unknown as GISToolRequest;
}
export function parseGISExecutionPlan(
  value: unknown,
  provider: AIProviderDescriptor,
): GISExecutionPlan {
  if (!record(value) || byteSize(value) > COPILOT_LIMITS.planBytes)
    throw new GisInputError("Rencana GIS tidak valid atau terlalu besar");
  exact(value, [
    "schemaVersion",
    "id",
    "provider",
    "intent",
    "resolution",
    "message",
    "steps",
    "limitations",
  ]);
  if (
    value.schemaVersion !== 1 ||
    !text(value.id, 80) ||
    !record(value.provider) ||
    value.provider.id !== provider.id ||
    value.provider.mode !== provider.mode ||
    ![
      "build-map",
      "modify-map",
      "read-map",
      "analysis-configuration",
      "unsupported",
    ].includes(String(value.intent)) ||
    !["ready", "needs-input", "unsupported"].includes(
      String(value.resolution),
    ) ||
    !text(value.message, 1500) ||
    !Array.isArray(value.steps) ||
    value.steps.length > COPILOT_LIMITS.steps ||
    !Array.isArray(value.limitations) ||
    value.limitations.length > 16 ||
    !value.limitations.every((v) => text(v, 500))
  )
    throw new GisInputError("Kontrak rencana GIS tidak valid");
  exact(value.provider, ["id", "mode"]);
  const steps = value.steps.map((s) => {
    if (!record(s) || !text(s.id, 64) || !/^[-a-zA-Z0-9_]+$/.test(s.id))
      throw new GisInputError("Langkah GIS tidak valid");
    exact(s, ["id", "action"]);
    return { id: s.id, action: parseGISToolRequest(s.action) };
  });
  if (
    new Set(steps.map((s) => s.id)).size !== steps.length ||
    (value.resolution !== "ready" && steps.length)
  )
    throw new GisInputError("Langkah GIS duplikat/tidak sesuai status");
  if (
    steps.some((s) =>
      (COMPUTE_TOOLS as readonly string[]).includes(s.action.tool),
    ) &&
    steps.length !== 1
  )
    throw new GisInputError(
      "Satu job komputasi per rencana; jangan gabungkan dengan langkah lain",
    );
  const samples = steps.reduce(
    (n, s) =>
      n + (s.action.tool === "inspectPixel" ? s.action.datasetIds.length : 0),
    0,
  );
  if (samples > COPILOT_LIMITS.pixelSamples)
    throw new GisInputError(
      "Batas sampling Copilot delapan dataset per rencana",
    );
  return {
    schemaVersion: 1,
    id: value.id,
    provider: { id: provider.id, mode: provider.mode },
    intent: value.intent as GISExecutionPlan["intent"],
    resolution: value.resolution as GISExecutionPlan["resolution"],
    message: value.message,
    steps,
    limitations: [...value.limitations] as string[],
  };
}
export function datasetInfo(d: Dataset): GISDatasetInfo {
  if (d.raster) validateRasterMetadata(d.raster);
  return {
    id: d.id,
    title: d.title.slice(0, 200),
    type: d.type,
    status: d.status,
    accessTier: d.accessTier,
    source: d.source.slice(0, 200),
    provider: d.provider.slice(0, 200),
    license: d.license.slice(0, 200),
    version: d.version.slice(0, 200),
    provenance: d.provenance.slice(0, 2000),
    raster: d.raster ? structuredClone(d.raster) : null,
  };
}
export function validateActionResult(
  value: unknown,
  stepId: string,
  tool: string,
  env: GISExecutionContext,
): GISActionResult {
  if (
    !record(value) ||
    byteSize(value) > COPILOT_LIMITS.resultBytes ||
    value.stepId !== stepId ||
    value.tool !== tool ||
    !text(value.summary, 1500) ||
    !record(value.data)
  )
    throw new GisInputError("Output tool GIS tidak valid");
  exact(value, ["stepId", "tool", "summary", "data"]);
  const d = value.data;
  const allowedKinds = (COMPUTE_TOOLS as readonly string[]).includes(tool)
    ? ["compute"]
    : tool === "inspectPixel"
      ? ["pixels"]
      : tool === "getDatasetMetadata"
        ? ["metadata"]
        : ["summarizeCurrentMap", "prepareClientDeliverableDraft"].includes(
              tool,
            )
          ? ["summary"]
          : tool === "listAnalysisConfigurations"
            ? ["configurations"]
            : [
                  "selectAnalysisConfiguration",
                  "createAnalysisConfigurationDraft",
                  "proposeAnalysisConfigurationChanges",
                ].includes(tool)
              ? ["configuration"]
              : tool === "prepareAnalysis"
                ? ["preparation"]
                : ["searchDatasetCatalog", "listAvailableLayers"].includes(tool)
                  ? ["datasets"]
                  : ["map-change"];
  if (!allowedKinds.includes(String(d.kind)))
    throw new GisInputError("Jenis output tidak sesuai tool");
  const metadata = (v: unknown) => {
    if (!record(v) || !text(v.id, 100))
      throw new GisInputError("Metadata output tidak valid");
    const source = env.catalog.find((item) => item.id === v.id);
    if (
      !source ||
      !canAccessDataset(source, env.context) ||
      JSON.stringify(v) !== JSON.stringify(datasetInfo(source))
    )
      throw new GisInputError("Metadata output tidak sesuai katalog/izin");
  };
  const config = (v: unknown) => {
    const c = parseAnalysisConfiguration(v, env.catalog);
    if (
      c.inputDatasetIds.some(
        (id) =>
          !canAccessDataset(
            env.catalog.find((d) => d.id === id)!,
            env.context,
          ),
      )
    )
      throw new GisInputError("Output konfigurasi tidak diizinkan");
    return c;
  };
  if (d.kind === "compute") {
    exact(d, ["kind", "job"]);
    const job = parseComputeJob(d.job);
    if (job.request.operation.tool !== tool)
      throw new GisInputError("Job tidak sesuai tool");
    if (job.request.configuration) config(job.request.configuration);
    if (
      job.result?.artifact.datasetIds.some((id) => {
        const source = env.catalog.find((d) => d.id === id);
        return !source || !canAccessDataset(source, env.context);
      })
    )
      throw new GisInputError("Hasil job tidak diizinkan");
  } else if (d.kind === "datasets") {
    exact(d, ["kind", "datasets"]);
    if (
      !Array.isArray(d.datasets) ||
      d.datasets.length > COPILOT_LIMITS.catalogResults
    )
      throw new GisInputError("Daftar dataset terlalu besar");
    d.datasets.forEach(metadata);
  } else if (d.kind === "metadata") {
    exact(d, ["kind", "dataset"]);
    metadata(d.dataset);
  } else if (d.kind === "summary") {
    exact(d, ["kind", "title", "layerCount", "aoi"]);
    if (
      !text(d.title) ||
      !finite(d.layerCount, 0, 30) ||
      !(d.aoi === null || text(d.aoi))
    )
      throw new GisInputError("Ringkasan tidak valid");
  } else if (d.kind === "map-change") {
    exact(d, ["kind", "action"]);
    if (d.action !== null) parseMapAction(d.action);
  } else if (d.kind === "pixels") {
    exact(d, ["kind", "samples"]);
    if (!Array.isArray(d.samples) || d.samples.length > 8)
      throw new GisInputError("Sampel terlalu besar");
    d.samples = d.samples.map((v) => {
      const s = parsePixelSample(v),
        source = env.catalog.find((item) => item.id === s.datasetId);
      if (!source || !canAccessDataset(source, env.context))
        throw new GisInputError("Sampel tidak diizinkan");
      return s;
    });
  } else if (d.kind === "configuration") {
    exact(d, ["kind", "configuration", "disposition"]);
    config(d.configuration);
    if (!["selection", "draft"].includes(String(d.disposition)))
      throw new GisInputError("Draft tidak valid");
  } else if (d.kind === "configurations") {
    exact(d, ["kind", "configurations"]);
    if (!Array.isArray(d.configurations) || d.configurations.length > 32)
      throw new GisInputError("Daftar konfigurasi terlalu besar");
    d.configurations.forEach((v) => {
      if (
        !record(v) ||
        !text(v.id, 100) ||
        !text(v.name, 120) ||
        !ANALYSIS_TYPES.some((t) => t.type === v.analysisType) ||
        !finite(v.version, 1, 1e6) ||
        v.experimental !== true
      )
        throw new GisInputError("Ringkasan konfigurasi tidak valid");
      exact(v, ["id", "name", "analysisType", "version", "experimental"]);
      const source = env.configurations.find((c) => c.id === v.id);
      if (
        !source ||
        source.name !== v.name ||
        source.analysisType !== v.analysisType ||
        source.version !== v.version
      )
        throw new GisInputError("Identitas konfigurasi output tidak sesuai");
      config(source);
    });
  } else if (d.kind === "preparation") {
    exact(d, ["kind", "configuration", "request", "reason", "executable"]);
    const c = config(d.configuration);
    if (!text(d.reason, 1500) || typeof d.executable !== "boolean")
      throw new GisInputError("Persiapan tidak valid");
    if (d.request !== null) {
      const op = parseRasterOperation(d.request);
      if (operationDatasetIds(op).some((id) => !c.inputDatasetIds.includes(id)))
        throw new GisInputError("Input persiapan tidak sesuai konfigurasi");
    }
  } else throw new GisInputError("Jenis output tool tidak dikenal");
  // Return only the validated, bounded DTO. Handlers are server-owned, not planner-provided code.
  return structuredClone(value) as unknown as GISActionResult;
}
export function parseGISRunResponse(
  value: unknown,
  env: GISExecutionContext,
  expectedProvider: AIProviderDescriptor = {
    id: "deterministic-demo",
    mode: "demo",
  },
): GISRunResponse {
  if (
    !record(value) ||
    byteSize(value) > COPILOT_LIMITS.responseBytes ||
    value.schemaVersion !== 1 ||
    typeof value.changed !== "boolean" ||
    ![
      "completed",
      "preview",
      "needs-input",
      "unsupported",
      "approval-required",
    ].includes(String(value.status)) ||
    !Array.isArray(value.results) ||
    value.results.length > 16 ||
    !record(value.plan) ||
    !record(value.trace)
  )
    throw new GisInputError("Respons Copilot tidak valid");
  exact(value, [
    "schemaVersion",
    "status",
    "plan",
    "trace",
    "recipe",
    "changed",
    "results",
    "approval",
  ]);
  const plan = parseGISExecutionPlan(value.plan, expectedProvider);
  const needsApproval = plan.steps.some(
    (s) => GIS_TOOL_REGISTRY[s.action.tool].level === "approval-required",
  );
  if (
    plan.resolution !== "ready"
      ? value.status !== plan.resolution
      : needsApproval
        ? value.status !== "approval-required"
        : !["completed", "preview"].includes(String(value.status))
  )
    throw new GisInputError("Status rencana tidak sesuai kebijakan eksekusi");
  const recipe = parseRecipe(value.recipe, env.catalog);
  assertRecipeAccess(recipe, env.catalog, env.context);
  const trace = value.trace;
  exact(trace, ["id", "planId", "provider", "status", "elapsedMs", "entries"]);
  if (
    !text(trace.id, 100) ||
    trace.planId !== plan.id ||
    trace.status !== value.status ||
    !finite(trace.elapsedMs, 0, 1e7) ||
    !record(trace.provider) ||
    trace.provider.id !== plan.provider.id ||
    trace.provider.mode !== plan.provider.mode ||
    !Array.isArray(trace.entries) ||
    trace.entries.length !== plan.steps.length
  )
    throw new GisInputError("Trace tidak valid");
  exact(trace.provider, ["id", "mode"]);
  trace.entries.forEach((entry, i) => {
    const step = plan.steps[i];
    if (
      !record(entry) ||
      entry.stepId !== step.id ||
      entry.tool !== step.action.tool ||
      entry.level !== GIS_TOOL_REGISTRY[step.action.tool].level ||
      entry.status !==
        (value.status === "completed"
          ? "completed"
          : value.status === "approval-required"
            ? "approval-required"
            : "preview") ||
      !text(entry.summary, 1500)
    )
      throw new GisInputError("Trace tool tidak valid");
    exact(entry, ["stepId", "tool", "level", "status", "summary"]);
  });
  const results = value.results.map((r, i) => {
    const step = plan.steps[i];
    if (!step) throw new GisInputError("Output ekstra");
    return validateActionResult(r, step.id, step.action.tool, env);
  });
  if (
    value.status === "completed"
      ? results.length !== plan.steps.length
      : results.length > 0 || value.changed
  )
    throw new GisInputError("Status/output eksekusi tidak konsisten");
  if ((value.status === "approval-required") !== (value.approval !== null))
    throw new GisInputError("Status persetujuan tidak konsisten");
  if (value.approval !== null) {
    const a = value.approval;
    if (
      !record(a) ||
      !["requestConfigurationSave", "publishMap", "runFloodAnalysis"].includes(
        String(a.tool),
      ) ||
      typeof a.supported !== "boolean" ||
      !text(a.reason, 1500)
    )
      throw new GisInputError("Persetujuan tidak valid");
    exact(a, ["tool", "supported", "reason", "configuration"]);
    if (a.configuration !== null)
      parseAnalysisConfiguration(a.configuration, env.catalog);
    const step = plan.steps.find((s) => s.action.tool === a.tool);
    if (!step || a.supported !== GIS_TOOL_REGISTRY[step.action.tool].available)
      throw new GisInputError("Persetujuan tidak sesuai kebijakan registry");
    if (a.tool === "requestConfigurationSave") {
      const id =
        "configurationId" in step.action ? step.action.configurationId : null;
      const source = env.configurations.find((c) => c.id === id);
      if (!source || JSON.stringify(source) !== JSON.stringify(a.configuration))
        throw new GisInputError("Snapshot persetujuan tidak sesuai konteks");
    } else if (a.configuration !== null)
      throw new GisInputError("Payload persetujuan tidak didukung");
  }
  return { ...value, plan, recipe, results } as unknown as GISRunResponse;
}
