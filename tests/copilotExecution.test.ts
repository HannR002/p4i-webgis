import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDemoGisProvider } from "../lib/server/gis/providers/demo";
import { getRasterProvider } from "../lib/server/gis/rasterProvider";
import {
  executeGISPlan,
  bounded,
  planningInput,
  planWithProvider,
} from "../lib/server/ai/execution";
import { createControlledDemoProvider } from "../lib/server/ai/providers/controlledDemo";
import { executeTool } from "../lib/server/ai/tools/execute";
import { emptyRecipe, DEMO_AOIS } from "../lib/gis/catalog";
import { parseGISRunResponse } from "../lib/gis/copilotValidation";
import { defaultConfiguration } from "../lib/gis/analysisConfiguration";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type {
  GISToolRequest,
  GISExecutionPlan,
} from "../lib/gis/copilotContracts";
const gis = createDemoGisProvider(),
  catalog = gis.catalog(),
  context = { role: "guest" as const, entitledProjectIds: [] };
const env = {
  catalog,
  context,
  mode: "demo" as const,
  configurations: [],
  raster: getRasterProvider(gis),
  signal: new AbortController().signal,
};
const provider = createControlledDemoProvider();
function plan(actions: GISToolRequest[]): GISExecutionPlan {
  return {
    schemaVersion: 1,
    id: "test-plan",
    provider: { id: provider.id, mode: provider.mode },
    intent: "modify-map",
    resolution: "ready",
    message: "Test plan",
    steps: actions.map((action, i) => ({ id: `step-${i}`, action })),
    limitations: [],
  };
}
afterEach(() => vi.useRealTimers());
describe("permission-aware atomic GIS execution", () => {
  it("executes a natural-language map with one reversible store commit", async () => {
    const original = emptyRecipe();
    const p = await planWithProvider(
      provider,
      planningInput(
        "Buat peta tutupan lahan area contoh Barat, tambahkan batas kecamatan dan legenda",
        original,
        env,
      ),
    );
    const r = await executeGISPlan(p, original, env);
    expect(r.changed).toBe(true);
    expect(r.recipe.aoi).toEqual(DEMO_AOIS[0]);
    expect(r.recipe.layers).toHaveLength(2);
    expect(original.layers).toHaveLength(0);
    expect(r.recipe.provenance).toBe("ai");
    expect(() => parseGISRunResponse(r, env)).not.toThrow();
    useWorkspaceStore.setState({ recipe: original, past: [], future: [] });
    useWorkspaceStore.getState().configure([...catalog], "demo", context);
    useWorkspaceStore.getState().replace(r.recipe, "Copilot");
    expect(useWorkspaceStore.getState().past).toHaveLength(1);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().recipe).toEqual(original);
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().recipe.layers).toHaveLength(2);
  });
  it("preflights all access before reads or reducer commits", async () => {
    const privateData = {
      ...catalog[1],
      id: "restricted-raster",
      accessTier: "restricted" as const,
      projectId: "p",
    };
    const e = { ...env, catalog: [...catalog, privateData] },
      runner = vi.fn(executeTool),
      original = emptyRecipe();
    const p = plan([
      { tool: "listAvailableLayers" },
      { tool: "addLayer", datasetId: privateData.id },
    ]);
    await expect(
      executeGISPlan(p, original, e, "auto", runner),
    ).rejects.toThrow(/Akses/);
    expect(runner).not.toHaveBeenCalled();
    expect(original.layers).toEqual([]);
    await expect(
      executeGISPlan(
        plan([{ tool: "getDatasetMetadata", datasetId: "invented" }]),
        original,
        e,
      ),
    ).rejects.toThrow();
    const allowed = await executeGISPlan(p, original, {
      ...e,
      context: { role: "b2b_client", entitledProjectIds: ["p"] },
    });
    expect(allowed.changed).toBe(true);
  });
  it("connects search/list/metadata as bounded authorized reads without changing history", async () => {
    const r = await executeGISPlan(
      plan([
        { tool: "searchDatasetCatalog", query: "hujan" },
        { tool: "listAvailableLayers" },
        { tool: "getDatasetMetadata", datasetId: "demo-rainfall" },
      ]),
      emptyRecipe(),
      env,
    );
    expect(r.changed).toBe(false);
    expect(r.results.map((r) => r.data.kind)).toEqual([
      "datasets",
      "datasets",
      "metadata",
    ]);
    expect(r.trace.entries).toHaveLength(3);
  });
  it("supports opacity/style/order/removal using the current reducer", async () => {
    const r = await executeGISPlan(
      plan([
        { tool: "addLayer", datasetId: "demo-rainfall" },
        {
          tool: "changeLayerOpacity",
          layerId: "layer-demo-rainfall",
          opacity: 0.2,
        },
        {
          tool: "styleLayer",
          layerId: "layer-demo-rainfall",
          style: {
            band: "daily_mean",
            min: 1,
            max: 10,
            palette: ["#000000", "#ffffff"],
          },
        },
        { tool: "reorderLayer", layerId: "layer-demo-rainfall", index: 0 },
        { tool: "generateLegend" },
      ]),
      emptyRecipe(),
      env,
    );
    expect(r.recipe.layers[0]).toMatchObject({
      opacity: 0.2,
      style: { band: "daily_mean" },
    });
    expect(r.recipe.legend[0].entries[0].label).toContain("mm/hari");
    const removed = await executeGISPlan(
      plan([{ tool: "removeLayer", layerId: "layer-demo-rainfall" }]),
      r.recipe,
      env,
    );
    expect(removed.recipe.layers).toEqual([]);
  });
  it("reads actual provider values and masked NoData through the Pixel contract", async () => {
    const action: GISToolRequest = {
      tool: "inspectPixel",
      datasetIds: ["demo-rainfall"],
      bands: { "demo-rainfall": "daily_mean" },
      coordinate: { x: 103.545, y: -1.625, crs: "EPSG:4326" },
      resampling: "nearest",
    };
    const result = await executeGISPlan(plan([action]), emptyRecipe(), env);
    expect(result.changed).toBe(false);
    const data = result.results[0].data;
    if (data.kind !== "pixels") throw Error("pixels");
    const raw = gis.sample("demo-rainfall", -1.625, 103.545);
    if (raw.status !== "ok") throw Error("fixture");
    expect(data.samples[0].value).toBeCloseTo(raw.data.value! / 365);
    const masked = await executeGISPlan(
      plan([
        {
          ...action,
          coordinate: { ...action.coordinate, x: 103.595, y: -1.575 },
        },
      ]),
      emptyRecipe(),
      env,
    );
    if (masked.results[0].data.kind === "pixels")
      expect(masked.results[0].data.samples[0]).toMatchObject({
        noData: true,
        value: null,
      });
  });
  it("requires approval for local persistence and never enables unavailable remote work", async () => {
    const c = defaultConfiguration("wlc", catalog),
      e = { ...env, configurations: [c] };
    const runner = vi.fn(executeTool),
      r = await executeGISPlan(
        plan([{ tool: "requestConfigurationSave", configurationId: c.id }]),
        emptyRecipe(),
        e,
        "auto",
        runner,
      );
    expect(r.status).toBe("approval-required");
    expect(r.approval).toMatchObject({ supported: true, configuration: c });
    expect(r.changed).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    expect(() => parseGISRunResponse(r, e)).not.toThrow();
    for (const tool of ["runFloodAnalysis", "publishMap"] as const) {
      const r = await executeGISPlan(plan([{ tool }]), emptyRecipe(), env);
      expect(r.approval?.supported).toBe(false);
      expect(r.status).toBe("approval-required");
    }
  });
  it("selects, forks and prepares experimental configs without overwriting library objects", async () => {
    const c = { ...defaultConfiguration("wlc", catalog), name: "Base" },
      before = JSON.stringify(c),
      e = { ...env, configurations: [c] };
    const r = await executeGISPlan(
      plan([
        { tool: "selectAnalysisConfiguration", id: c.id },
        {
          tool: "proposeAnalysisConfigurationChanges",
          id: c.id,
          changes: {
            weights: { bencana: 0.2, kesuburan: 0.3, kepadatan: 0.5 },
          },
        },
        { tool: "prepareAnalysis", configurationId: c.id },
      ]),
      emptyRecipe(),
      e,
    );
    const proposal = r.results[1].data;
    if (proposal.kind !== "configuration") throw Error("draft");
    expect(proposal.configuration.id).not.toBe(c.id);
    expect(proposal.configuration.experimental).toBe(true);
    expect(proposal.configuration.version).toBe(1);
    expect(JSON.stringify(c)).toBe(before);
    expect(r.changed).toBe(false);
    const applied = await executeGISPlan(
      plan([{ tool: "applyAnalysisConfiguration", configurationId: c.id }]),
      emptyRecipe(),
      e,
    );
    expect(applied.recipe.analysis?.weightMethod).toBe("manual-wlc");
  });
  it("rejects forged approval completion, stale snapshots and trace policy", async () => {
    const c = defaultConfiguration("wlc", catalog),
      e = { ...env, configurations: [c] };
    const r = await executeGISPlan(
      plan([{ tool: "requestConfigurationSave", configurationId: c.id }]),
      emptyRecipe(),
      e,
    );
    expect(() =>
      parseGISRunResponse(
        {
          ...r,
          status: "completed",
          approval: null,
          trace: { ...r.trace, status: "completed" },
        },
        e,
      ),
    ).toThrow();
    expect(() =>
      parseGISRunResponse(r, {
        ...e,
        configurations: [{ ...c, name: "Changed snapshot" }],
      }),
    ).toThrow(/Snapshot/);
    expect(() =>
      parseGISRunResponse(
        {
          ...r,
          trace: {
            ...r.trace,
            entries: r.trace.entries.map((entry) => ({
              ...entry,
              status: "completed",
            })),
          },
        },
        e,
      ),
    ).toThrow(/Trace/);
  });
  it("prepares native raster/flood requests but does not execute analysis", async () => {
    const c = {
        ...defaultConfiguration("zonal-statistics", catalog),
        selectedAOI: DEMO_AOIS[0],
      },
      raster = { ...env.raster, execute: vi.fn(env.raster.execute) };
    const r = await executeGISPlan(
      plan([{ tool: "prepareAnalysis", configurationId: c.id }]),
      emptyRecipe(),
      { ...env, raster, configurations: [c] },
    );
    expect(r.changed).toBe(false);
    expect(r.results[0].data).toMatchObject({
      kind: "preparation",
      executable: true,
      request: { operation: "zonal-statistics" },
    });
    expect(raster.execute).not.toHaveBeenCalled();
    const flood = defaultConfiguration("flood-susceptibility", catalog);
    const pending = await executeGISPlan(
      plan([{ tool: "prepareAnalysis", configurationId: flood.id }]),
      emptyRecipe(),
      { ...env, configurations: [flood] },
    );
    expect(pending.results[0].data).toMatchObject({
      kind: "preparation",
      request: null,
      executable: false,
    });
  });
  it("preview validates without running tools or mutating the recipe", async () => {
    const runner = vi.fn(executeTool),
      original = emptyRecipe(),
      r = await executeGISPlan(
        plan([{ tool: "addLayer", datasetId: "demo-rainfall" }]),
        original,
        env,
        "preview",
        runner,
      );
    expect(r.status).toBe("preview");
    expect(r.recipe).toEqual(original);
    expect(r.changed).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    expect(() => parseGISRunResponse(r, env)).not.toThrow();
  });
  it("rejects malformed tool output and hidden recipe changes without partial state", async () => {
    const original = emptyRecipe();
    const wrong = vi.fn(async () => ({
      recipe: original,
      result: {
        summary: "wrong",
        data: { kind: "pixels", samples: [{ secret: "not allowed" }] },
      },
    }));
    await expect(
      executeGISPlan(
        plan([{ tool: "summarizeCurrentMap" }]),
        original,
        env,
        "auto",
        wrong as never,
      ),
    ).rejects.toThrow(/Output tool/);
    const hidden = vi.fn(async () => ({
      recipe: { ...original, title: "Hidden change" },
      result: {
        summary: "unexpected",
        data: { kind: "summary", title: "x", layerCount: 0, aoi: null },
      },
    }));
    await expect(
      executeGISPlan(
        plan([{ tool: "summarizeCurrentMap" }]),
        original,
        env,
        "auto",
        hidden as never,
      ),
    ).rejects.toThrow(/Output tool/);
    expect(original).toEqual(emptyRecipe());
  });
  it("masks provider exception details and enforces timeout/abort budgets", async () => {
    const input = planningInput("test", emptyRecipe(), env);
    await expect(
      planWithProvider(
        {
          id: "real-test",
          mode: "real",
          plan: async () => {
            throw Error("PRIVATE_KEY_DETAILS");
          },
        },
        input,
      ),
    ).rejects.toThrow(/Provider perencana/);
    vi.useFakeTimers();
    let aborted = false;
    const pending = bounded((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise(() => {});
    }, 100);
    const rejection = expect(pending).rejects.toThrow(/waktu/);
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    expect(aborted).toBe(true);
    const abort = new AbortController();
    abort.abort();
    await expect(bounded(async () => 1, 100, abort.signal)).rejects.toThrow(
      /dibatalkan/,
    );
  });
});
