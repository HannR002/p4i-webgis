import type {
  AIProvider,
  GISPlanningInput,
  GISExecutionPlan,
  GISToolRequest,
} from '../../../gis/copilotContracts';
import { GIS_TOOL_REGISTRY } from '../../../gis/copilotRegistry';
import { mapActionFor } from '../../../gis/copilotValidation';
import { GisInputError, text } from '../../../gis/validation';
import { GisPermissionError } from '../../../gis/recipe';
import { getBand, bandRange } from '../../../gis/raster';
import { ANALYSIS_TYPES } from '../../../gis/analysisConfiguration';
const aliases: Record<string, readonly string[]> = {
  'demo-boundaries': [
    'batas kecamatan',
    'batas wilayah',
    'boundary',
    'boundaries',
  ],
  'demo-rainfall': ['curah hujan', 'rainfall', 'hujan'],
  'demo-slope': ['kemiringan', 'lereng', 'slope'],
  'demo-soil': ['tanah', 'soil'],
  'demo-landcover': ['tutupan lahan', 'land cover', 'landcover'],
};
function requestsUnresolvedPlace(prompt: string): boolean {
  const control = prompt.replace(/["“][^"”]*["”]/g, '');
  if (
    /\barea\s+contoh\b/.test(control) &&
    !/\barea\s+contoh\s+(barat|timur)\b/.test(control)
  )
    return true;
  return (
    /\b(kota|kabupaten|provinsi)\s+\p{L}+/u.test(control) ||
    /telanaipura|jelutung|danau teluk|pasar jambi|jambi timur|jambi selatan/.test(
      control,
    ) ||
    /\bdi\s+(?!pusat\b|titik\b|viewport\b|sesi\b|peta\b|area\s+contoh\b)\p{L}+/u.test(
      control,
    )
  );
}
// This closed grammar never treats catalog descriptions/tags/notes as instructions.
// Future LLM adapters still have to pass the same planner-output and tool validators.
export function createControlledDemoProvider(): AIProvider {
  return {
    id: 'deterministic-demo',
    mode: 'demo',
    async plan(input, signal) {
      if (signal?.aborted) throw new GisInputError('Permintaan dibatalkan');
      return planDemo(input);
    },
  };
}
export function planDemo(input: GISPlanningInput): GISExecutionPlan {
  if (!text(input.prompt, 2000))
    throw new GisInputError('Prompt harus 1–2000 karakter');
  const p = input.prompt.normalize('NFKC').toLowerCase();
  if (
    /\b(sql|javascript|python|shell|eval|sudo|curl|powershell)\b|abaikan.*(aturan|instruksi)|ignore.*(instructions|rules)|role\s*[:=]|super.?admin|grant.*access|hapus\s+(database|data|tabel)|delete\s+(database|table)/i.test(
      p,
    )
  )
    throw new GisPermissionError(
      'Instruksi kode, eskalasi peran atau akses istimewa tidak dijalankan',
    );
  const steps: GISExecutionPlan['steps'] = [],
    limitations: string[] = [];
  const base = {
    schemaVersion: 1 as const,
    id: `plan-${crypto.randomUUID()}`,
    provider: { id: 'deterministic-demo', mode: 'demo' as const },
    intent: 'modify-map' as GISExecutionPlan['intent'],
    resolution: 'ready' as GISExecutionPlan['resolution'],
    message:
      'Perubahan sesi aman dapat diterapkan otomatis; Undo tersedia. Planner DEMO deterministik, bukan model AI terhubung.',
    steps,
    limitations,
  };
  const add = (action: GISToolRequest) => {
    if (!GIS_TOOL_REGISTRY[action.tool])
      throw new GisInputError('Tool tidak dikenal');
    steps.push({ id: `step-${steps.length + 1}`, action });
  };
  const missing = (
    message: string,
    status: 'needs-input' | 'unsupported' = 'needs-input',
  ): GISExecutionPlan => ({
    ...base,
    resolution: status,
    intent: status === 'unsupported' ? 'unsupported' : base.intent,
    message,
    steps: [],
  });
  const tokens = p.split(/[^a-z0-9_-]+/);
  const matches = input.catalog.filter(
    (d) =>
      tokens.includes(d.id.toLowerCase()) ||
      (Object.hasOwn(aliases, d.id) &&
        aliases[d.id].some((alias) => p.includes(alias))),
  );
  if (/restricted|private|privat|rahasia/.test(p) && !matches.length)
    throw new GisPermissionError('Dataset tidak tersedia atau akses ditolak');
  const explicitId = p.match(
    /(?:dataset\s+id|id\s+dataset)\s+([-a-z0-9_]{1,100})/,
  );
  if (
    explicitId &&
    !input.catalog.some((d) => d.id.toLowerCase() === explicitId[1])
  )
    return missing(
      'Dataset tidak dikenal atau tidak diizinkan. Gunakan identitas dari katalog.',
    );
  const hasConfiguration = /konfigurasi|configuration/.test(p);
  if (hasConfiguration) {
    base.intent = 'analysis-configuration';
    if (/(?:daftar|list|lihat).*konfigurasi/.test(p)) {
      add({ tool: 'listAnalysisConfigurations' });
      return {
        ...base,
        message:
          'Daftar konfigurasi yang diizinkan; eksperimental bukan status validasi ilmiah.',
      };
    }
    const quoted = input.prompt.match(/["“]([^"”]{1,120})["”]/)?.[1];
    const found = input.configurations.filter((c) =>
      quoted
        ? c.name.toLowerCase() === quoted.toLowerCase() || c.id === quoted
        : tokens.includes(c.id.toLowerCase()),
    );
    if (
      /(?:buat|create).*draft.*konfigurasi|(?:buat|create).*konfigurasi.*(?:baru|draft)/.test(
        p,
      )
    ) {
      const type =
        ANALYSIS_TYPES.find((t) => p.includes(t.type))?.type ??
        (/ahp|smce/.test(p)
          ? 'ahp-smce'
          : /wlc|weighted linear/.test(p)
            ? 'wlc'
            : /zonal|statistik/.test(p)
              ? 'zonal-statistics'
              : /reklasifikasi|reclassification/.test(p)
                ? 'raster-reclassification'
                : /flood|banjir/.test(p)
                  ? 'flood-susceptibility'
                  : null);
      if (!type)
        return missing(
          'Sebutkan jenis konfigurasi yang didukung: AHP, WLC, zonal, reklasifikasi atau flood.',
        );
      add({
        tool: 'createAnalysisConfigurationDraft',
        analysisType: type,
        ...(quoted ? { name: quoted } : {}),
      });
      return {
        ...base,
        message: 'Draft eksperimental baru; belum disimpan atau dieksekusi.',
      };
    }
    if (found.length !== 1)
      return missing(
        found.length
          ? 'Nama konfigurasi ambigu; gunakan ID yang tercantum.'
          : 'Sebutkan nama konfigurasi dalam tanda kutip atau ID; minta daftar konfigurasi untuk melihat pilihan.',
      );
    const c = found[0];
    if (/simpan|save/.test(p)) {
      add({ tool: 'requestConfigurationSave', configurationId: c.id });
      return {
        ...base,
        message:
          'Penyimpanan lokal memerlukan persetujuan eksplisit atas snapshot konfigurasi.',
      };
    }
    if (/ubah|modifikasi|modify|ganti/.test(p)) {
      if (c.analysisType === 'ahp-smce') {
        const pairwise = { ...c.parameters.pairwise };
        let changed = false;
        for (const key of Object.keys(pairwise) as (keyof typeof pairwise)[]) {
          const m = input.prompt.match(
            new RegExp(`${key}\\s*[:=]?\\s*([0-9.]+)`, 'i'),
          );
          if (m) {
            pairwise[key] = Number(m[1]);
            changed = true;
          }
        }
        if (!changed)
          return missing(
            'AHP memakai matriks. Sebutkan rasio bencanaVsKesuburan, bencanaVsKepadatan atau kesuburanVsKepadatan.',
          );
        add({
          tool: 'proposeAnalysisConfigurationChanges',
          id: c.id,
          changes: { parameters: { pairwise } },
        });
      } else {
        if (!Object.keys(c.weights).length)
          return missing(
            'Konfigurasi ini tidak memakai bobot. Edit parameter bertipe pada panel Analisis.',
          );
        const weights = { ...c.weights };
        let changed = false;
        for (const key of Object.keys(weights)) {
          const m = p.match(new RegExp(`${key}\\s*[:=]?\\s*([0-9.]+)\\s*%`));
          if (m) {
            weights[key] = Number(m[1]) / 100;
            changed = true;
          }
        }
        if (!changed)
          return missing(
            'Sebutkan bobot dengan ID kriteria dan persentase, misalnya bencana 20%, kesuburan 30%, kepadatan 50%.',
          );
        add({
          tool: 'proposeAnalysisConfigurationChanges',
          id: c.id,
          changes: { weights },
        });
      }
      return {
        ...base,
        message:
          'Modifikasi menjadi draft AI baru; konfigurasi asal tidak diubah. Simpan hanya setelah persetujuan Anda.',
      };
    }
    if (/siapkan|prepare/.test(p))
      add({ tool: 'prepareAnalysis', configurationId: c.id });
    else if (/terapkan|apply/.test(p))
      add({ tool: 'applyAnalysisConfiguration', configurationId: c.id });
    else if (/pilih|gunakan|select|load|muat/.test(p))
      add({ tool: 'selectAnalysisConfiguration', id: c.id });
    else
      return missing(
        'Gunakan daftar, pilih, ubah, siapkan, terapkan atau simpan konfigurasi.',
      );
    return {
      ...base,
      message:
        'Konfigurasi eksperimental ditangani melalui kontrak Phase 04; tidak ada gate validasi metodologi.',
    };
  }
  if (/publikasikan|publish/.test(p)) {
    add({ tool: 'publishMap' });
    return base;
  }
  if (/(?:jalankan|hitung|run).*banjir|(?:jalankan|run).*gee/.test(p)) {
    add({ tool: 'runFloodAnalysis' });
    return base;
  }
  if (
    /buffer|overlay|ekspor|export|pdf|bandingkan metodologi|validasi ilmiah/.test(
      p,
    )
  )
    return missing(
      'Perintah ini tidak tersedia melalui Copilot. Gunakan panel yang didukung; tidak ada hasil komputasi atau ranking metodologi yang disimulasikan.',
      'unsupported',
    );
  if (/inspeksi|inspect|nilai piksel|nilai pixel|sample pixel/.test(p)) {
    if (requestsUnresolvedPlace(p))
      return missing(
        'AOI wilayah nyata/yang diminta belum tersedia; tidak ada sampel pengganti dari titik viewport.',
      );
    base.intent = 'read-map';
    const ids = matches.filter((d) => d.type === 'raster').map((d) => d.id);
    const selected = ids.length
      ? ids
      : input.recipe.layers
          .filter((l) => l.visible && l.type === 'raster')
          .map((l) => l.datasetId);
    if (!selected.length)
      return missing('Aktifkan raster yang tersedia untuk inspeksi pixel.');
    const coords = p.match(
      /(?:titik|koordinat)\s*\[?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
    );
    const [latitude, longitude] = coords
      ? [Number(coords[1]), Number(coords[2])]
      : input.recipe.viewport.center;
    const bands: Record<string, string> = {};
    for (const id of selected) {
      const layer = input.recipe.layers.find((l) => l.datasetId === id);
      if (layer && 'band' in layer.style && layer.style.band)
        bands[id] = layer.style.band;
    }
    add({
      tool: 'inspectPixel',
      datasetIds: selected,
      bands,
      coordinate: { x: longitude, y: latitude, crs: 'EPSG:4326' },
      resampling: 'nearest',
    });
    return {
      ...base,
      message: 'Inspeksi membaca nilai provider; hasil fixture selalu DEMO.',
    };
  }
  if (/daftar layer|list.*layers|layer tersedia/.test(p)) {
    base.intent = 'read-map';
    add({ tool: 'listAvailableLayers' });
    return base;
  }
  if (/metadata/.test(p)) {
    if (matches.length !== 1)
      return missing('Sebutkan tepat satu dataset untuk metadata.');
    base.intent = 'read-map';
    add({ tool: 'getDatasetMetadata', datasetId: matches[0].id });
    return base;
  }
  if (/^(cari|search)\b/.test(p)) {
    base.intent = 'read-map';
    add({
      tool: 'searchDatasetCatalog',
      query: input.prompt
        .replace(/^(cari|search)\s*(dataset|katalog)?\s*/i, '')
        .trim(),
    });
    return base;
  }
  if (/jelaskan|ringkas|summari/.test(p)) {
    base.intent = 'read-map';
    add({ tool: 'summarizeCurrentMap' });
    return base;
  }
  const demoPlace = /\b(contoh|demo|sintetik)\b/.test(p);
  if (requestsUnresolvedPlace(p))
    return missing(
      'AOI wilayah nyata belum tersedia pada adapter ini, termasuk Kota Jambi. Tidak diganti diam-diam dengan fixture. Gunakan area contoh Barat/Timur secara eksplisit atau hubungkan data berizin.',
    );
  const create = /buat(?:kan)?\s+(?:sebuah\s+)?peta|peta baru|create.*map/.test(
    p,
  );
  if (create && !matches.length)
    return missing(
      'Sebutkan dataset yang tersedia dari katalog; tidak ada dataset baru yang dibuat.',
    );
  const unavailable = matches.filter((d) => d.status === 'unavailable');
  if (unavailable.length)
    return missing(
      'Dataset yang diminta belum tersedia melalui adapter. Tidak ada pengganti atau pengukuran yang dibuat.',
    );
  const title = input.prompt.match(
    /(?:judul|nama(?:kan)?(?: peta)?)\s*["“]([^"”]{1,120})["”]/i,
  )?.[1];
  if (create) {
    base.intent = 'build-map';
    add({ tool: 'createMap', title: title ?? 'Peta dari Copilot — DEMO' });
  } else if (title) add({ tool: 'setMapTitle', title });
  const remove = /hapus\s+(?:layer\s+)?|remove.*layer/.test(p),
    reorder = /urutan|urutkan|pindah.*layer|reorder/.test(p);
  const style = /warna|style|palet|palette/.test(p),
    opacity = /opacity|opasitas|transparan/.test(p);
  const targets = matches.length
    ? matches.map((d) => ({
        id:
          input.recipe.layers.find((l) => l.datasetId === d.id)?.id ??
          `layer-${d.id}`,
        datasetId: d.id,
      }))
    : input.recipe.layers.map((l) => ({ id: l.id, datasetId: l.datasetId }));
  if (remove || reorder || style || opacity) {
    if (!targets.length)
      return missing('Pilih layer yang sudah ada dalam sesi.');
    if (
      !create &&
      targets.some((t) => !input.recipe.layers.some((l) => l.id === t.id))
    )
      return missing('Layer belum ada dalam sesi; tambahkan dahulu.');
  }
  if (remove)
    for (const t of targets) add({ tool: 'removeLayer', layerId: t.id });
  else {
    if (create || /tambah|add.*layer|tampilkan/.test(p))
      for (const d of matches) add({ tool: 'addLayer', datasetId: d.id });
    if (reorder) {
      const position = p.match(/(?:urutan|posisi)\s*(\d+)/);
      if (targets.length !== 1 || !position)
        return missing(
          'Sebutkan satu layer dan urutan berbasis 1, misalnya “Pindahkan tutupan lahan ke urutan 1”.',
        );
      add({
        tool: 'reorderLayer',
        layerId: targets[0].id,
        index: Number(position[1]) - 1,
      });
    }
    if (opacity) {
      const percent = p.match(/(\d+(?:\.\d+)?)\s*%/);
      if (!percent) return missing('Sebutkan opacity dalam persen 0–100%.');
      for (const t of targets)
        add({
          tool: 'changeLayerOpacity',
          layerId: t.id,
          opacity: Number(percent[1]) / 100,
        });
    }
    if (style) {
      const colors = input.prompt.match(/#[a-fA-F0-9]{6}\b/g);
      if (!colors?.length)
        return missing(
          'Sebutkan warna HEX #RRGGBB; raster memerlukan minimal dua warna.',
        );
      for (const t of targets) {
        const d = input.catalog.find((d) => d.id === t.datasetId)!;
        const current = input.recipe.layers.find((l) => l.id === t.id);
        if (d.raster) {
          if (colors.length < 2)
            return missing('Palet raster memerlukan minimal dua warna.');
          const band = getBand(
              d.raster,
              current && 'band' in current.style
                ? current.style.band
                : undefined,
            ),
            [min, max] = bandRange(d.raster, band.id);
          add({
            tool: 'styleLayer',
            layerId: t.id,
            style: { band: band.id, palette: colors, min, max },
          });
        } else
          add({
            tool: 'styleLayer',
            layerId: t.id,
            style: { color: colors[0], fillColor: colors[0], weight: 2 },
          });
      }
    }
  }
  if (/tanpa.*basemap/.test(p)) add({ tool: 'setBasemap', basemap: 'none' });
  else if (/basemap|osm/.test(p)) add({ tool: 'setBasemap', basemap: 'osm' });
  if (/barat|timur/.test(p)) {
    if (!demoPlace)
      return missing(
        'Sebutkan “area contoh Barat” atau “area contoh Timur” agar AOI sintetik tidak disamakan dengan wilayah nyata.',
      );
    const aoi = input.aois.find((a) =>
      a.id.endsWith(p.includes('barat') ? 'west' : 'east'),
    );
    if (!aoi) return missing('AOI contoh belum tersedia atau tidak diizinkan.');
    add({ tool: 'selectAOI', aoiId: aoi.id });
  }
  const view = p.match(
    /viewport\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+zoom\s+(\d+)/,
  );
  if (view)
    add({
      tool: 'setViewport',
      center: [Number(view[1]), Number(view[2])],
      zoom: Number(view[3]),
    });
  if (steps.length || /legenda|legend/.test(p)) add({ tool: 'generateLegend' });
  if (!steps.length)
    return missing(
      'Perintah belum dikenali. Pilih contoh prompt atau nama/ID katalog; tidak ada perubahan yang dilakukan.',
      'unsupported',
    );
  return base;
}
// Compatibility helper for consumers of the earlier map-action-only planner.
export function legacyActions(plan: GISExecutionPlan) {
  return plan.steps.flatMap((s) => {
    const action = mapActionFor(s.action);
    return action ? [action] : [];
  });
}
