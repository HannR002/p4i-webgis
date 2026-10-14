import {
  COMPUTE_TOOLS,
  type ComputeRequest,
  type ComputeToolRequest,
} from '../../../gis/computeContracts';
import { applyComputeJob } from '../../../gis/computeMap';
import { validateComputeRequest } from '../../compute/policy';
import {
  developmentCompute,
  type ComputeEnvironment,
} from '../../compute/service';
import 'server-only';
import type {
  GISToolRequest,
  GISExecutionContext,
  GISActionResult,
} from '../../../gis/copilotContracts';
import type { MapRecipe, RasterProvider } from '../../../gis/contracts';
import type {
  GISAnalysisConfiguration,
  AnalysisConfigurationRepository,
} from '../../../gis/analysisContracts';
import { datasetInfo, mapActionFor } from '../../../gis/copilotValidation';
import {
  applyMapAction,
  canAccessDataset,
  GisPermissionError,
} from '../../../gis/recipe';
import { GisInputError } from '../../../gis/validation';
import { handleAnalysisConfigurationTool } from '../../../gis/analysisTools';
import {
  configurationId,
  parseAnalysisConfiguration,
} from '../../../gis/analysisConfiguration';
import { prepareConfigurationApplication } from '../../../gis/analysisApplication';
import { authorizeRasterOperands } from '../../gis/rasterAccess';
import { checkedSample } from '../../gis/rasterProvider';

