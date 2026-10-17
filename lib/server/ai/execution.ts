import { SafeProviderError } from './providerError';
import { applyComputeJob } from '../../gis/computeMap';
import 'server-only';
import type {
  AIProvider,
  GISExecutionContext,
  GISExecutionPlan,
  GISRunResponse,
  GISPlanningInput,
} from '../../gis/copilotContracts';
import { COPILOT_LIMITS } from '../../gis/copilotContracts';
import { GIS_TOOL_REGISTRY } from '../../gis/copilotRegistry';
import {
  byteSize,
  datasetInfo,
  parseGISExecutionPlan,
  validateActionResult,
  mapActionFor,
} from '../../gis/copilotValidation';
import { parseRecipe, GisInputError } from '../../gis/validation';
import {
  assertRecipeAccess,
  canAccessDataset,
  GisPermissionError,
} from '../../gis/recipe';
import { parseAnalysisConfiguration } from '../../gis/analysisConfiguration';
import { DEMO_AOIS } from '../../gis/catalog';
import type { MapRecipe } from '../../gis/contracts';
import {
  executeTool,
  preflightTool,
  requireConfiguration,
  type ToolEnvironment,
} from './tools/execute';
export class AIProviderError extends Error {}
export async function bounded<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (error: Error) => void = () => {};
  const abort = () => {
    controller.abort();
    rejectAbort(new AIProviderError('Permintaan Copilot dibatalkan'));
  };
  try {
    if (signal?.aborted)
      throw new AIProviderError('Permintaan Copilot dibatalkan');
    signal?.addEventListener('abort', abort, { once: true });
    const deadline = new Promise<never>((_, reject) => {
      rejectAbort = reject;
      timer = setTimeout(() => {
        controller.abort();
        reject(new AIProviderError('Batas waktu Copilot terlampaui'));
      }, ms);
    });
    return await Promise.race([
      Promise.resolve().then(() => task(controller.signal)),
      deadline,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
export function planningInput(
  prompt: string,
  recipe: MapRecipe,
  env: GISExecutionContext,
): GISPlanningInput {
  if (env.configurations.length > COPILOT_LIMITS.configurations)
    throw new GisInputError('Terlalu banyak konfigurasi konteks');
  const catalog = env.catalog
    .filter((d) => canAccessDataset(d, env.context))
    .slice(0, COPILOT_LIMITS.catalogResults);
  const configurations = env.configurations.map((c) => {
    const parsed = parseAnalysisConfiguration(c, env.catalog);
    for (const id of parsed.inputDatasetIds) {
      const d = env.catalog.find((d) => d.id === id);
      if (!d || !canAccessDataset(d, env.context))
        throw new GisInputError('Konteks konfigurasi tidak diizinkan');
    }
    if (
      parsed.selectedAOI &&
      !catalog.some((d) => d.id === 'demo-boundaries' && d.status === 'demo')
    )
      throw new GisInputError('Konteks AOI konfigurasi tidak tersedia');
    return parsed;
  });
  if (new Set(configurations.map((c) => c.id)).size !== configurations.length)
    throw new GisInputError('ID konfigurasi konteks duplikat');
  const input: GISPlanningInput = {
    prompt,
    recipe,
    catalog: catalog.map(datasetInfo),
    configurations,
    aois:
      env.mode === 'demo' &&
      catalog.some((d) => d.id === 'demo-boundaries' && d.status === 'demo')
        ? DEMO_AOIS
        : [],
  };
  if (byteSize(input) > COPILOT_LIMITS.planningBytes)
    throw new GisInputError(
      'Konteks perencanaan terlalu besar; kurangi layer/konfigurasi.',
    );
  return input;
}
export async function planWithProvider(
  provider: AIProvider,
  input: GISPlanningInput,
  signal?: AbortSignal,
): Promise<GISExecutionPlan> {
  let raw: unknown;
  try {
    raw = await bounded(
      (s) => provider.plan(structuredClone(input), s),
      COPILOT_LIMITS.plannerMs,
      signal,
    );
  } catch (error) {
    if (error instanceof SafeProviderError) throw error;
    if (
      provider.mode === 'demo' &&
      (error instanceof GisInputError || error instanceof GisPermissionError)
    )
      throw error;
    // Demo user-input refusal is safe; external provider exception details are never exposed.
    throw new AIProviderError(
      'Provider perencana gagal atau melewati batas waktu',
    );
  }
  try {
    return parseGISExecutionPlan(raw, provider);
  } catch {
    throw new AIProviderError('Output perencana tidak valid');
  }
}
export async function executeGISPlan(
  plan: GISExecutionPlan,
  input: MapRecipe,
  env: ToolEnvironment,
  execution: 'auto' | 'preview' = 'auto',
  runner = executeTool,
): Promise<GISRunResponse> {
  const started = Date.now(),
    original = parseRecipe(input, env.catalog);
  assertRecipeAccess(original, env.catalog, env.context);
  const p = parseGISExecutionPlan(plan, plan.provider);
  // All arguments, access and reducer transitions are preflighted before any query/commit.
  let staged = original;
  for (const step of p.steps) staged = preflightTool(step.action, staged, env);
  const approvalStep = p.steps.find(
    (s) => GIS_TOOL_REGISTRY[s.action.tool].level === 'approval-required',
  );
  const status: GISRunResponse['status'] =
    p.resolution !== 'ready'
      ? p.resolution
      : approvalStep
        ? 'approval-required'
        : execution === 'preview'
          ? 'preview'
          : 'completed';
  const trace: GISRunResponse['trace'] = {
    id: `trace-${crypto.randomUUID()}`,
    planId: p.id,
    provider: { ...p.provider },
    status,
    elapsedMs: 0,
    entries: [],
  };
  let working = original;
  const results: GISRunResponse['results'] = [];
  if (status === 'completed') {
    for (const step of p.steps) {
      if (
        env.signal.aborted ||
        Date.now() - started > COPILOT_LIMITS.executionMs
      )
        throw new AIProviderError(
          'Eksekusi dibatalkan atau batas waktu terlampaui',
        );
      let expected = preflightTool(step.action, working, env);
      const raw = await runner(step.action, structuredClone(working), env);
      let checked;
      try {
        checked = validateActionResult(
          { ...raw.result, stepId: step.id, tool: step.action.tool },
          step.id,
          step.action.tool,
          env,
        );
        if (
          checked.data.kind === 'compute' &&
          checked.data.job.state === 'COMPLETED'
        )
          expected = applyComputeJob(
            working,
            checked.data.job,
            env.catalog,
            env.context,
            env.mode,
          );
        const parsed = parseRecipe(raw.recipe, env.catalog);
        assertRecipeAccess(parsed, env.catalog, env.context);
        if (JSON.stringify(parsed) !== JSON.stringify(expected))
          throw new Error('Unexpected recipe transition');
        const map = mapActionFor(step.action);
        if (
          map &&
          JSON.stringify(
            checked.data.kind === 'map-change' ? checked.data.action : null,
          ) !== JSON.stringify(map)
        )
          throw new Error('Wrong map action output');
        working = parsed;
      } catch {
        throw new AIProviderError(
          'Output tool GIS tidak valid; perubahan sesi dibatalkan',
        );
      }
      results.push(checked);
      trace.entries.push({
        stepId: step.id,
        tool: step.action.tool,
        level: GIS_TOOL_REGISTRY[step.action.tool].level,
        status: 'completed',
        summary: checked.summary,
      });
    }
  } else
    for (const step of p.steps)
      trace.entries.push({
        stepId: step.id,
        tool: step.action.tool,
        level: GIS_TOOL_REGISTRY[step.action.tool].level,
        status:
          status === 'approval-required' ? 'approval-required' : 'preview',
        summary:
          status === 'approval-required'
            ? 'Ditunda; persetujuan eksplisit diperlukan.'
            : 'Tervalidasi; belum dijalankan.',
      });
  const changed = JSON.stringify(working) !== JSON.stringify(original);
  if (changed) working.provenance = 'ai';
  let approval: GISRunResponse['approval'] = null;
  if (approvalStep) {
    const action = approvalStep.action;
    if (action.tool === 'requestConfigurationSave')
      approval = {
        tool: action.tool,
        supported: true,
        reason:
          'Tinjau nama, versi dan parameter. Hanya tombol persetujuan eksplisit dapat menyimpan ke browser lokal.',
        configuration: requireConfiguration(action.configurationId, env),
      };
    else if (action.tool === 'publishMap' || action.tool === 'runFloodAnalysis')
      approval = {
        tool: action.tool,
        supported: false,
        reason:
          'Memerlukan otorisasi eksplisit dan adapter yang belum tersedia. Konfirmasi tidak mengaktifkan operasi backend; tidak dijalankan.',
        configuration: null,
      };
  }
  trace.elapsedMs = Date.now() - started;
  const response: GISRunResponse = {
    schemaVersion: 1,
    status,
    plan: p,
    trace,
    recipe: working,
    changed,
    results,
    approval,
  };
  if (byteSize(response) > COPILOT_LIMITS.responseBytes)
    throw new AIProviderError(
      'Respons GIS melebihi batas ukuran; sesi tidak diubah',
    );
  return response;
}
