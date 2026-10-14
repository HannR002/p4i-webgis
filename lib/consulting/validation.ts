import { datasetInfo } from '../gis/copilotValidation';
import { record, text, GisInputError, parseRecipe } from '../gis/validation';
import { assertRecipeAccess } from '../gis/recipe';
import { canAccessDataset } from '../gis/recipe';
import type { Dataset, GisContext } from '../gis/contracts';
import type { DeliverableContent, ReviewChecklist } from './contracts';
export function parseDeliverableContent(
  value: unknown,
  catalog: readonly Dataset[],
  context: GisContext,
  projectId?: string,
  mapOutline?: DeliverableContent['mapOutline'],
): DeliverableContent {
  if (
    !record(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          'title',
          'summary',
          'analystNotes',
          'assumptions',
          'limitations',
          'recipe',
          'datasetSources',
          'mapOutline',
        ].includes(k),
    ) ||
    !text(value.title, 160) ||
    !text(value.summary, 5000) ||
    !text(value.assumptions, 3000) ||
    !text(value.limitations, 3000) ||
    typeof value.analystNotes !== 'string' ||
    value.analystNotes.length > 5000
  )
    throw new GisInputError(
      'Judul, ringkasan, asumsi dan keterbatasan wajib diisi; ukuran teks dibatasi.',
    );
  const recipe = parseRecipe(value.recipe, catalog);
  assertRecipeAccess(recipe, catalog, context);
  // Snapshots never attach restricted sources from another project through map annotations.
  for (const id of [
    ...recipe.layers.map((l) => l.datasetId),
    ...(recipe.analysisConfiguration?.inputDatasetIds ?? []),
    ...(recipe.analysisResults?.flatMap((r) => r.datasetIds) ?? []),
  ]) {
    const d = catalog.find((d) => d.id === id);
    if (
      !d ||
      !canAccessDataset(d, context) ||
      (d.projectId && d.projectId !== projectId)
    )
      throw new GisInputError('Sumber tidak diizinkan');
  }
  if (JSON.stringify(recipe).length > 40000)
    throw new GisInputError('Snapshot peta terlalu besar');
  return {
    title: value.title.trim(),
    summary: value.summary.trim(),
    analystNotes: value.analystNotes,
    assumptions: value.assumptions.trim(),
    limitations: value.limitations.trim(),
    recipe,
    ...(mapOutline ? { mapOutline: structuredClone(mapOutline) } : {}),
    datasetSources: catalog
      .filter((d) =>
        new Set([
          ...recipe.layers.map((l) => l.datasetId),
          ...(recipe.analysisConfiguration?.inputDatasetIds ?? []),
          ...(recipe.analysisResults?.flatMap((r) => r.datasetIds) ?? []),
        ]).has(d.id),
      )
      .map(datasetInfo),
  };
}
export function parseReviewChecklist(v: unknown): ReviewChecklist {
  const keys = [
    'completeness',
    'interpretation',
    'authorizedRelease',
    'professionalQuality',
  ];
  if (
    !record(v) ||
    Object.keys(v).length !== 4 ||
    keys.some((k) => typeof v[k] !== 'boolean') ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw new GisInputError('Checklist review tidak valid');
  return v as unknown as ReviewChecklist;
}
export function safeReportName(
  id: string,
  revision: number,
  extension: 'pdf' | 'json',
) {
  return `p4i-deliverable-${id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}-r${revision}.${extension}`;
}
