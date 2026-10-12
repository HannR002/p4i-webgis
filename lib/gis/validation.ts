import type { Dataset, MapAction, MapRecipe, RasterMetadata, PixelSample } from './contracts';
import { DEMO_AOIS } from './catalog';

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
  return Array.isArray(v) && v.length === 2 && finite(v[0], -85, 85) && finite(v[1], -180, 180);
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
    Object.keys(v).every((k) => ['palette', 'min', 'max'].includes(k)) &&
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
      valid = text(v.layerId, 100) && finite(v.index, 0, 30) && Number.isInteger(v.index);
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
export function parseRecipe(v: unknown, catalog: readonly Dataset[]): MapRecipe {
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
      !DEMO_AOIS.some((known) => known.id === aoi.id && known.name === aoi.name && known.kind === aoi.kind) ||
      !catalog.some((d) => d.id === 'demo-boundaries' && d.status === 'demo')
    ) throw new GisInputError('Identitas AOI belum tersedia atau tidak sesuai katalog');
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
      !finite(a.cr, 0, 100) ||
      !record(a.weights) ||
      Object.keys(a.weights).some((k) => !['bencana', 'kesuburan', 'kepadatan'].includes(k)) ||
      !['bencana', 'kesuburan', 'kepadatan'].every((k) =>
        finite(a.weights && record(a.weights) ? a.weights[k] : null, 0, 1),
      )
    )
      throw new GisInputError('Analisis tidak valid');
    const sum = Object.values(a.weights).reduce<number>((s, w) => s + Number(w), 0);
    if (Math.abs(sum - 1) > 0.01) throw new GisInputError('Bobot harus berjumlah satu');
  }
  // Select known fields: URLs, code, embedded geometry and credentials cannot enter the recipe.
  const checked = v as unknown as MapRecipe; // Every consumed field was checked above.
  return {
    schemaVersion: 1,
    id: checked.id,
    title: checked.title,
    description: checked.description,
    basemap: checked.basemap,
    viewport: { center: [...checked.viewport.center], zoom: checked.viewport.zoom },
    layers: checked.layers.map((l) => ({
      id: l.id,
      datasetId: l.datasetId,
      type: l.type,
      visible: l.visible,
      opacity: l.opacity,
      style:
        'palette' in l.style
          ? { palette: [...l.style.palette], min: l.style.min, max: l.style.max }
          : { color: l.style.color, fillColor: l.style.fillColor, weight: l.style.weight },
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
        }
      : null,
    provenance: checked.provenance,
  };
}
export function validateRasterMetadata(v: RasterMetadata): void {
  if (
    !text(v.crs) ||
    !finite(v.resolution.x, 0.00000001, 1e6) ||
    !finite(v.resolution.y, 0.00000001, 1e6) ||
    !['degree', 'metre'].includes(v.resolution.unit) ||
    !v.bands.length ||
    v.bands.some(
      (b) => !text(b.id) || !text(b.unit) || !['continuous', 'categorical'].includes(b.kind),
    ) ||
    (v.bands.some((b) => b.kind === 'categorical') && v.resampling !== 'nearest') ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.period.start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.period.end) ||
    v.period.start > v.period.end
  )
    throw new GisInputError('Metadata raster tidak valid');
}
export function validatePixelSample(s: PixelSample): void {
  if (
    !record(s) ||
    !coordinates([s.latitude, s.longitude]) ||
    !text(s.datasetId) ||
    typeof s.noData !== 'boolean' ||
    typeof s.demo !== 'boolean' ||
    (s.noData ? s.value !== null : !finite(s.value, -1e9, 1e9)) ||
    !text(s.version) ||
    !text(s.source) ||
    !text(s.unit) ||
    !text(s.band) ||
    !text(s.crs) ||
    !text(s.provenance, 2000) ||
    !record(s.resolution) ||
    !finite(s.resolution.x, 0.00000001, 1e6) ||
    !finite(s.resolution.y, 0.00000001, 1e6) ||
    !['metre', 'degree'].includes(s.resolution.unit) ||
    !record(s.period) ||
    !text(s.period.start) ||
    !text(s.period.end) ||
    !['nearest', 'bilinear'].includes(s.resampling) ||
    !(s.classification === null || text(s.classification))
  )
    throw new GisInputError('Sampel piksel tidak valid');
}