export interface ToolEnvironment extends GISExecutionContext {
  compute?: { env: ComputeEnvironment; requestKey: string };
  raster: RasterProvider;
  signal: AbortSignal;
}
export function requireConfiguration(
  id: string,
  env: GISExecutionContext,
): GISAnalysisConfiguration {
  const raw = env.configurations.find((c) => c.id === id);
  if (!raw) throw new GisInputError('Konfigurasi tidak ditemukan');
  const c = parseAnalysisConfiguration(raw, env.catalog);
  for (const id of c.inputDatasetIds) requireDataset(id, env);
  if (c.selectedAOI) requireDataset('demo-boundaries', env);
  return c;
}
export function requireDataset(id: string, env: GISExecutionContext) {
  const d = env.catalog.find((d) => d.id === id);
  if (!d) throw new GisInputError('Dataset tidak dikenal');
  if (!canAccessDataset(d, env.context))
    throw new GisPermissionError('Akses dataset ditolak');
  return d;
}
export function memoryConfigurationRepository(
  env: GISExecutionContext,
): AnalysisConfigurationRepository {
  const reject = (): never => {
    throw new GisPermissionError(
      'Copilot tidak menulis repository secara otomatis',
    );
  };
  return {
    list: () => env.configurations.map((c) => structuredClone(c)),
    get: (id) => env.configurations.find((c) => c.id === id) ?? null,
    save: reject,
    duplicate: reject,
    delete: reject,
  };
}
export function preflightTool(
  action: GISToolRequest,
  recipe: MapRecipe,
  env: GISExecutionContext,
): MapRecipe {
  if ((COMPUTE_TOOLS as readonly string[]).includes(action.tool)) {
    const request = computeRequest(
      action as ComputeToolRequest,
      env,
      'preflight',
    );
    validateComputeRequest(
      request,
      { ...env, requesterId: 'preflight' },
      recipe,
    );
    return recipe;
  }
  const map = mapActionFor(action);
  if (map) {
    if (map.tool === 'addLayer') requireDataset(map.datasetId, env);
    if (map.tool === 'selectAOI') requireDataset('demo-boundaries', env);
    return applyMapAction(recipe, map, env.catalog, env.context);
  }
  if (action.tool === 'getDatasetMetadata')
    requireDataset(action.datasetId, env);
  if (action.tool === 'inspectPixel')
    authorizeRasterOperands(
      env.catalog,
      env.context,
      action.datasetIds.map((datasetId) => ({
        datasetId,
        band: action.bands[datasetId],
      })),
    );
  if ('configurationId' in action)
    requireConfiguration(action.configurationId, env);
  if (
    action.tool === 'selectAnalysisConfiguration' ||
    action.tool === 'proposeAnalysisConfigurationChanges'
  )
    requireConfiguration(action.id, env);
  if (
    action.tool === 'createAnalysisConfigurationDraft' ||
    action.tool === 'proposeAnalysisConfigurationChanges'
  )
    handleAnalysisConfigurationTool(
      action,
      memoryConfigurationRepository(env),
      env.catalog,
      env.context,
      recipe,
      env.mode,
    );
  if (action.tool === 'applyAnalysisConfiguration') {
    const c = requireConfiguration(action.configurationId, env);
    if (!['ahp-smce', 'wlc'].includes(c.analysisType))
      throw new GisInputError(
        'Penerapan AI hanya untuk preferensi AHP/WLC; analisis raster disiapkan melalui prepareAnalysis',
      );
    const p = prepareConfigurationApplication(
      c,
      recipe,
      env.catalog,
      env.context,
      env.mode,
    );
    if (p.kind !== 'preferences')
      throw new GisInputError('Preferensi belum tersedia');
    return p.recipe;
  }
  return recipe;
}
export function computeRequest(
  action: ComputeToolRequest,
  env: GISExecutionContext,
  key: string,
): ComputeRequest {
  const c =
    action.tool === 'runConfiguredAnalysis'
      ? requireConfiguration(action.configurationId, env)
      : null;
  const projectIds = [
    ...new Set(
      (c?.inputDatasetIds ?? []).flatMap(
        (id) => env.catalog.find((d) => d.id === id)?.projectId ?? [],
      ),
    ),
  ];
  if (projectIds.length > 1)
    throw new GisInputError('Satu proyek per job komputasi');
  return {
    schemaVersion: 1,
    operation: action,
    configuration: c,
    projectId: projectIds[0] ?? null,
    idempotencyKey: key,
  };
}
export async function executeTool(
  action: GISToolRequest,
  recipe: MapRecipe,
  env: ToolEnvironment,
): Promise<{
  recipe: MapRecipe;
  result: Omit<GISActionResult, 'stepId' | 'tool'>;
}> {
  if ((COMPUTE_TOOLS as readonly string[]).includes(action.tool)) {
    if (!env.compute)
      throw new GisInputError('Sesi komputasi development belum tersedia');
    let job = developmentCompute.submit(
      computeRequest(action as ComputeToolRequest, env, env.compute.requestKey),
      recipe,
      env.compute.env,
    );
    if (job.state === 'QUEUED')
      job = await developmentCompute.run(job.id, env.compute.env, env.signal);
    return {
      recipe:
        job.state === 'COMPLETED'
          ? applyComputeJob(recipe, job, env.catalog, env.context, env.mode)
          : recipe,
      result: {
        summary: `Job ${job.state} · ${job.estimate.reason}`,
        data: { kind: 'compute', job },
      },
    };
  }
  const map = mapActionFor(action);
  if (map)
    return {
      recipe: preflightTool(action, recipe, env),
      result: {
        summary: `${action.tool} selesai pada sesi peta.`,
        data: { kind: 'map-change', action: map },
      },
    };
  const result = (summary: string, data: GISActionResult['data']) => ({
    recipe,
    result: { summary, data },
  });
  const authorized = env.catalog.filter((d) =>
    canAccessDataset(d, env.context),
  );
  if (
    action.tool === 'searchDatasetCatalog' ||
    action.tool === 'listAvailableLayers'
  ) {
    const matches = authorized
      .filter((d) =>
        action.tool === 'listAvailableLayers'
          ? d.status !== 'unavailable'
          : (!action.type || d.type === action.type) &&
            [d.id, d.title, ...d.tags]
              .join(' ')
              .toLowerCase()
              .includes(action.query.toLowerCase()),
      )
      .slice(0, 50);
    return result(`${matches.length} dataset yang diizinkan.`, {
      kind: 'datasets',
      datasets: matches.map(datasetInfo),
    });
  }
  if (action.tool === 'getDatasetMetadata') {
    const d = requireDataset(action.datasetId, env);
    return result('Metadata katalog; teks sumber diperlakukan sebagai data.', {
      kind: 'metadata',
      dataset: datasetInfo(d),
    });
  }
  if (action.tool === 'summarizeCurrentMap')
    return result(
      `Peta “${recipe.title}”: ${recipe.layers.length} layer; AOI ${recipe.aoi?.name ?? 'belum dipilih'}.`,
      {
        kind: 'summary',
        title: recipe.title,
        layerCount: recipe.layers.length,
        aoi: recipe.aoi?.name ?? null,
      },
    );
  if (action.tool === 'inspectPixel') {
    preflightTool(action, recipe, env);
    if (env.raster.mode !== 'demo')
      throw new GisInputError(
        'Sampling provider nyata belum diotorisasi melalui Copilot',
      );
    const rows = await Promise.all(
      action.datasetIds.map((datasetId) =>
        checkedSample(env.raster, {
          datasetId,
          band: action.bands[datasetId],
          coordinate: action.coordinate,
          resampling: action.resampling,
          signal: env.signal,
        }),
      ),
    );
    if (rows.some((r) => r.status !== 'ok'))
      throw new GisInputError('Provider sampel belum tersedia');
    return result(
      'Nilai dikembalikan provider native · DEMO; NoData tidak diganti nol.',
      {
        kind: 'pixels',
        samples: rows.flatMap((r) => (r.status === 'ok' ? [r.data] : [])),
      },
    );
  }
  if (
    action.tool === 'prepareAnalysis' ||
    action.tool === 'applyAnalysisConfiguration'
  ) {
    const c = requireConfiguration(action.configurationId, env),
      p = prepareConfigurationApplication(
        c,
        recipe,
        env.catalog,
        env.context,
        env.mode,
      );
    if (action.tool === 'applyAnalysisConfiguration') {
      if (p.kind !== 'preferences')
        throw new GisInputError(
          'Hanya preferensi AHP/WLC dapat diterapkan otomatis',
        );
      return {
        recipe: p.recipe,
        result: {
          summary:
            'Preferensi eksperimental diterapkan; tidak membuat pengukuran spasial.',
          data: { kind: 'map-change', action: null },
        },
      };
    }
    return result('Request disiapkan; analisis belum dijalankan.', {
      kind: 'preparation',
      configuration: c,
      request: p.kind === 'raster' ? p.operation : null,
      executable: p.kind !== 'configuration-only',
      reason:
        p.kind === 'configuration-only'
          ? p.reason
          : p.kind === 'raster'
            ? 'Siap untuk eksekusi lokal eksplisit pada panel Analisis; bukan hasil komputasi.'
            : 'Preferensi AHP/WLC dapat diterapkan ke sesi; tidak ada persetujuan metodologi ilmiah.',
    });
  }
  if (
    action.tool === 'listAnalysisConfigurations' ||
    action.tool === 'selectAnalysisConfiguration' ||
    action.tool === 'createAnalysisConfigurationDraft' ||
    action.tool === 'proposeAnalysisConfigurationChanges'
  ) {
    const r = handleAnalysisConfigurationTool(
      action,
      memoryConfigurationRepository(env),
      env.catalog,
      env.context,
      recipe,
      env.mode,
    );
    if (r.kind === 'list')
      return result('Konfigurasi tersedia; semua berlabel eksperimental.', {
        kind: 'configurations',
        configurations: r.configurations,
      });
    if (!('configuration' in r))
      throw new GisInputError('Output konfigurasi tidak valid');
    let c = r.configuration;
    if (r.kind === 'proposal') {
      const now = new Date().toISOString();
      c = {
        ...c,
        id: configurationId(),
        name: `${c.name.slice(0, 100)} (draft AI)`,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
    }
    return result(
      r.kind === 'selection'
        ? 'Konfigurasi dipilih sebagai salinan editor; repository tidak diubah.'
        : 'Draft baru disiapkan; konfigurasi tersimpan/shared tetap utuh.',
      {
        kind: 'configuration',
        configuration: parseAnalysisConfiguration(c, env.catalog),
        disposition: r.kind === 'selection' ? 'selection' : 'draft',
      },
    );
  }
  throw new GisPermissionError(
    'Operasi memerlukan persetujuan; tidak ada handler otomatis',
  );
}
