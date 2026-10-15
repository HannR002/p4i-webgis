import 'server-only';
import type {
  Dataset,
  RasterProvider,
  RasterDataset,
  RasterOperation,
  RasterStatistics,
  RasterProcessingResult,
  RasterOperand,
  RasterValueResult,
} from '../../gis/contracts';
import {
  GisInputError,
  parsePixelSample,
  validateRasterMetadata,
} from '../../gis/validation';
import {
  getBand,
  gridsMatch,
  gridPosition,
  cellCenter,
  classifyValue,
  transformCoordinate,
} from '../../gis/raster';
import { pointInPolygon, sphericalArea } from '../../gis/geometry';
import { parseRasterOperation } from '../../gis/rasterValidation';
import type { GisDataProvider } from './contracts';
import { getGisProvider } from './index';
import { DEMO_AREAS } from './providers/demo';
export class RasterProviderError extends Error {}
export function rasterDataset(
  catalog: readonly Dataset[],
  ref: RasterOperand,
): RasterDataset {
  const dataset = catalog.find((dataset) => dataset.id === ref.datasetId);
  if (!dataset?.raster || dataset.type !== 'raster')
    throw new GisInputError('Dataset raster tidak dikenal');
  try {
    validateRasterMetadata(dataset.raster);
  } catch {
    throw new RasterProviderError('Metadata provider raster tidak valid');
  }
  getBand(dataset.raster, ref.band);
  return dataset as RasterDataset;
}
export function getRasterProvider(
  gis: GisDataProvider = getGisProvider(),
): RasterProvider {
  const catalog = gis.catalog();
  const provider: RasterProvider = {
    id: gis.mode === 'demo' ? 'local-fixture-v2' : 'unconfigured',
    mode: gis.mode,
    catalog: () => catalog,
    async samplePixel(request) {
      const dataset = rasterDataset(catalog, request);
      const [longitude, latitude] = transformCoordinate(
        request.coordinate,
        'EPSG:4326',
      );
      const band = getBand(dataset.raster, request.band);
      if (band.kind === 'categorical' && request.resampling !== 'nearest')
        throw new GisInputError('Band kategorikal tidak boleh diinterpolasi');
      try {
        const result = gis.sample(dataset.id, latitude, longitude, {
          band: band.id,
          resampling: request.resampling,
        });
        return result.status === 'ok'
          ? {
              status: 'ok',
              data: {
                ...result.data,
                requestedCoordinate: { ...request.coordinate },
              },
            }
          : result;
      } catch (error) {
        if (error instanceof GisInputError) throw error;
        throw new RasterProviderError('Provider sampling gagal');
      }
    },
    async execute(rawOperation, options) {
      const operation = parseRasterOperation(rawOperation);
      if (gis.mode !== 'demo')
        return {
          status: 'unavailable',
          reason: 'Pemrosesan raster provider nyata belum dikonfigurasi',
        };
      return executeLocal(operation, provider, options?.signal);
    },
  };
  return provider;
}
export async function checkedSample(
  provider: RasterProvider,
  request: Parameters<RasterProvider['samplePixel']>[0],
): Promise<Awaited<ReturnType<RasterProvider['samplePixel']>>> {
  const dataset = rasterDataset(provider.catalog(), request);
  const band = getBand(dataset.raster, request.band);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal?.addEventListener('abort', abort, { once: true });
  if (request.signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted)
      throw new RasterProviderError('Permintaan sampling dibatalkan');
    const result = await Promise.race([
      provider.samplePixel({ ...request, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new RasterProviderError('Provider sampling melewati batas waktu'),
          );
        }, 5000);
      }),
    ]);
    if (result.status === 'unavailable') return result;
    const sample = parsePixelSample(result.data);
    const native = transformCoordinate(request.coordinate, dataset.raster.crs);
    const cell = gridPosition(dataset.raster.grid, native[0], native[1]);
    const wgs = transformCoordinate(request.coordinate, 'EPSG:4326');
    if (
      sample.bandKind !== band.kind ||
      sample.source !== dataset.source ||
      sample.period.start !== dataset.raster.period.start ||
      sample.period.end !== dataset.raster.period.end ||
      sample.resolution.x !== dataset.raster.resolution.x ||
      sample.resolution.y !== dataset.raster.resolution.y ||
      sample.resolution.unit !== dataset.raster.resolution.unit ||
      sample.requestedCoordinate.crs !== request.coordinate.crs ||
      sample.requestedCoordinate.x !== request.coordinate.x ||
      sample.requestedCoordinate.y !== request.coordinate.y ||
      Math.abs(sample.latitude - wgs[1]) > 1e-8 ||
      Math.abs(sample.longitude - wgs[0]) > 1e-8 ||
      JSON.stringify(sample.cell) !== JSON.stringify(cell)
    )
      throw new RasterProviderError(
        'Lokasi/metode provider tidak sesuai grid native',
      );
    const category = dataset.raster.classes?.find(
      (entry) => entry.value === sample.value,
    );
    if (
      (cell === null &&
        (!sample.noData || sample.noDataReason !== 'outside-coverage')) ||
      (cell !== null && sample.noDataReason === 'outside-coverage') ||
      (sample.noData && sample.classification !== null) ||
      (!sample.noData &&
        band.kind === 'categorical' &&
        (!category || sample.classification !== category.label))
    )
      throw new RasterProviderError(
        'Mask/kelas provider tidak sesuai metadata',
      );
    if (
      sample.datasetId !== dataset.id ||
      sample.band !== band.id ||
      sample.unit !== band.unit ||
      sample.crs !== dataset.raster.crs ||
      sample.version !== dataset.version ||
      sample.demo !== (dataset.status === 'demo') ||
      sample.resampling !== request.resampling ||
      sample.encoding.scale !== band.scale ||
      sample.encoding.offset !== band.offset ||
      (!sample.noData &&
        Math.abs(
          sample.value! - (sample.rawValue! * band.scale + band.offset),
        ) >
          1e-8 * Math.max(1, Math.abs(sample.value!)))
    )
      throw new RasterProviderError('Respons provider tidak sesuai metadata');
    return { status: 'ok', data: sample };
  } catch (error) {
    if (
      error instanceof RasterProviderError ||
      (error instanceof GisInputError &&
        error.message === 'Band kategorikal tidak boleh diinterpolasi')
    )
      throw error;
    throw new RasterProviderError(
      'Respons provider raster tidak valid atau provider gagal',
    );
  } finally {
    if (timer) clearTimeout(timer);
    request.signal?.removeEventListener('abort', abort);
  }
}
async function executeLocal(
  op: RasterOperation,
  provider: RasterProvider,
  signal?: AbortSignal,
): Promise<RasterProcessingResult> {
  const finish = (
    data: Extract<RasterProcessingResult, { status: 'ok' }>['data'],
  ): RasterProcessingResult => ({
    status: 'ok',
    operation: op.operation,
    demo: true,
    provenance:
      'Operasi deterministik pada fixture sintetik P4I; bukan analisis data resmi.',
    data,
  });
  const sample = async (
    ref: RasterOperand,
    coordinate: Parameters<RasterProvider['samplePixel']>[0]['coordinate'],
  ) => {
    const result = await checkedSample(provider, {
      ...ref,
      coordinate,
      resampling: 'nearest',
      signal,
    });
    if (result.status !== 'ok')
      throw new RasterProviderError('Sumber raster tidak tersedia');
    return result.data;
  };
  if (op.operation === 'sample')
    return finish({
      kind: 'samples',
      samples: await Promise.all(
        op.datasetIds.map((datasetId) =>
          sample(
            { datasetId },
            { x: op.longitude, y: op.latitude, crs: 'EPSG:4326' },
          ),
        ),
      ),
    });
  if (
    op.operation === 'zonal-statistics' ||
    op.operation === 'clip' ||
    op.operation === 'mask'
  ) {
    const dataset = rasterDataset(provider.catalog(), op),
      metadata = dataset.raster,
      band = getBand(metadata, op.band);
    if (metadata.grid.width * metadata.grid.height > 4096)
      return {
        status: 'unavailable',
        reason:
          'Grid melebihi batas lokal 4096 sel; gunakan window provider server',
      };
    const geometry = DEMO_AREAS.features.find(
      (feature) => feature.id === op.aoiId,
    )?.geometry;
    if (!geometry) throw new GisInputError('AOI lokal tidak dikenal');
    let count = 0,
      noDataCount = 0,
      selectedCount = 0,
      mean = 0,
      min = Infinity,
      max = -Infinity;
    const histogram = new Map<
      number,
      { value: number; label: string; count: number }
    >();
    let west = Infinity,
      east = -Infinity,
      north = Infinity,
      south = -Infinity;
    for (let row = 0; row < metadata.grid.height; row++)
      for (let column = 0; column < metadata.grid.width; column++) {
        signal?.throwIfAborted();
        // Yield so deadlines and cancellation can run during bounded local scans.
        if ((row * metadata.grid.width + column) % 64 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const center = cellCenter(metadata.grid, column, row);
        const point = transformCoordinate(
          {
            x: center[0],
            y: center[1],
            crs: metadata.crs as 'EPSG:4326' | 'EPSG:3857',
          },
          'EPSG:4326',
        );
        const inside = pointInPolygon(point, geometry);
        if (op.operation === 'mask' && op.keep === 'outside' ? inside : !inside)
          continue;
        selectedCount++;
        west = Math.min(west, column);
        east = Math.max(east, column);
        north = Math.min(north, row);
        south = Math.max(south, row);
        const pixel = await sample(op, {
          x: center[0],
          y: center[1],
          crs: metadata.crs as 'EPSG:4326' | 'EPSG:3857',
        });
        if (pixel.noData) {
          noDataCount++;
          continue;
        }
        count++;
        const value = pixel.value!;
        if (band.kind === 'continuous') {
          mean += (value - mean) / count;
          min = Math.min(min, value);
          max = Math.max(max, value);
        } else {
          const entry = histogram.get(value) ?? {
            value,
            label: pixel.classification ?? 'Kode belum dipetakan',
            count: 0,
          };
          entry.count++;
          histogram.set(value, entry);
        }
      }
    if (op.operation !== 'zonal-statistics')
      return finish({
        kind: 'subset',
        subset: {
          datasetId: dataset.id,
          band: band.id,
          version: dataset.version,
          crs: metadata.crs,
          nativeGrid: structuredClone(metadata.grid),
          window: selectedCount
            ? {
                column: west,
                row: north,
                width: east - west + 1,
                height: south - north + 1,
              }
            : null,
          aoiId: op.aoiId,
          rule: 'cell-center',
          keep: op.operation === 'mask' ? op.keep : 'inside',
          selectedCount,
          validCount: count,
          noDataCount,
          artifact: null,
        },
      });
    const statistics: RasterStatistics = {
      datasetId: dataset.id,
      band: band.id,
      kind: band.kind,
      count,
      noDataCount,
      aoiAreaSquareMetres: sphericalArea(geometry),
      areaMethod: 'spherical approximation',
      selectedCount,
      min: count && band.kind === 'continuous' ? min : null,
      max: count && band.kind === 'continuous' ? max : null,
      mean: count && band.kind === 'continuous' ? mean : null,
      histogram: [...histogram.values()].sort((a, b) => a.value - b.value),
      unit: band.unit,
      method: 'native-cell-centers / NoData excluded / unweighted',
      version: dataset.version,
      demo: true,
      crs: metadata.crs,
      resolution: { ...metadata.resolution },
      provenance: dataset.provenance,
    };
    return finish({ kind: 'statistics', statistics });
  }
  if (
    (op.operation === 'arithmetic' || op.operation === 'weighted-overlay') &&
    op.alignment.mode !== 'native-only'
  )
    return {
      status: 'unavailable',
      reason:
        'Resampling antar-grid belum tersedia; tidak ada penyelarasan implisit',
    };
  const refs: RasterOperand[] =
    op.operation === 'arithmetic'
      ? [op.left, ...('datasetId' in op.right ? [op.right] : [])]
      : op.operation === 'weighted-overlay'
        ? op.inputs
        : [op];
  const datasets = refs.map((ref) => rasterDataset(provider.catalog(), ref));
  if (
    datasets.some((dataset) => !gridsMatch(datasets[0].raster, dataset.raster))
  )
    throw new GisInputError(
      'Resolusi, origin, CRS atau periode raster berbeda; penyelarasan eksplisit diperlukan',
    );
  const bands = datasets.map((dataset, i) =>
    getBand(dataset.raster, refs[i].band),
  );
  if (
    op.operation !== 'classify' &&
    bands.some((band) => band.kind === 'categorical')
  )
    throw new GisInputError(
      'Kode kategorikal tidak boleh dinormalisasi atau dihitung sebagai besaran kontinu',
    );
  let unit = bands[0].unit;
  if (
    op.operation === 'weighted-overlay' &&
    bands.some((band) => band.unit !== unit)
  )
    throw new GisInputError('Overlay memerlukan satuan yang sama');
  if (op.operation === 'arithmetic') {
    const rightUnit = 'constant' in op.right ? op.right.unit : bands[1].unit;
    if (['add', 'subtract'].includes(op.operator) && rightUnit !== unit)
      throw new GisInputError('Penjumlahan/pengurangan memerlukan satuan sama');
    if (op.operator === 'multiply')
      unit =
        rightUnit === '1'
          ? unit
          : unit === '1'
            ? rightUnit
            : `${unit}·${rightUnit}`;
    if (op.operator === 'divide')
      unit =
        rightUnit === '1'
          ? unit
          : rightUnit === unit
            ? '1'
            : `${unit}/${rightUnit}`;
  }
  const samples = await Promise.all(
    refs.map((ref) => sample(ref, op.coordinate)),
  );
  const result: RasterValueResult = {
    value: null,
    unit,
    classification: null,
    noData: true,
    reason: 'source-nodata',
    coordinate: { ...op.coordinate },
    sources: refs.map((ref) => ({
      datasetId: ref.datasetId,
      band: getBand(rasterDataset(provider.catalog(), ref).raster, ref.band).id,
    })),
    demo: true,
  };
  if (samples.some((pixel) => pixel.noData))
    return finish({ kind: 'value', result });
  const value = samples[0].value!;
  if (op.operation === 'normalize') {
    result.value = Math.max(
      0,
      Math.min(1, (value - op.min) / (op.max - op.min)),
    );
    result.unit = '1';
  }
  if (op.operation === 'classify') {
    const classification = classifyValue(value, op.classes);
    result.value = classification?.value ?? null;
    result.classification = classification?.label ?? null;
    result.unit = 'kode kelas';
    result.reason = classification ? null : 'unclassified';
  }
  if (op.operation === 'arithmetic') {
    const right =
      'constant' in op.right ? op.right.constant : samples[1].value!;
    if (op.operator === 'divide' && right === 0) {
      result.reason = 'division-by-zero';
      return finish({ kind: 'value', result });
    }
    result.value =
      op.operator === 'add'
        ? value + right
        : op.operator === 'subtract'
          ? value - right
          : op.operator === 'multiply'
            ? value * right
            : value / right;
  }
  if (op.operation === 'weighted-overlay')
    result.value = samples.reduce(
      (sum, pixel, i) => sum + pixel.value! * op.inputs[i].weight,
      0,
    );
  if (result.value !== null && !Number.isFinite(result.value))
    throw new GisInputError('Hasil aritmetika tidak finite');
  result.noData = result.value === null;
  result.reason = result.noData ? result.reason : null;
  return finish({ kind: 'value', result });
}
