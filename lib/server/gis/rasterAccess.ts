import 'server-only';
import type { Dataset, GisContext, RasterOperand } from '../../gis/contracts';
import { canAccessDataset, GisPermissionError } from '../../gis/recipe';
import { GisInputError } from '../../gis/validation';
import { rasterDataset } from './rasterProvider';
export function authorizeRasterOperands(
  catalog: readonly Dataset[],
  context: GisContext,
  operands: readonly RasterOperand[],
): void {
  for (const ref of operands) {
    const dataset = catalog.find((dataset) => dataset.id === ref.datasetId);
    if (!dataset) throw new GisInputError('Dataset tidak dikenal');
    if (!canAccessDataset(dataset, context))
      throw new GisPermissionError('Akses dataset ditolak');
    rasterDataset(catalog, ref);
  }
}
