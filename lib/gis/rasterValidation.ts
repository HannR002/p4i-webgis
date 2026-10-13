import type {
  RasterCoordinate,
  RasterOperation,
  RasterOperand,
  RasterAlignment,
} from './contracts';
import { record, finite, text, GisInputError } from './validation';
import { transformCoordinate } from './raster';
function only(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new GisInputError('Parameter raster tidak diizinkan');
}
export function parseCoordinate(value: unknown): RasterCoordinate {
  if (
    !record(value) ||
    !finite(value.x, -1e9, 1e9) ||
    !finite(value.y, -1e9, 1e9) ||
    !['EPSG:4326', 'EPSG:3857'].includes(String(value.crs))
  )
    throw new GisInputError('Koordinat raster tidak valid');
  only(value, ['x', 'y', 'crs']);
  const result = value as unknown as RasterCoordinate;
  transformCoordinate(result, 'EPSG:4326');
  return { ...result };
}
function operand(value: unknown): RasterOperand {
  if (
    !record(value) ||
    !text(value.datasetId, 100) ||
    !(value.band === undefined || text(value.band, 100))
  )
    throw new GisInputError('Operand raster tidak valid');
  only(value, ['datasetId', 'band']);
  return {
    datasetId: value.datasetId,
    ...(typeof value.band === 'string' ? { band: value.band } : {}),
  };
}
function alignment(value: unknown): RasterAlignment {
  if (
    !record(value) ||
    !['native-only', 'resample'].includes(String(value.mode))
  )
    throw new GisInputError('Penyelarasan grid harus eksplisit');
  if (value.mode === 'native-only') {
    only(value, ['mode']);
    return { mode: 'native-only' };
  }
  // The future resampling contract is recognizable, but execution is unavailable locally.
  only(value, ['mode', 'grid', 'method', 'crs']);
  if (
    !record(value.grid) ||
    !Array.isArray(value.grid.origin) ||
    value.grid.origin.length !== 2 ||
    !value.grid.origin.every((n) => finite(n, -1e9, 1e9)) ||
    !Array.isArray(value.grid.pixelSize) ||
    value.grid.pixelSize.length !== 2 ||
    !finite(value.grid.pixelSize[0], 1e-10, 1e6) ||
    !finite(value.grid.pixelSize[1], -1e6, -1e-10) ||
    !finite(value.grid.width, 1, 1e6) ||
    !finite(value.grid.height, 1, 1e6) ||
    !Number.isInteger(value.grid.width) ||
    !Number.isInteger(value.grid.height) ||
    value.grid.pixelReference !== 'area' ||
    !['nearest', 'bilinear'].includes(String(value.method)) ||
    !['EPSG:4326', 'EPSG:3857'].includes(String(value.crs))
  )
    throw new GisInputError('Grid target tidak valid');
  only(value.grid, [
    'origin',
    'pixelSize',
    'width',
    'height',
    'pixelReference',
  ]);
  return structuredClone(value) as unknown as RasterAlignment;
}
export interface PixelQuery {
  coordinate: RasterCoordinate;
  datasetIds: string[];
  bands: Record<string, string>;
  resampling: 'nearest' | 'bilinear';
}
export function parsePixelQuery(value: unknown): PixelQuery {
  if (
    !record(value) ||
    !Array.isArray(value.datasetIds) ||
    !value.datasetIds.length ||
    value.datasetIds.length > 8 ||
    !value.datasetIds.every((id) => text(id, 100))
  )
    throw new GisInputError('Permintaan sampling tidak valid');
  only(value, [
    'datasetIds',
    'latitude',
    'longitude',
    'coordinate',
    'bands',
    'resampling',
  ]);
  if (
    value.coordinate !== undefined &&
    (value.latitude !== undefined || value.longitude !== undefined)
  )
    throw new GisInputError('Gunakan satu konvensi koordinat');
  const coordinate = parseCoordinate(
    value.coordinate ?? {
      x: value.longitude,
      y: value.latitude,
      crs: 'EPSG:4326',
    },
  );
  if (
    value.resampling !== undefined &&
    !['nearest', 'bilinear'].includes(String(value.resampling))
  )
    throw new GisInputError('Metode sampling tidak dikenal');
  const bands: Record<string, string> = {};
  if (value.bands !== undefined) {
    if (
      !record(value.bands) ||
      Object.entries(value.bands).some(
        ([id, band]) =>
          !(value.datasetIds as string[]).includes(id) || !text(band, 100),
      )
    )
      throw new GisInputError('Band sampling tidak valid');
    for (const [id, band] of Object.entries(value.bands))
      bands[id] = String(band);
  }
  return {
    coordinate,
    datasetIds: [...new Set(value.datasetIds as string[])],
    bands,
    resampling: value.resampling === 'bilinear' ? 'bilinear' : 'nearest',
  };
}
export function parseRasterOperation(value: unknown): RasterOperation {
  if (!record(value)) throw new GisInputError('Operasi raster tidak valid');
  const op = value.operation;
  if (op === 'sample') {
    only(value, ['operation', 'datasetIds', 'latitude', 'longitude']);
    const query = parsePixelQuery({
      datasetIds: value.datasetIds,
      latitude: value.latitude,
      longitude: value.longitude,
    });
    return {
      operation: 'sample',
      datasetIds: query.datasetIds,
      latitude: query.coordinate.y,
      longitude: query.coordinate.x,
    };
  }
  if (op === 'zonal-statistics' || op === 'clip' || op === 'mask') {
    only(value, [
      'operation',
      'datasetId',
      'band',
      'aoiId',
      ...(op === 'mask' ? ['keep'] : []),
    ]);
    const ref = operand({
      datasetId: value.datasetId,
      ...(value.band !== undefined ? { band: value.band } : {}),
    });
    if (
      !text(value.aoiId, 100) ||
      (op === 'mask' && !['inside', 'outside'].includes(String(value.keep)))
    )
      throw new GisInputError('AOI/mask tidak valid');
    return op === 'mask'
      ? {
          operation: 'mask',
          ...ref,
          aoiId: value.aoiId,
          keep: value.keep as 'inside' | 'outside',
        }
      : { operation: op, ...ref, aoiId: value.aoiId };
  }
  const coordinate = parseCoordinate(value.coordinate);
  if (op === 'normalize' || op === 'classify') {
    only(value, [
      'operation',
      'datasetId',
      'band',
      'coordinate',
      ...(op === 'normalize' ? ['min', 'max'] : ['classes']),
    ]);
    const ref = operand({
      datasetId: value.datasetId,
      ...(value.band !== undefined ? { band: value.band } : {}),
    });
    if (op === 'normalize') {
      if (
        !finite(value.min, -1e9, 1e9) ||
        !finite(value.max, -1e9, 1e9) ||
        value.min >= value.max
      )
        throw new GisInputError('Rentang normalisasi tidak valid');
      return {
        operation: op,
        ...ref,
        coordinate,
        min: value.min,
        max: value.max,
      };
    }
    if (
      !Array.isArray(value.classes) ||
      !value.classes.length ||
      value.classes.length > 20
    )
      throw new GisInputError('Kelas raster tidak valid');
    let previous = -Infinity;
    const classes = value.classes.map((c) => {
      if (
        !record(c) ||
        !finite(c.from, -1e9, 1e9) ||
        !finite(c.to, -1e9, 1e9) ||
        c.from >= c.to ||
        c.from < previous ||
        !finite(c.output, -1e9, 1e9) ||
        !text(c.label)
      )
        throw new GisInputError(
          'Interval kelas harus terurut dan tidak tumpang tindih',
        );
      only(c, ['from', 'to', 'output', 'label']);
      previous = c.to;
      return { from: c.from, to: c.to, output: c.output, label: c.label };
    });
    return { operation: op, ...ref, coordinate, classes };
  }
  if (op === 'arithmetic') {
    only(value, [
      'operation',
      'coordinate',
      'operator',
      'left',
      'right',
      'alignment',
    ]);
    if (
      !['add', 'subtract', 'multiply', 'divide'].includes(
        String(value.operator),
      )
    )
      throw new GisInputError('Operator raster tidak diizinkan');
    let right: RasterOperand | { constant: number; unit: string };
    if (record(value.right) && 'constant' in value.right) {
      only(value.right, ['constant', 'unit']);
      if (!finite(value.right.constant, -1e9, 1e9) || !text(value.right.unit))
        throw new GisInputError('Konstanta raster tidak valid');
      right = { constant: value.right.constant, unit: value.right.unit };
    } else right = operand(value.right);
    return {
      operation: op,
      coordinate,
      operator: value.operator as 'add' | 'subtract' | 'multiply' | 'divide',
      left: operand(value.left),
      right,
      alignment: alignment(value.alignment),
    };
  }
  if (op === 'weighted-overlay') {
    only(value, ['operation', 'coordinate', 'inputs', 'alignment']);
    if (
      !Array.isArray(value.inputs) ||
      value.inputs.length < 2 ||
      value.inputs.length > 8
    )
      throw new GisInputError('Input overlay tidak valid');
    const inputs = value.inputs.map((input) => {
      if (!record(input) || !finite(input.weight, 0, 1))
        throw new GisInputError('Bobot overlay tidak valid');
      only(input, ['datasetId', 'band', 'weight']);
      return {
        ...operand({
          datasetId: input.datasetId,
          ...(input.band !== undefined ? { band: input.band } : {}),
        }),
        weight: input.weight,
      };
    });
    if (
      Math.abs(inputs.reduce((sum, input) => sum + input.weight, 0) - 1) > 1e-9
    )
      throw new GisInputError('Bobot overlay harus berjumlah satu');
    return {
      operation: op,
      coordinate,
      inputs,
      alignment: alignment(value.alignment),
    };
  }
  throw new GisInputError('Operasi raster tidak diizinkan');
}
export function operationDatasetIds(op: RasterOperation): string[] {
  return op.operation === 'sample'
    ? op.datasetIds
    : op.operation === 'arithmetic'
      ? [
          op.left.datasetId,
          ...('datasetId' in op.right ? [op.right.datasetId] : []),
        ]
      : op.operation === 'weighted-overlay'
        ? op.inputs.map((input) => input.datasetId)
        : [op.datasetId];
}
