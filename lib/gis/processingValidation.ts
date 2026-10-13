import type { RasterProcessingResult } from './contracts';
import {
  record,
  finite,
  text,
  parsePixelSample,
  GisInputError,
} from './validation';
export function parseProcessingResult(value: unknown): RasterProcessingResult {
  if (!record(value))
    throw new GisInputError('Respons operasi raster tidak valid');
  if (value.status === 'unavailable' && text(value.reason))
    return { status: 'unavailable', reason: value.reason };
  if (
    value.status !== 'ok' ||
    typeof value.demo !== 'boolean' ||
    !text(value.provenance, 2000) ||
    ![
      'sample',
      'zonal-statistics',
      'clip',
      'mask',
      'classify',
      'normalize',
      'arithmetic',
      'weighted-overlay',
    ].includes(String(value.operation)) ||
    !record(value.data)
  )
    throw new GisInputError('Respons operasi raster tidak valid');
  const data = value.data;
  if (data.kind === 'samples') {
    if (!Array.isArray(data.samples) || data.samples.length > 8)
      throw new GisInputError('Sampel operasi tidak valid');
    data.samples.forEach((sample) => parsePixelSample(sample));
  } else if (data.kind === 'statistics') {
    const s = data.statistics;
    if (
      !record(s) ||
      !finite(s.aoiAreaSquareMetres, 0, 1e18) ||
      s.areaMethod !== 'spherical approximation' ||
      !text(s.datasetId) ||
      !text(s.band) ||
      !text(s.unit) ||
      !text(s.method) ||
      !text(s.version) ||
      !text(s.crs) ||
      !text(s.provenance, 2000) ||
      typeof s.demo !== 'boolean' ||
      !['categorical', 'continuous'].includes(String(s.kind)) ||
      !['count', 'selectedCount', 'noDataCount'].every(
        (k) =>
          finite(s[k], 0, Number.MAX_SAFE_INTEGER) && Number.isInteger(s[k]),
      ) ||
      !['min', 'max', 'mean'].every(
        (k) => s[k] === null || finite(s[k], -1e18, 1e18),
      ) ||
      !Array.isArray(s.histogram) ||
      s.histogram.length > 20 ||
      s.histogram.some(
        (c) =>
          !record(c) ||
          !finite(c.value, -1e9, 1e9) ||
          !text(c.label) ||
          !finite(c.count, 0, Number.MAX_SAFE_INTEGER),
      ) ||
      !record(s.resolution) ||
      !finite(s.resolution.x, 1e-10, 1e6) ||
      !finite(s.resolution.y, 1e-10, 1e6) ||
      !['degree', 'metre'].includes(String(s.resolution.unit))
    )
      throw new GisInputError('Statistik raster tidak valid');
  } else if (data.kind === 'value') {
    const r = data.result;
    if (
      !record(r) ||
      !(r.value === null || finite(r.value, -1e18, 1e18)) ||
      typeof r.noData !== 'boolean' ||
      typeof r.demo !== 'boolean' ||
      !text(r.unit) ||
      !['source-nodata', 'division-by-zero', 'unclassified', null].includes(
        r.reason as string | null,
      ) ||
      !(r.classification === null || text(r.classification)) ||
      !record(r.coordinate) ||
      !finite(r.coordinate.x, -1e9, 1e9) ||
      !finite(r.coordinate.y, -1e9, 1e9) ||
      !['EPSG:4326', 'EPSG:3857'].includes(String(r.coordinate.crs)) ||
      !Array.isArray(r.sources) ||
      r.sources.length > 8 ||
      r.sources.some((s) => !record(s) || !text(s.datasetId) || !text(s.band))
    )
      throw new GisInputError('Hasil titik raster tidak valid');
  } else if (data.kind === 'subset') {
    const s = data.subset;
    if (
      !record(s) ||
      !text(s.datasetId) ||
      !text(s.band) ||
      !text(s.version) ||
      !text(s.crs) ||
      !record(s.nativeGrid) ||
      !Array.isArray(s.nativeGrid.origin) ||
      s.nativeGrid.origin.length !== 2 ||
      !s.nativeGrid.origin.every((n) => finite(n, -1e9, 1e9)) ||
      !Array.isArray(s.nativeGrid.pixelSize) ||
      s.nativeGrid.pixelSize.length !== 2 ||
      !finite(s.nativeGrid.pixelSize[0], 1e-10, 1e6) ||
      !finite(s.nativeGrid.pixelSize[1], -1e6, -1e-10) ||
      !finite(s.nativeGrid.width, 1, 1e6) ||
      !finite(s.nativeGrid.height, 1, 1e6) ||
      s.nativeGrid.pixelReference !== 'area' ||
      !text(s.aoiId) ||
      s.rule !== 'cell-center' ||
      !['inside', 'outside'].includes(String(s.keep)) ||
      s.artifact !== null ||
      !['selectedCount', 'validCount', 'noDataCount'].every(
        (k) =>
          finite(s[k], 0, Number.MAX_SAFE_INTEGER) && Number.isInteger(s[k]),
      ) ||
      (s.window !== null &&
        (!record(s.window) ||
          !['column', 'row', 'width', 'height'].every((k) =>
            finite(s.window && record(s.window) ? s.window[k] : null, 0, 1e6),
          )))
    )
      throw new GisInputError('Subset raster tidak valid');
  } else throw new GisInputError('Jenis hasil raster tidak dikenal');
  const checked = value as unknown as Extract<
    RasterProcessingResult,
    { status: 'ok' }
  >;
  let clean: typeof checked.data;
  if (checked.data.kind === 'samples')
    clean = {
      kind: 'samples',
      samples: checked.data.samples.map(parsePixelSample),
    };
  else if (checked.data.kind === 'statistics') {
    const s = checked.data.statistics;
    if (
      s.count + s.noDataCount !== s.selectedCount ||
      (s.kind === 'categorical' &&
        (s.mean !== null ||
          s.min !== null ||
          s.max !== null ||
          s.histogram.reduce((total, c) => total + c.count, 0) !== s.count))
    )
      throw new GisInputError('Statistik raster tidak konsisten');
    clean = {
      kind: 'statistics',
      statistics: {
        datasetId: s.datasetId,
        band: s.band,
        kind: s.kind,
        count: s.count,
        noDataCount: s.noDataCount,
        aoiAreaSquareMetres: s.aoiAreaSquareMetres,
        areaMethod: s.areaMethod,
        selectedCount: s.selectedCount,
        histogram: s.histogram.map((c) => ({
          value: c.value,
          label: c.label,
          count: c.count,
        })),
        min: s.min,
        max: s.max,
        mean: s.mean,
        unit: s.unit,
        method: s.method,
        version: s.version,
        demo: s.demo,
        crs: s.crs,
        resolution: {
          x: s.resolution.x,
          y: s.resolution.y,
          unit: s.resolution.unit,
        },
        provenance: s.provenance,
      },
    };
  } else if (checked.data.kind === 'value') {
    const r = checked.data.result;
    if (r.noData !== (r.value === null))
      throw new GisInputError('Mask hasil raster tidak konsisten');
    clean = {
      kind: 'value',
      result: {
        value: r.value,
        unit: r.unit,
        noData: r.noData,
        reason: r.reason,
        classification: r.classification,
        coordinate: {
          x: r.coordinate.x,
          y: r.coordinate.y,
          crs: r.coordinate.crs,
        },
        sources: r.sources.map((s) => ({
          datasetId: s.datasetId,
          band: s.band,
        })),
        demo: r.demo,
      },
    };
  } else {
    const s = checked.data.subset;
    if (s.validCount + s.noDataCount !== s.selectedCount)
      throw new GisInputError('Mask subset tidak konsisten');
    clean = {
      kind: 'subset',
      subset: {
        datasetId: s.datasetId,
        band: s.band,
        version: s.version,
        crs: s.crs,
        nativeGrid: {
          origin: [s.nativeGrid.origin[0], s.nativeGrid.origin[1]],
          pixelSize: [s.nativeGrid.pixelSize[0], s.nativeGrid.pixelSize[1]],
          width: s.nativeGrid.width,
          height: s.nativeGrid.height,
          pixelReference: s.nativeGrid.pixelReference,
        },
        window: s.window
          ? {
              column: s.window.column,
              row: s.window.row,
              width: s.window.width,
              height: s.window.height,
            }
          : null,
        aoiId: s.aoiId,
        rule: s.rule,
        keep: s.keep,
        selectedCount: s.selectedCount,
        validCount: s.validCount,
        noDataCount: s.noDataCount,
        artifact: null,
      },
    };
  }
  return {
    status: 'ok',
    operation: checked.operation,
    demo: checked.demo,
    provenance: checked.provenance,
    data: clean,
  };
}
