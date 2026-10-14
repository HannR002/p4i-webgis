import type { GISToolName, GISToolRegistry, GISRisk } from './copilotContracts';
const definitions: [GISToolName, GISRisk, string, boolean?][] = [
  ['searchDatasetCatalog', 'read', 'Cari katalog yang diizinkan'],
  ['listAvailableLayers', 'read', 'Daftar dataset tersedia'],
  ['getDatasetMetadata', 'read', 'Metadata sumber dan raster'],
  ['summarizeCurrentMap', 'read', 'Ringkasan sesi'],
  ['inspectPixel', 'read', 'Sampel native provider lokal'],
  ['createMap', 'map-session', 'Buat resep sesi'],
  ['setMapTitle', 'map-session', 'Ubah judul'],
  ['setBasemap', 'map-session', 'Pilih basemap'],
  ['selectAOI', 'map-session', 'Pilih identitas AOI tersedia'],
  ['setViewport', 'map-session', 'Atur viewport'],
  ['addLayer', 'map-session', 'Tambahkan dataset'],
  ['removeLayer', 'map-session', 'Hapus layer dari sesi'],
  ['reorderLayer', 'map-session', 'Urutkan layer'],
  ['styleLayer', 'map-session', 'Style raster/vektor tervalidasi'],
  ['changeLayerOpacity', 'map-session', 'Atur opacity'],
  ['generateLegend', 'map-session', 'Susun legenda'],
  ['toggleLayer', 'map-session', 'Visibilitas layer'],
  ['setLayerOpacity', 'map-session', 'Alias opacity'],
  ['styleVectorLayer', 'map-session', 'Style vektor'],
  ['styleRasterLayer', 'map-session', 'Style raster'],
  ['zoomToLayer', 'map-session', 'Zoom ke cakupan'],
  ['listAnalysisConfigurations', 'read', 'Daftar konfigurasi yang diizinkan'],
  [
    'selectAnalysisConfiguration',
    'session-draft',
    'Pilih salinan konfigurasi ke editor',
  ],
  [
    'createAnalysisConfigurationDraft',
    'session-draft',
    'Buat draft eksperimental',
  ],
  [
    'proposeAnalysisConfigurationChanges',
    'session-draft',
    'Usulkan salinan draft baru',
  ],
  ['prepareAnalysis', 'read', 'Siapkan request tanpa menjalankan analisis'],
  [
    'applyAnalysisConfiguration',
    'map-session',
    'Terapkan preferensi AHP/WLC yang didukung',
  ],
  [
    'requestConfigurationSave',
    'approval-required',
    'Simpan konfigurasi lokal setelah persetujuan',
  ],
  ['publishMap', 'approval-required', 'Publikasi belum tersedia', false],
  [
    'runFloodAnalysis',
    'approval-required',
    'GEE berbiaya belum dihubungkan ke Copilot',
    false,
  ],
];
export const GIS_TOOL_REGISTRY: GISToolRegistry = Object.freeze(
  Object.fromEntries(
    definitions.map(([name, level, description, available = true]) => [
      name,
      Object.freeze({ name, level, description, available }),
    ]),
  ) as Record<GISToolName, GISToolRegistry[GISToolName]>,
);
