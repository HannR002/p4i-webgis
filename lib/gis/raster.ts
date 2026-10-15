import type {
  RasterBand,
  RasterCoordinate,
  RasterGrid,
  RasterMetadata,
  PixelSample,
  RasterDataset,
  RasterStyle,
} from './contracts';
import {
  GisInputError,
  finite,
  color,
  validateRasterMetadata,
} from './validation';
const WEB_MERCATOR_RADIUS = 6378137;
export const MERCATOR_LIMIT = 85.0511287798066;
export function transformCoordinate(
  point: RasterCoordinate,
  target: string,
): [number, number] {
  if (
    !['EPSG:4326', 'EPSG:3857'].includes(point.crs) ||
    !['EPSG:4326', 'EPSG:3857'].includes(target) ||
    ![point.x, point.y].every(Number.isFinite)
  )
    throw new GisInputError('CRS/koordinat tidak didukung lokal');
  let longitude: number, latitude: number;
  if (point.crs === 'EPSG:4326') {
    longitude = point.x;
    latitude = point.y;
  } else {
    if (
      Math.abs(point.x) > Math.PI * WEB_MERCATOR_RADIUS ||
      Math.abs(point.y) > Math.PI * WEB_MERCATOR_RADIUS
    )
      throw new GisInputError('Koordinat Web Mercator di luar domain');
    longitude = ((point.x / WEB_MERCATOR_RADIUS) * 180) / Math.PI;
    latitude =
      ((2 * Math.atan(Math.exp(point.y / WEB_MERCATOR_RADIUS)) - Math.PI / 2) *
        180) /
      Math.PI;
  }
  if (!finite(longitude, -180, 180) || !finite(latitude, -90, 90))
    throw new GisInputError('Koordinat geografis tidak valid');
  if (target === 'EPSG:4326') return [longitude, latitude];
  if (Math.abs(latitude) > MERCATOR_LIMIT + 1e-10)
    throw new GisInputError(
      'Lintang tidak dapat diproyeksikan ke Web Mercator',
    );
  return [
    ((longitude * Math.PI) / 180) * WEB_MERCATOR_RADIUS,
    WEB_MERCATOR_RADIUS *
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
  ];
}
export function gridPosition(
  grid: RasterGrid,
  x: number,
  y: number,
): { column: number; row: number; center: [number, number] } | null {
  const columnFloat = (x - grid.origin[0]) / grid.pixelSize[0];
  const rowFloat = (y - grid.origin[1]) / grid.pixelSize[1];
  // Snap only numerical noise at cell boundaries. East/south outer edges remain excluded.
  const snap = (v: number) =>
    Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v;
  const c = snap(columnFloat),
    r = snap(rowFloat);
  if (
    !Number.isFinite(c) ||
    !Number.isFinite(r) ||
    c < 0 ||
    r < 0 ||
    c >= grid.width ||
    r >= grid.height
  )
    return null;
  const column = Math.max(0, Math.floor(c)),
    row = Math.max(0, Math.floor(r));
  return { column, row, center: cellCenter(grid, column, row) };
}
export function cellCenter(
  grid: RasterGrid,
  column: number,
  row: number,
): [number, number] {
  return [
    grid.origin[0] + (column + 0.5) * grid.pixelSize[0],
    grid.origin[1] + (row + 0.5) * grid.pixelSize[1],
  ];
}
export function getBand(metadata: RasterMetadata, id?: string): RasterBand {
  const band = id
    ? metadata.bands.find((band) => band.id === id)
    : metadata.bands[0];
  if (!band) throw new GisInputError('Band raster tidak dikenal');
  return band;
}
export function bandRange(
  metadata: RasterMetadata,
  id?: string,
): [number, number] {
  return getBand(metadata, id).range ?? metadata.range ?? [0, 100];
}
export function gridsMatch(a: RasterMetadata, b: RasterMetadata): boolean {
  const tolerance = (x: number, y: number, cell: number) =>
    Math.max(
      Number.EPSILON * 8 * Math.max(1, Math.abs(x), Math.abs(y)),
      Math.abs(cell) * 1e-9,
    );
  return (
    a.crs === b.crs &&
    a.period.start === b.period.start &&
    a.period.end === b.period.end &&
    a.grid.width === b.grid.width &&
    a.grid.height === b.grid.height &&
    a.grid.pixelSize.every(
      (size, i) =>
        Math.abs(size - b.grid.pixelSize[i]) <=
        Math.max(Math.abs(size), Math.abs(b.grid.pixelSize[i])) * 1e-12,
    ) &&
    a.grid.origin.every(
      (origin, i) =>
        Math.abs(origin - b.grid.origin[i]) <=
        tolerance(origin, b.grid.origin[i], a.grid.pixelSize[i]),
    )
  );
}
export type CellReader = (
  column: number,
  row: number,
  band: string,
) => number | null;
export function sampleGrid(
  dataset: RasterDataset,
  coordinate: RasterCoordinate,
  bandId: string | undefined,
  method: 'nearest' | 'bilinear',
  read: CellReader,
): PixelSample {
  const metadata = dataset.raster;
  validateRasterMetadata(metadata);
  const band = getBand(metadata, bandId);
  if (band.kind === 'categorical' && method !== 'nearest')
    throw new GisInputError('Raster kategorikal hanya menggunakan nearest');
  const [x, y] = transformCoordinate(coordinate, metadata.crs);
  const [longitude, latitude] = transformCoordinate(coordinate, 'EPSG:4326');
  const cell = gridPosition(metadata.grid, x, y);
  let rawValue: number | null = null;
  let noDataReason: PixelSample['noDataReason'] = cell
    ? 'masked'
    : 'outside-coverage';
  function raw(c: number, r: number): number | null {
    if (c < 0 || r < 0 || c >= metadata.grid.width || r >= metadata.grid.height)
      return null;
    const value = read(c, r, band.id);
    if (value === null || value === metadata.noData.value) return null;
    if (!Number.isFinite(value))
      throw new Error('Provider returned a non-finite raw pixel');
    return value;
  }
  if (cell && method === 'nearest') rawValue = raw(cell.column, cell.row);
  if (cell && method === 'bilinear') {
    const u = (x - metadata.grid.origin[0]) / metadata.grid.pixelSize[0] - 0.5;
    const v = (y - metadata.grid.origin[1]) / metadata.grid.pixelSize[1] - 0.5;
    const c = Math.floor(u),
      r = Math.floor(v),
      dx = u - c,
      dy = v - r;
    const neighbors = [
      [c, r, (1 - dx) * (1 - dy)],
      [c + 1, r, dx * (1 - dy)],
      [c, r + 1, (1 - dx) * dy],
      [c + 1, r + 1, dx * dy],
    ];
    let total = 0,
      valid = true;
    for (const [column, row, weight] of neighbors) {
      if (weight < 1e-12) continue;
      const value = raw(column, row);
      if (value === null) {
        valid = false;
        break;
      }
      total += value * weight;
    }
    rawValue = valid ? total : null;
    noDataReason = 'invalid-neighborhood';
  }
  const value = rawValue === null ? null : rawValue * band.scale + band.offset;
  if (value !== null && !Number.isFinite(value))
    throw new Error('Provider returned a non-finite physical pixel');
  return {
    datasetId: dataset.id,
    latitude,
    longitude,
    requestedCoordinate: { ...coordinate },
    cell,
    rawValue,
    value,
    encoding: { scale: band.scale, offset: band.offset },
    bandKind: band.kind,
    unit: band.unit,
    classification:
      value === null
        ? null
        : (metadata.classes?.find((c) => c.value === value)?.label ?? null),
    source: dataset.source,
    version: dataset.version,
    period: { ...metadata.period },
    resolution: { ...metadata.resolution },
    crs: metadata.crs,
    band: band.id,
    noData: value === null,
    noDataReason: value === null ? noDataReason : null,
    resampling: method,
    provenance: dataset.provenance,
    demo: dataset.status === 'demo',
  };
}
export function classifyValue(
  value: number | null,
  classes: { from: number; to: number; output: number; label: string }[],
): { value: number; label: string } | null {
  if (value === null) return null;
  const match = classes.find((c) => value >= c.from && value < c.to);
  return match ? { value: match.output, label: match.label } : null;
}
export function rasterColor(
  value: number | null,
  metadata: RasterMetadata,
  style: RasterStyle,
): string | null {
  if (
    style.palette.length < 2 ||
    style.palette.length > 12 ||
    !style.palette.every(color) ||
    !finite(style.min, -1e9, 1e9) ||
    !finite(style.max, -1e9, 1e9) ||
    style.min >= style.max
  )
    throw new GisInputError('Style raster tidak valid');
  if (value === null) return null;
  if (!Number.isFinite(value))
    throw new GisInputError('Nilai style tidak finite');
  const band = getBand(metadata, style.band);
  if (band.kind === 'categorical') {
    const index = metadata.classes?.findIndex((c) => c.value === value) ?? -1;
    return index < 0 ? null : style.palette[index % style.palette.length];
  }
  return style.palette[
    Math.max(
      0,
      Math.min(
        style.palette.length - 1,
        Math.floor(
          ((value - style.min) / (style.max - style.min)) *
            (style.palette.length - 1),
        ),
      ),
    )
  ];
}
