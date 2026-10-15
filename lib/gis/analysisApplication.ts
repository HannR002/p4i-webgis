import type {
  Dataset,
  GisContext,
  MapRecipe,
  RasterOperation,
} from './contracts';
import type { ConfigurationApplication } from './analysisContracts';
import { parseAnalysisConfiguration } from './analysisConfiguration';
import { parseRasterOperation } from './rasterValidation';
import {
  applyMapAction,
  canAccessDataset,
  GisPermissionError,
  assertRecipeAccess,
  legendFor,
} from './recipe';
import { parseRecipe } from './validation';
import {
  calculatePreferences,
  validatePreferenceWeights,
} from '../../utils/analysisPreferences';

export function prepareConfigurationApplication(
  input: unknown,
  recipe: MapRecipe,
  catalog: readonly Dataset[],
  context: GisContext,
  mode: 'demo' | 'available' | 'unavailable' | 'loading',
): ConfigurationApplication {
  const c = parseAnalysisConfiguration(input, catalog);
  for (const id of c.inputDatasetIds) {
    const d = catalog.find((d) => d.id === id);
    if (!d || !canAccessDataset(d, context))
      throw new GisPermissionError('Akses dataset konfigurasi ditolak');
  }
  if (c.analysisType === 'flood-susceptibility')
    return {
      kind: 'configuration-only',
      configuration: c,
      reason:
        'Konfigurasi flood eksperimental tersimpan; adapter pemilihan dataset/mapping GEE belum tersedia. Tidak ada komputasi dijalankan.',
    };
  const preferences = c.analysisType === 'ahp-smce' || c.analysisType === 'wlc';
  if (
    !preferences &&
    (mode !== 'demo' ||
      c.inputDatasetIds.some(
        (id) => catalog.find((d) => d.id === id)?.status !== 'demo',
      ))
  )
    return {
      kind: 'configuration-only',
      configuration: c,
      reason:
        'Adapter raster nyata belum tersedia; konfigurasi dapat disimpan, belum dieksekusi.',
    };
  let next = structuredClone(recipe);
  for (const criterion of c.criteria) {
    if (!criterion.datasetId) continue;
    if (!next.layers.some((l) => l.datasetId === criterion.datasetId))
      next = applyMapAction(
        next,
        { tool: 'addLayer', datasetId: criterion.datasetId },
        catalog,
        context,
      );
    const layer = next.layers.find((l) => l.datasetId === criterion.datasetId)!;
    const d = catalog.find((d) => d.id === criterion.datasetId)!;
    if (d.raster && 'palette' in layer.style) {
      const band = d.raster.bands.find((b) => b.id === criterion.band)!;
      const range = band.range ?? d.raster.range ?? [0, 100];
      layer.style = {
        ...layer.style,
        band: band.id,
        min: range[0],
        max: range[1],
      };
    }
  }
  next.aoi = structuredClone(c.selectedAOI);
  next.analysisConfiguration = c;
  if (preferences) {
    const pairwise =
      c.analysisType === 'ahp-smce' ? c.parameters.pairwise : null;
    const ahp = pairwise ? calculatePreferences(pairwise) : null;
    const weights = validatePreferenceWeights(c.weights);
    next.analysis = {
      method: 'ahp-wlc',
      weights,
      cr: Math.max(0, ahp?.cr ?? 0),
      provisional: true,
      weightMethod: pairwise ? 'ahp' : 'manual-wlc',
    };
    next.legend = legendFor(next, catalog);
    next = parseRecipe(next, catalog);
    assertRecipeAccess(next, catalog, context);
    return {
      kind: 'preferences',
      configuration: c,
      recipe: next,
      weights,
      pairwise,
    };
  }
  const ref = {
    datasetId: c.criteria[0].datasetId!,
    band: c.criteria[0].band!,
  };
  let operation: RasterOperation;
  if (c.analysisType === 'raster-reclassification') {
    const mapping = c.classificationRules.value;
    if (mapping.kind !== 'intervals') throw Error('Interval required');
    operation = {
      operation: 'classify',
      ...ref,
      coordinate: c.parameters.coordinate,
      classes: mapping.rules,
    };
  } else if (c.analysisType === 'raster-normalization')
    operation = { operation: 'normalize', ...ref, ...c.parameters };
  else if (c.analysisType === 'raster-arithmetic')
    operation = {
      operation: 'arithmetic',
      left: ref,
      right: { constant: c.parameters.constant, unit: c.parameters.unit },
      operator: c.parameters.operator,
      coordinate: c.parameters.coordinate,
      alignment: { mode: 'native-only' },
    };
  else {
    if (!c.selectedAOI)
      return {
        kind: 'configuration-only',
        configuration: c,
        reason: 'Pilih AOI yang tersedia sebelum menjalankan operasi.',
      };
    operation =
      c.analysisType === 'mask'
        ? {
            operation: 'mask',
            ...ref,
            aoiId: c.selectedAOI.id,
            keep: c.parameters.keep,
          }
        : {
            operation: c.analysisType === 'clip' ? 'clip' : 'zonal-statistics',
            ...ref,
            aoiId: c.selectedAOI.id,
          };
  }
  next.legend = legendFor(next, catalog);
  next = parseRecipe(next, catalog);
  assertRecipeAccess(next, catalog, context);
  return {
    kind: 'raster',
    configuration: c,
    recipe: next,
    operation: parseRasterOperation(operation),
  };
}
