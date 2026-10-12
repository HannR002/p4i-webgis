import type { MapAction } from '../../../gis/contracts';
export const GIS_TOOL_REGISTRY: Record<
  MapAction['tool'],
  { level: 'map-session'; description: string }
> = {
  createMap: { level: 'map-session', description: 'Buat resep peta baru' },
  setMapTitle: { level: 'map-session', description: 'Ubah judul' },
  setBasemap: { level: 'map-session', description: 'Pilih basemap' },
  setViewport: { level: 'map-session', description: 'Pindahkan viewport' },
  addLayer: { level: 'map-session', description: 'Tambahkan dataset yang diizinkan' },
  removeLayer: { level: 'map-session', description: 'Hapus layer dari sesi' },
  toggleLayer: { level: 'map-session', description: 'Tampilkan/sembunyikan layer' },
  reorderLayer: { level: 'map-session', description: 'Ubah urutan layer' },
  setLayerOpacity: { level: 'map-session', description: 'Ubah transparansi' },
  styleVectorLayer: { level: 'map-session', description: 'Style vektor' },
  styleRasterLayer: { level: 'map-session', description: 'Style raster' },
  zoomToLayer: { level: 'map-session', description: 'Perbesar ke layer' },
  selectAOI: { level: 'map-session', description: 'Pilih identitas AOI' },
  generateLegend: { level: 'map-session', description: 'Susun legenda' },
};
export const READ_TOOLS = [
  'searchDatasetCatalog',
  'listAvailableLayers',
  'getLayerMetadata',
  'samplePixel',
  'summarizeCurrentMap',
] as const;
export const REMOTE_TOOLS = [
  'runFloodAnalysis',
  'getZonalStatistics',
  'createBuffer',
  'runWeightedOverlay',
  'publishMap',
] as const;
// These remote tools cannot execute here. A future adapter must require server authorization
// and a separately confirmed request for persistent, expensive or destructive actions.
