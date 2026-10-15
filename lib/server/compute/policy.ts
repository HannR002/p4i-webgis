import 'server-only';
import type { Dataset, GisContext, MapRecipe } from '../../gis/contracts';
import type {
  ComputeEstimate,
  ComputeRequest,
} from '../../gis/computeContracts';
import { COMPUTE_LIMITS } from '../../gis/computeContracts';
import { parseComputeTool } from '../../gis/computeValidation';
import { parseAnalysisConfiguration } from '../../gis/analysisConfiguration';
import { prepareConfigurationApplication } from '../../gis/analysisApplication';
import { canAccessDataset, GisPermissionError } from '../../gis/recipe';
import { GisInputError, text } from '../../gis/validation';
import { sphericalArea } from '../../gis/geometry';
import { DEMO_AREAS } from '../gis/providers/demo';
export interface ComputeAccess {
  requesterId: string;
  context: GisContext;
  catalog: readonly Dataset[];
  mode: 'demo' | 'available' | 'unavailable';
}
export function validateComputeRequest(
  raw: ComputeRequest,
  access: ComputeAccess,
  recipe: MapRecipe,
): { request: ComputeRequest; estimate: ComputeEstimate } {
  if (
    raw.schemaVersion !== 1 ||
    !text(raw.idempotencyKey, 100) ||
    !(raw.projectId === null || text(raw.projectId, 100))
  )
    throw new GisInputError('Identitas permintaan komputasi tidak valid');
  const operation = parseComputeTool(raw.operation);
  if (
    raw.projectId &&
    !access.context.entitledProjectIds.includes(raw.projectId)
  )
    throw new GisPermissionError('Proyek tidak diizinkan');
  const c =
    operation.tool === 'runConfiguredAnalysis'
      ? parseAnalysisConfiguration(raw.configuration, access.catalog)
      : null;
  if (
    (c &&
      c.id !== (operation as { configurationId: string }).configurationId) ||
    (!c && raw.configuration !== null)
  )
    throw new GisInputError('Snapshot konfigurasi tidak sesuai operasi');
  const ids = [
    ...(c?.inputDatasetIds ?? []),
    ...(operation.tool === 'calculateArea' ||
    operation.tool === 'spatialSelection' ||
    c?.selectedAOI
      ? ['demo-boundaries']
      : []),
  ];
  for (const id of ids) {
    const d = access.catalog.find((d) => d.id === id);
    if (
      !d ||
      !canAccessDataset(d, access.context) ||
      (d.projectId && d.projectId !== raw.projectId)
    )
      throw new GisPermissionError('Dataset/proyek tidak diizinkan');
  }
  const aoiId =
    operation.tool === 'calculateArea' ? operation.aoiId : c?.selectedAOI?.id;
  const geometry = aoiId
    ? DEMO_AREAS.features.find((f) => f.id === aoiId)?.geometry
    : null;
  if (aoiId && !geometry)
    throw new GisInputError(
      'AOI tidak tersedia; nama tempat tidak boleh diganti fixture',
    );
  const aoiSquareMetres = geometry ? sphericalArea(geometry) : 0;
  if (aoiSquareMetres > COMPUTE_LIMITS.aoiSquareMetres)
    throw new GisInputError('AOI melampaui batas sumber daya');
  const prepared = c
    ? prepareConfigurationApplication(
        c,
        recipe,
        access.catalog,
        access.context,
        access.mode,
      )
    : null;
  const available =
    access.mode === 'demo' &&
    prepared?.kind !== 'configuration-only' &&
    ids.every(
      (id) => access.catalog.find((d) => d.id === id)?.status === 'demo',
    );
  let cells = 0;
  if (prepared?.kind === 'raster') {
    const gridOperation = ['zonal-statistics', 'clip', 'mask'].includes(
      prepared.operation.operation,
    );
    cells = gridOperation
      ? c!.inputDatasetIds.reduce((sum, id) => {
          const r = access.catalog.find((d) => d.id === id)?.raster;
          return sum + (r ? r.grid.width * r.grid.height : 0);
        }, 0)
      : 1;
  }
  if (cells > COMPUTE_LIMITS.cells)
    throw new GisInputError(
      'Grid melampaui batas 4096 sel; worker windowed diperlukan',
    );
  const approval = !available || cells > COMPUTE_LIMITS.autoCells;
  return {
    request: {
      schemaVersion: 1,
      operation,
      configuration: c,
      projectId: raw.projectId,
      idempotencyKey: raw.idempotencyKey,
    },
    estimate: {
      costClass: approval ? 'APPROVAL_REQUIRED_ANALYSIS' : 'LOW_COST_ANALYSIS',
      monetaryCost: available ? 'LOCAL_NO_EXTERNAL_CHARGE' : 'UNKNOWN',
      ceiling: {
        cells,
        providerCalls: cells,
        durationMs: COMPUTE_LIMITS.durationMs,
        aoiSquareMetres,
      },
      adapterAvailable: available,
      reason: !available
        ? (prepared?.kind === 'configuration-only'
            ? prepared.reason
            : 'Adapter development tidak tersedia') +
          ' Biaya eksternal UNKNOWN; persetujuan tidak mengaktifkan adapter.'
        : approval
          ? 'Grid melebihi batas otomatis 1024 sel. Persetujuan hanya untuk batas lokal yang ditampilkan.'
          : 'Dalam batas lokal; tidak memanggil layanan berbayar. Biaya hosting tidak diestimasi.',
    },
  };
}
