import type { GisPlanner } from '../contracts';
import type { MapAction } from '../../../gis/contracts';
import { canAccessDataset, executeMapPlan, GisPermissionError } from '../../../gis/recipe';
import { text, GisInputError } from '../../../gis/validation';

export function createDemoPlanner(): GisPlanner {
  return {
    async plan(prompt, recipe, catalog, context) {
      if (!text(prompt, 2000)) throw new GisInputError('Prompt harus berisi 1–2000 karakter');
      const p = prompt.toLowerCase();
      const actions: MapAction[] = [];
      const unavailable: string[] = [];
      if (/sql|javascript|shell|hapus.*data|restricted|privat|private|rahasia/i.test(p))
        throw new GisPermissionError(
          'Copilot tidak menjalankan kode atau membuka data privat melalui prompt',
        );
      if (/banjir|buffer|statistik|rata-rata|bandingkan|ekspor|pdf|overlay/.test(p))
        unavailable.push(
          'Komputasi jarak jauh / buffer / statistik / ekspor melalui AI belum tersedia. Gunakan panel analisis atau ekspor manual; hasil ilmiah tidak disimulasikan.',
        );
      if (/jelaskan|ringkas/.test(p))
        return {
          provider: 'deterministic-demo',
          intent: 'summarizeCurrentMap',
          message: `Peta “${recipe.title}” memiliki ${recipe.layers.length} layer. AOI: ${recipe.aoi?.name ?? 'belum dipilih'}. Layer demonstrasi bukan hasil ilmiah tervalidasi.`,
          actions: [],
          unavailable,
          sources: recipe.layers.map(
            (l) => catalog.find((d) => d.id === l.datasetId)?.source ?? '',
          ),
        };
      const matching = catalog.filter(
        (d) => d.tags.some((t) => p.includes(t)) || (p.includes('banjir') && d.type === 'raster'),
      );
      for (const d of matching)
        if (!canAccessDataset(d, context)) throw new GisPermissionError('Dataset tidak diizinkan');
      if (/buat.*peta|peta baru/.test(p) && matching.length)
        actions.push({
          tool: 'createMap',
          title: p.includes('banjir')
            ? 'Kajian banjir — konfigurasi demo'
            : 'Peta dari Copilot — demo',
        });
      for (const d of matching) {
        if (d.status === 'unavailable') unavailable.push(`${d.title}: adapter belum tersedia`);
        else actions.push({ tool: 'addLayer', datasetId: d.id });
      }
      if (/tanpa.*basemap/.test(p)) actions.push({ tool: 'setBasemap', basemap: 'none' });
      else if (/basemap|osm/.test(p)) actions.push({ tool: 'setBasemap', basemap: 'osm' });
      if (/barat/.test(p)) actions.push({ tool: 'selectAOI', aoiId: 'demo-aoi-west' });
      else if (/timur/.test(p)) actions.push({ tool: 'selectAOI', aoiId: 'demo-aoi-east' });
      if (/opacity|opasitas|transparan/.test(p)) {
        const percent = p.match(/(\d{1,3})\s*%/);
        if (percent)
          for (const l of recipe.layers)
            actions.push({
              tool: 'setLayerOpacity',
              layerId: l.id,
              opacity: Number(percent[1]) / 100,
            });
      }
      if (actions.length || /legenda/.test(p)) actions.push({ tool: 'generateLegend' });
      executeMapPlan(recipe, actions, catalog, context);
      return {
        provider: 'deterministic-demo',
        intent: 'configureMap',
        message: actions.length
          ? 'Konfigurasi peta disiapkan. Tinjau tindakan lalu terapkan ke sesi; Undo tersedia. Parser demo deterministik, bukan model AI eksternal.'
          : 'Sebutkan layer: curah hujan, lereng, tanah, tutupan lahan, atau batas kecamatan. AOI tersedia: area contoh Barat/Timur.',
        actions,
        unavailable,
        sources: matching.map((d) => `${d.title} · ${d.source} · ${d.version}`),
      };
    },
  };
}
