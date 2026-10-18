import { VECTOR_TOOLS } from './vectorEditing';
import { COMPUTE_TOOLS, type ComputeCostClass } from './computeContracts';
import type { GISToolName, GISToolRegistry, GISRisk } from './copilotContracts';
const definitions: [GISToolName, GISRisk, string, boolean?][] = [
  [
    'prepareVectorAnalysis',
    'read',
    'Siapkan analisis PostGIS; estimasi, izin, dan eksekusi terpisah',
  ],
  ...VECTOR_TOOLS.map(
    (name) =>
      [name, 'map-session', 'Edit geometri sesi lokal dengan batas ukuran'] as [
        GISToolName,
        GISRisk,
        string,
      ],
  ),
  [
    'runConfiguredAnalysis',
    'map-session',
    'Komputasi konfigurasi dengan kebijakan biaya dinamis',
  ],
  ['calculateArea', 'map-session', 'Luas AOI fixture dengan batas sumber daya'],
  ['calculateDistance', 'map-session', 'Jarak dua titik EPSG:4326'],
  ['spatialSelection', 'map-session', 'Seleksi polygon fixture oleh titik'],
  ['searchDatasetCatalog', 'read', 'Cari katalog yang diizinkan'],
  ['listAvailableLayers', 'read', 'Daftar dataset tersedia'],
  ['getDatasetMetadata', 'read', 'Metadata sumber dan raster'],
  [
    'prepareClientDeliverableDraft',
    'read',
    'Siapkan teks draft deliverable, tanpa review/publikasi',
  ],
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
      Object.freeze({
        name,
        level,
        description,
        available,
        costClass: ((COMPUTE_TOOLS as readonly string[]).includes(name)
          ? 'LOW_COST_ANALYSIS'
          : name === 'runFloodAnalysis'
            ? 'APPROVAL_REQUIRED_ANALYSIS'
            : level === 'approval-required'
              ? 'PERSISTENT_SENSITIVE_ACTION'
              : level === 'read'
                ? 'READ_ONLY'
                : 'REVERSIBLE_MAP_ACTION') as ComputeCostClass,
      }),
    ]),
  ) as Record<GISToolName, GISToolRegistry[GISToolName]>,
);
