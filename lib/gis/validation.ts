import {
  VECTOR_TOOLS,
  parseVectorAction,
  parseSketchLayers,
} from './vectorEditing';
import { parseAnalysisMapResults } from './computeValidation';
import type {
  Dataset,
  MapAction,
  MapRecipe,
  RasterMetadata,
  PixelSample,
} from './contracts';
import { DEMO_AOIS } from './catalog';
import { parseAnalysisConfiguration } from './analysisConfiguration';
import { calculatePreferences } from '../../utils/analysisPreferences';

export class GisInputError extends Error {}
export function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function finite(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}
export function text(v: unknown, max = 200): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}
export function color(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}
export function coordinates(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    finite(v[0], -85, 85) &&
    finite(v[1], -180, 180)
  );
}
function vectorStyle(v: unknown): boolean {
  return (
    record(v) &&
    color(v.color) &&
    color(v.fillColor) &&
    finite(v.weight, 0, 10) &&
    Object.keys(v).every((k) => ['color', 'fillColor', 'weight'].includes(k))
  );
}
function rasterStyle(v: unknown): boolean {
  return (
    record(v) &&
    Object.keys(v).every((k) =>
      ['palette', 'min', 'max', 'band'].includes(k),
    ) &&
    (v.band === undefined || text(v.band, 100)) &&
    Array.isArray(v.palette) &&
    v.palette.length >= 2 &&
    v.palette.length <= 12 &&
    v.palette.every(color) &&
    finite(v.min, -1e9, 1e9) &&
    finite(v.max, -1e9, 1e9) &&
    v.min < v.max
  );
}
export function parseMapAction(v: unknown): MapAction {
  if (!record(v)) throw new GisInputError('Tindakan GIS tidak valid');
  if (VECTOR_TOOLS.includes(v.tool as (typeof VECTOR_TOOLS)[number]))
    return parseVectorAction(v);
  let valid = false;
  let keys: string[] = [];
  switch (v.tool) {
    case 'createMap':
    case 'setMapTitle':
      valid = text(v.title);
      keys = ['title'];
      break;
    case 'setBasemap':
      valid = v.basemap === 'osm' || v.basemap === 'none';
      keys = ['basemap'];
      break;
    case 'setViewport':
      valid = coordinates(v.center) && finite(v.zoom, 2, 18);
      keys = ['center', 'zoom'];
      break;
    case 'addLayer':
      valid = text(v.datasetId, 100);
      keys = ['datasetId'];
      break;
    case 'removeLayer':
    case 'zoomToLayer':
      valid = text(v.layerId, 100);
      keys = ['layerId'];
      break;
    case 'toggleLayer':
      valid = text(v.layerId, 100) && typeof v.visible === 'boolean';
      keys = ['layerId', 'visible'];
      break;
    case 'reorderLayer':
      valid =
        text(v.layerId, 100) &&
        finite(v.index, 0, 30) &&
        Number.isInteger(v.index);
      keys = ['layerId', 'index'];
      break;
    case 'setLayerOpacity':
      valid = text(v.layerId, 100) && finite(v.opacity, 0, 1);
      keys = ['layerId', 'opacity'];
      break;
    case 'styleVectorLayer':
      valid = text(v.layerId, 100) && vectorStyle(v.style);
      keys = ['layerId', 'style'];
      break;
    case 'styleRasterLayer':
      valid = text(v.layerId, 100) && rasterStyle(v.style);
      keys = ['layerId', 'style'];
      break;
    case 'selectAOI':
      valid = text(v.aoiId, 100);
      keys = ['aoiId'];
      break;
    case 'generateLegend':
      valid = true;
      break;
  }
  if (!valid || Object.keys(v).some((k) => !['tool', ...keys].includes(k)))
    throw new GisInputError('Tindakan atau parameter GIS tidak diizinkan');
  return structuredClone(v) as MapAction;
}
export function parseRecipe(
  v: unknown,
  catalog: readonly Dataset[],
): MapRecipe {
  if (
    !record(v) ||
    v.schemaVersion !== 1 ||
    !text(v.id, 100) ||
    !text(v.title) ||
    typeof v.description !== 'string' ||
    v.description.length > 2000 ||
    !['osm', 'none'].includes(String(v.basemap)) ||
    !record(v.viewport) ||
    !coordinates(v.viewport.center) ||
    !finite(v.viewport.zoom, 2, 18) ||
    !Array.isArray(v.layers) ||
    v.layers.length > 30 ||
    !['human', 'ai'].includes(String(v.provenance))
  )
    throw new GisInputError('MapRecipe tidak valid');
  const ids = new Set<string>();
  const datasetIds = new Set<string>();
  for (const l of v.layers) {
    if (
      !record(l) ||
      !text(l.id, 100) ||
      !text(l.datasetId, 100) ||
      ids.has(l.id) ||
      datasetIds.has(l.datasetId) ||
      typeof l.visible !== 'boolean' ||
      !finite(l.opacity, 0, 1)
    )
      throw new GisInputError('Konfigurasi layer tidak valid');
    const d = catalog.find((d) => d.id === l.datasetId);
    if (
      !d ||
      d.type !== l.type ||
      !(l.type === 'vector' ? vectorStyle(l.style) : rasterStyle(l.style))
    )
      throw new GisInputError('Dataset atau style tidak dikenal');
    if (l.type === 'raster' && record(l.style)) {
      const band = l.style.band;
      if (band !== undefined && !d.raster?.bands.some((b) => b.id === band))
        throw new GisInputError('Band raster tidak dikenal');
    }
    ids.add(l.id);
    datasetIds.add(l.datasetId);
  }
  if (
    v.aoi !== null &&
    (!record(v.aoi) ||
      !text(v.aoi.id, 100) ||
      !text(v.aoi.name) ||
      !['administrative', 'demo'].includes(String(v.aoi.kind)))
  )
    throw new GisInputError('AOI tidak valid');
  if (record(v.aoi)) {
    const aoi = v.aoi;
    if (
      !DEMO_AOIS.some(
        (known) =>
          known.id === aoi.id &&
          known.name === aoi.name &&
          known.kind === aoi.kind,
      ) ||
      !catalog.some((d) => d.id === 'demo-boundaries' && d.status === 'demo')
    )
      throw new GisInputError(
        'Identitas AOI belum tersedia atau tidak sesuai katalog',
      );
  }
  if (
    !Array.isArray(v.legend) ||
    v.legend.length > 30 ||
    v.legend.some(
      (l) =>
        !record(l) ||
        !text(l.datasetId, 100) ||
        !datasetIds.has(l.datasetId) ||
        !text(l.title) ||
        !Array.isArray(l.entries) ||
        l.entries.length > 20 ||
        l.entries.some((e) => !record(e) || !text(e.label) || !color(e.color)),
    )
  )
    throw new GisInputError('Legenda tidak valid');
  if (v.analysis !== null) {
    const a = v.analysis;
    if (
      !record(a) ||
      a.method !== 'ahp-wlc' ||
      a.provisional !== true ||
      (a.weightMethod !== undefined &&
        !['ahp', 'manual-wlc'].includes(String(a.weightMethod))) ||
      !finite(a.cr, 0, 100) ||
      !record(a.weights) ||
      Object.keys(a.weights).some(
        (k) => !['bencana', 'kesuburan', 'kepadatan'].includes(k),
      ) ||
      !['bencana', 'kesuburan', 'kepadatan'].every((k) =>
        finite(a.weights && record(a.weights) ? a.weights[k] : null, 0, 1),
      )
    )
      throw new GisInputError('Analisis tidak valid');
    const sum = Object.values(a.weights).reduce<number>(
      (s, w) => s + Number(w),
      0,
    );
    if (Math.abs(sum - 1) > 0.01)
      throw new GisInputError('Bobot harus berjumlah satu');
  }
  // Select known fields: URLs, code, embedded geometry and credentials cannot enter the recipe.
  const analysisConfiguration =
    v.analysisConfiguration === undefined
      ? undefined
      : parseAnalysisConfiguration(v.analysisConfiguration, catalog);
  if (
    analysisConfiguration &&
    ['ahp-smce', 'wlc'].includes(analysisConfiguration.analysisType)
  ) {
    const expectedMethod =
      analysisConfiguration.analysisType === 'wlc' ? 'manual-wlc' : 'ahp';
    if (
      !record(v.analysis) ||
      !record(v.analysis.weights) ||
      (v.analysis.weightMethod ?? 'ahp') !== expectedMethod ||
      !['bencana', 'kesuburan', 'kepadatan'].every(
        (key) =>
          record(v.analysis) &&
          record(v.analysis.weights) &&
          Math.abs(
            Number(v.analysis.weights[key]) -
              analysisConfiguration.weights[key],
          ) < 1e-9,
      )
    )
      throw new GisInputError('Bobot resep tidak sesuai konfigurasi aktif');
    const expectedCr =
      analysisConfiguration.analysisType === 'ahp-smce'
        ? Math.max(
            0,
            calculatePreferences(analysisConfiguration.parameters.pairwise).cr,
          )
        : 0;
    if (Math.abs(Number(v.analysis.cr) - expectedCr) > 1e-9)
      throw new GisInputError('CR resep tidak sesuai matriks konfigurasi');
  }
  const checked = v as unknown as MapRecipe; // Every consumed field was checked above.
  return {
    schemaVersion: 1,
    ...(v.sketchLayers === undefined
      ? {}
      : { sketchLayers: parseSketchLayers(v.sketchLayers) }),
    id: checked.id,
    title: checked.title,
    description: checked.description,
    basemap: checked.basemap,
    viewport: {
      center: [...checked.viewport.center],
      zoom: checked.viewport.zoom,
    },
    layers: checked.layers.map((l) => ({
      id: l.id,
      datasetId: l.datasetId,
      type: l.type,
      visible: l.visible,
      opacity: l.opacity,
      style:
        'palette' in l.style
          ? {
              palette: [...l.style.palette],
              min: l.style.min,
              max: l.style.max,
              ...(l.style.band ? { band: l.style.band } : {}),
            }
          : {
              color: l.style.color,
              fillColor: l.style.fillColor,
              weight: l.style.weight,
            },
    })),
    aoi: checked.aoi
      ? { id: checked.aoi.id, name: checked.aoi.name, kind: checked.aoi.kind }
      : null,
    legend: checked.legend.map((l) => ({
      datasetId: l.datasetId,
      title: l.title,
      entries: l.entries.map((e) => ({ color: e.color, label: e.label })),
    })),
    analysis: checked.analysis
      ? {
          method: 'ahp-wlc',
          weights: {
            bencana: checked.analysis.weights.bencana,
            kesuburan: checked.analysis.weights.kesuburan,
            kepadatan: checked.analysis.weights.kepadatan,
          },
          cr: checked.analysis.cr,
          provisional: true,
          ...(checked.analysis.weightMethod
            ? { weightMethod: checked.analysis.weightMethod }
            : {}),
        }
      : null,
    provenance: checked.provenance,
    ...(analysisConfiguration ? { analysisConfiguration } : {}),
    ...(v.analysisResults === undefined
      ? {}
      : { analysisResults: parseAnalysisMapResults(v.analysisResults) }),
  };
}
function validPeriod(v: unknown): boolean {
  if (!record(v) || typeof v.start !== 'string' || typeof v.end !== 'string')
    return false;
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  return valid(v.start) && valid(v.end) && v.start <= v.end;
}
export function validateRasterMetadata(v: RasterMetadata): void {
  if (
    !record(v) ||
    !text(v.crs) ||
    !text(v.version) ||
    !text(v.provenance, 2000) ||
    !finite(v.scale, 1e-10, 1e9) ||
    !record(v.resolution) ||
    !finite(v.resolution.x, 1e-10, 1e6) ||
    !finite(v.resolution.y, 1e-10, 1e6) ||
    !['degree', 'metre'].includes(v.resolution.unit) ||
    (v.crs === 'EPSG:4326' && v.resolution.unit !== 'degree') ||
    (v.crs === 'EPSG:3857' && v.resolution.unit !== 'metre') ||
    !record(v.grid) ||
    !Array.isArray(v.grid.origin) ||
    v.grid.origin.length !== 2 ||
    !v.grid.origin.every((n) => finite(n, -1e9, 1e9)) ||
    !Array.isArray(v.grid.pixelSize) ||
    v.grid.pixelSize.length !== 2 ||
    !finite(v.grid.pixelSize[0], 1e-10, 1e6) ||
    !finite(v.grid.pixelSize[1], -1e6, -1e-10) ||
    !Number.isInteger(v.grid.width) ||
    !finite(v.grid.width, 1, 1e6) ||
    !Number.isInteger(v.grid.height) ||
    !finite(v.grid.height, 1, 1e6) ||
    v.grid.pixelReference !== 'area' ||
    Math.abs(v.grid.pixelSize[0] - v.resolution.x) > v.resolution.x * 1e-12 ||
    Math.abs(-v.grid.pixelSize[1] - v.resolution.y) > v.resolution.y * 1e-12 ||
    !Array.isArray(v.bands) ||
    !v.bands.length ||
    v.bands.length > 32 ||
    v.bands.some(
      (b) =>
        !record(b) ||
        !text(b.id, 100) ||
        !text(b.unit) ||
        !['continuous', 'categorical'].includes(b.kind) ||
        !finite(b.scale, 1e-12, 1e9) ||
        !finite(b.offset, -1e9, 1e9) ||
        (b.kind === 'categorical' && (b.scale !== 1 || b.offset !== 0)) ||
        (b.range !== undefined &&
          (!Array.isArray(b.range) ||
            b.range.length !== 2 ||
            !b.range.every((n) => finite(n, -1e9, 1e9)) ||
            b.range[0] >= b.range[1])),
    ) ||
    new Set(v.bands.map((b) => b.id)).size !== v.bands.length ||
    !['nearest', 'bilinear'].includes(v.resampling) ||
    (v.bands.some((b) => b.kind === 'categorical') &&
      v.resampling !== 'nearest') ||
    !record(v.noData) ||
    !text(v.noData.meaning) ||
    !(v.noData.value === null || finite(v.noData.value, -1e9, 1e9)) ||
    !validPeriod(v.period) ||
    (v.range !== undefined &&
      (!Array.isArray(v.range) ||
        v.range.length !== 2 ||
        !v.range.every((n) => finite(n, -1e9, 1e9)) ||
        v.range[0] >= v.range[1])) ||
    (v.classes !== undefined &&
      (!Array.isArray(v.classes) ||
        !v.classes.length ||
        v.classes.length > 20 ||
        v.classes.some(
          (c) =>
            !record(c) ||
            !finite(c.value, -1e9, 1e9) ||
            !text(c.label) ||
            !color(c.color),
        ) ||
        new Set(v.classes.map((c) => c.value)).size !== v.classes.length)) ||
    (v.bands.some((b) => b.kind === 'categorical') && !v.classes?.length)
  )
    throw new GisInputError('Metadata raster tidak valid');
}
export function validatePixelSample(s: PixelSample): void {
  if (
    !record(s) ||
    !finite(s.latitude, -90, 90) ||
    !finite(s.longitude, -180, 180) ||
    !text(s.datasetId) ||
    typeof s.noData !== 'boolean' ||
    typeof s.demo !== 'boolean' ||
    (s.noData
      ? s.value !== null ||
        s.rawValue !== null ||
        !['outside-coverage', 'masked', 'invalid-neighborhood'].includes(
          String(s.noDataReason),
        )
      : !finite(s.value, -1e18, 1e18) ||
        !finite(s.rawValue, -1e18, 1e18) ||
        s.noDataReason !== null) ||
    !text(s.version) ||
    !text(s.source) ||
    !text(s.unit) ||
    !text(s.band) ||
    !text(s.crs) ||
    !text(s.provenance, 2000) ||
    !['continuous', 'categorical'].includes(s.bandKind) ||
    !record(s.encoding) ||
    !finite(s.encoding.scale, 1e-12, 1e9) ||
    !finite(s.encoding.offset, -1e9, 1e9) ||
    !record(s.requestedCoordinate) ||
    !finite(s.requestedCoordinate.x, -1e9, 1e9) ||
    !finite(s.requestedCoordinate.y, -1e9, 1e9) ||
    !['EPSG:4326', 'EPSG:3857'].includes(s.requestedCoordinate.crs) ||
    (s.cell !== null &&
      (!record(s.cell) ||
        !Number.isInteger(s.cell.column) ||
        !Number.isInteger(s.cell.row) ||
        !finite(s.cell.column, 0, 1e6) ||
        !finite(s.cell.row, 0, 1e6) ||
        !Array.isArray(s.cell.center) ||
        s.cell.center.length !== 2 ||
        !s.cell.center.every((n) => finite(n, -1e9, 1e9)))) ||
    !record(s.resolution) ||
    !finite(s.resolution.x, 1e-10, 1e6) ||
    !finite(s.resolution.y, 1e-10, 1e6) ||
    !['metre', 'degree'].includes(s.resolution.unit) ||
    !validPeriod(s.period) ||
    !['nearest', 'bilinear'].includes(s.resampling) ||
    !(s.classification === null || text(s.classification)) ||
    (s.bandKind === 'categorical' &&
      (s.resampling !== 'nearest' ||
        s.encoding.scale !== 1 ||
        s.encoding.offset !== 0))
  )
    throw new GisInputError('Sampel piksel tidak valid');
}

export function parsePixelSample(value: unknown): PixelSample {
  validatePixelSample(value as PixelSample);
  const s = value as PixelSample;
  return {
    datasetId: s.datasetId,
    latitude: s.latitude,
    longitude: s.longitude,
    value: s.value,
    rawValue: s.rawValue,
    bandKind: s.bandKind,
    encoding: { scale: s.encoding.scale, offset: s.encoding.offset },
    requestedCoordinate: {
      x: s.requestedCoordinate.x,
      y: s.requestedCoordinate.y,
      crs: s.requestedCoordinate.crs,
    },
    cell: s.cell
      ? {
          column: s.cell.column,
          row: s.cell.row,
          center: [s.cell.center[0], s.cell.center[1]],
        }
      : null,
    noDataReason: s.noDataReason,
    unit: s.unit,
    classification: s.classification,
    source: s.source,
    version: s.version,
    period: { start: s.period.start, end: s.period.end },
    resolution: {
      x: s.resolution.x,
      y: s.resolution.y,
      unit: s.resolution.unit,
    },
    crs: s.crs,
    band: s.band,
    noData: s.noData,
    resampling: s.resampling,
    provenance: s.provenance,
    demo: s.demo,
  };
}
