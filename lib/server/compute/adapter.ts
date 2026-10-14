import { transformCoordinate, getBand } from '../../gis/raster';
import 'server-only';
import type { MapRecipe, RasterProvider } from '../../gis/contracts';
import type { ComputeRequest, ComputeResult } from '../../gis/computeContracts';
import type { ComputeAccess } from './policy';
import { prepareConfigurationApplication } from '../../gis/analysisApplication';
import {
  calculateLegacyWLC,
  calculatePreferences,
} from '../../../utils/analysisPreferences';
import {
  sphericalArea,
  sphericalDistance,
  selectVectorIds,
} from '../../gis/geometry';
import { DEMO_AREAS } from '../gis/providers/demo';
import { GisInputError } from '../../gis/validation';
import { parseProcessingResult } from '../../gis/processingValidation';
export async function executeLocalCompute(
  request: ComputeRequest,
  recipe: MapRecipe,
  access: ComputeAccess,
  raster: RasterProvider,
  signal: AbortSignal,
): Promise<ComputeResult> {
  signal.throwIfAborted();
  if (access.mode !== 'demo')
    throw new GisInputError('Adapter nyata belum tersedia');
  const c = request.configuration,
    op = request.operation;
  const result: ComputeResult = {
    artifact: {
      jobId: 'pending',
      title: c?.name ?? op.tool,
      summary: '',
      datasetIds:
        c?.inputDatasetIds ??
        (op.tool === 'calculateDistance' ? [] : ['demo-boundaries']),
      configurationVersion: c?.version ?? null,
      experimental: true,
      demo: c
        ? c.inputDatasetIds.length > 0 || !!c.selectedAOI
        : op.tool !== 'calculateDistance',
      provenance:
        'Kalkulasi deterministik lokal P4I; fixture DEMO atau input preferensi pengguna. Bukan pengukuran resmi.',
      createdAt: new Date().toISOString(),
      points: [],
    },
    raster: null,
    values: {},
    limitations: [
      'Eksperimental; tidak menyatakan validasi atau keunggulan metodologi.',
      'Tidak ada GEE, PostGIS atau worker produksi yang dijalankan.',
    ],
  };
  if (op.tool === 'calculateArea') {
    const f = DEMO_AREAS.features.find((f) => f.id === op.aoiId)!;
    result.values = {
      areaSquareMetres: sphericalArea(f.geometry),
      aoiId: op.aoiId,
    };
    result.artifact.summary = `Luas AOI DEMO: ${Number(result.values.areaSquareMetres).toFixed(2)} m² (pendekatan bola).`;
  } else if (op.tool === 'calculateDistance') {
    result.values = { distanceMetres: sphericalDistance(...op.points) };
    result.artifact.points = op.points;
    result.artifact.summary = `Jarak geodesik pendekatan bola: ${Number(result.values.distanceMetres).toFixed(2)} m.`;
  } else if (op.tool === 'spatialSelection') {
    const ids = selectVectorIds(op.point, DEMO_AREAS);
    result.values = {
      selectedIds: ids.join(', ') || 'Tidak ada',
      count: ids.length,
    };
    result.artifact.points = [op.point];
    result.artifact.summary = `${ids.length} polygon DEMO mencakup titik EPSG:4326.`;
  } else if (c) {
    const application = prepareConfigurationApplication(
      c,
      recipe,
      access.catalog,
      access.context,
      access.mode,
    );
    if (application.kind === 'configuration-only')
      throw new GisInputError(application.reason);
    if (c.analysisType === 'ahp-smce') {
      const ahp = calculatePreferences(c.parameters.pairwise);
      result.values = { ...ahp.weights, consistencyRatio: ahp.cr };
      result.artifact.summary = `Bobot AHP dihitung; CR ${ahp.cr.toFixed(4)}. CR bukan validasi metodologi.`;
    } else if (c.analysisType === 'wlc') {
      const score = calculateLegacyWLC(
        c.parameters.scores,
        application.kind === 'preferences'
          ? application.weights
          : { bencana: 0, kesuburan: 0, kepadatan: 0 },
        c.parameters.constraint,
      );
      result.values = { score };
      result.artifact.summary =
        score === null
          ? 'Skor WLC: NoData karena input skor belum lengkap.'
          : `Skor skenario WLC: ${score.toFixed(6)}; input preferensi, bukan peta hasil raster.`;
    } else if (application.kind === 'raster') {
      const r = parseProcessingResult(
        await raster.execute(application.operation, { signal }),
      );
      if (r.status !== 'ok') throw new GisInputError(r.reason);
      if (r.operation !== application.operation.operation || !r.demo)
        throw new GisInputError('Identitas output provider tidak sesuai');
      const dataset = access.catalog.find(
        (d) => d.id === c.criteria[0].datasetId,
      )!;
      const band = getBand(dataset.raster!, c.criteria[0].band!);
      const expectedKind =
        application.operation.operation === 'zonal-statistics'
          ? 'statistics'
          : ['clip', 'mask'].includes(application.operation.operation)
            ? 'subset'
            : 'value';
      if (r.data.kind !== expectedKind)
        throw new GisInputError('Jenis hasil tidak sesuai operasi');
      if (r.data.kind === 'statistics') {
        const stats = r.data.statistics;
        if (
          stats.datasetId !== dataset.id ||
          stats.band !== band.id ||
          stats.version !== dataset.version ||
          stats.unit !== band.unit ||
          stats.crs !== dataset.raster!.crs ||
          stats.kind !== band.kind ||
          !stats.demo ||
          stats.resolution.x !== dataset.raster!.resolution.x ||
          stats.resolution.y !== dataset.raster!.resolution.y ||
          stats.resolution.unit !== dataset.raster!.resolution.unit
        )
          throw new GisInputError('Sumber/metadata statistik tidak sesuai');
      } else if (r.data.kind === 'value') {
        const value = r.data.result;
        if (
          !value.demo ||
          value.sources.length !== 1 ||
          value.sources[0].datasetId !== dataset.id ||
          value.sources[0].band !== band.id ||
          !('coordinate' in c.parameters) ||
          value.coordinate.x !== c.parameters.coordinate.x ||
          value.coordinate.y !== c.parameters.coordinate.y ||
          value.coordinate.crs !== c.parameters.coordinate.crs
        )
          throw new GisInputError('Sumber/koordinat hasil titik tidak sesuai');
      } else if (r.data.kind === 'subset') {
        const subset = r.data.subset;
        if (
          subset.datasetId !== dataset.id ||
          subset.band !== band.id ||
          subset.version !== dataset.version ||
          subset.aoiId !== c.selectedAOI?.id ||
          subset.crs !== dataset.raster!.crs
        )
          throw new GisInputError('Identitas subset tidak sesuai');
      }
      result.raster = r;
      result.artifact.summary =
        r.data.kind === 'statistics'
          ? `Statistik AOI DEMO: ${r.data.statistics.count} sel valid; ${r.data.statistics.noDataCount} NoData. Kelas kategorikal menggunakan histogram.`
          : r.data.kind === 'value'
            ? `Hasil titik DEMO: ${r.data.result.noData ? 'NoData' : `${r.data.result.value} ${r.data.result.unit}`}${r.data.result.classification ? ` · ${r.data.result.classification}` : ''}. Operasi ${r.operation}.`
            : `Operasi ${r.operation} selesai pada fixture DEMO; keluaran ${r.data.kind}.`;
      if ('coordinate' in c.parameters)
        result.artifact.points = [
          transformCoordinate(c.parameters.coordinate, 'EPSG:4326'),
        ];
      result.limitations.push(
        'Grid native saja; tidak ada resampling implisit. NoData dipertahankan. Clip/mask mengembalikan ringkasan subset, bukan file GeoTIFF.',
      );
    }
  }
  signal.throwIfAborted();
  return result;
}
