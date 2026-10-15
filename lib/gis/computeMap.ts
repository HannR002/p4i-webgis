import type { ComputeJob } from './computeContracts';
import type { Dataset, GisContext, MapRecipe } from './contracts';
import { parseComputeJob } from './computeValidation';
import { prepareConfigurationApplication } from './analysisApplication';
import { applyMapAction, assertRecipeAccess } from './recipe';
import { parseRecipe, GisInputError } from './validation';
export function applyComputeJob(
  recipe: MapRecipe,
  raw: ComputeJob,
  catalog: readonly Dataset[],
  context: GisContext,
  mode: 'demo' | 'available' | 'unavailable',
): MapRecipe {
  const job = parseComputeJob(raw);
  if (job.state !== 'COMPLETED' || !job.result)
    throw new GisInputError('Hasil komputasi belum tersedia');
  let next = structuredClone(recipe);
  if (job.request.configuration) {
    const p = prepareConfigurationApplication(
      job.request.configuration,
      next,
      catalog,
      context,
      mode,
    );
    if (p.kind === 'configuration-only') throw new GisInputError(p.reason);
    next = p.recipe;
  }
  if (job.request.operation.tool === 'calculateArea') {
    if (!next.layers.some((l) => l.datasetId === 'demo-boundaries'))
      next = applyMapAction(
        next,
        { tool: 'addLayer', datasetId: 'demo-boundaries' },
        catalog,
        context,
      );
    next = applyMapAction(
      next,
      { tool: 'selectAOI', aoiId: job.request.operation.aoiId },
      catalog,
      context,
    );
  }
  next.analysisResults = [
    ...(next.analysisResults ?? []).filter((a) => a.jobId !== job.id),
    job.result.artifact,
  ].slice(-8);
  next.provenance = 'ai';
  next = parseRecipe(next, catalog);
  assertRecipeAccess(next, catalog, context);
  return next;
}
