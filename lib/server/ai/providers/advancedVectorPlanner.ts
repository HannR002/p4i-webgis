import type { GISPlanningInput } from '../../../gis/copilotContracts';
import type { MapAction } from '../../../gis/contracts';
import {
  editVertex,
  parseVectorAction,
  lonLat,
} from '../../../gis/vectorEditing';
/** Closed grammar, local IDs only. No inference of real-world coordinates. */
export function planAdvancedVector(
  input: GISPlanningInput,
): { actions: MapAction[]; clarification?: string } | null {
  const p = input.prompt.trim().replace(/[.!]$/, ''),
    layers = input.recipe.sketchLayers ?? [];
  const missing = (clarification: string) => ({
    actions: [] as MapAction[],
    clarification,
  });
  const result = (action: unknown) => ({
    actions: [parseVectorAction(action)] as MapAction[],
  });
  const all = layers.flatMap((l) => l.data.features.map((f) => ({ l, f })));
  const selected = all.filter(({ f }) =>
    input.selectedVectorIds?.includes(f.id),
  );
  const newLayer = p.match(
    /^buat(?:kan)? layer (?:garis|poligon|titik) bernama (.+)$/i,
  );
  if (newLayer)
    return result({
      tool: 'createVectorLayer',
      name: newLayer[1].replace(/^"|"$/g, ''),
    });
  const table = p.match(/^tampilkan tabel atribut layer (.+)$/i);
  if (table) {
    const found = layers.filter(
      (l) =>
        l.name.toLowerCase() === table[1].replace(/^"|"$/g, '').toLowerCase(),
    );
    return found.length === 1
      ? result({ tool: 'inspectVectorTable', layerId: found[0].id })
      : missing('Sebutkan nama layer yang ada dan unik.');
  }
  if (/^zoom ke objek (?:yang saya pilih|terpilih)$/i.test(p)) {
    if (!selected.length || new Set(selected.map(({ l }) => l.id)).size !== 1)
      return missing('Pilih objek dalam satu layer lokal.');
    return result({
      tool: 'zoomVectorFeatures',
      layerId: selected[0].l.id,
      featureIds: selected.map(({ f }) => f.id),
    });
  }
  if (/^buat(?:kan)? poligon dari titik-titik yang saya pilih$/i.test(p)) {
    if (
      selected.length < 3 ||
      selected.some(({ f }) => f.geometry.type !== 'Point')
    )
      return missing('Pilih minimal tiga titik dalam urutan keliling.');
    return result({
      tool: 'createPolygonFromSelectedPoints',
      layerId: selected[0].l.id,
      name: 'Poligon pilihan',
      pointIds: input.selectedVectorIds,
    });
  }
  if (/^tambahkan satu vertex di antara titik kedua dan ketiga$/i.test(p)) {
    if (
      selected.length !== 1 ||
      selected[0].f.geometry.type !== 'LineString' ||
      selected[0].f.geometry.coordinates.length < 3
    )
      return missing(
        'Pilih satu garis dengan minimal tiga vertex. Vertex baru adalah titik tengah segmen kedua.',
      );
    const { f, l } = selected[0];
    return result({
      tool: 'updateFeatureGeometry',
      layerId: l.id,
      featureId: f.id,
      geometry: editVertex(f.geometry, [], 1, 'insert'),
    });
  }
  const style = p.match(
    /^ubah warna garis(?: "([^"]+)")? menjadi (biru|merah|hijau|hitam)$/i,
  );
  if (style) {
    const found = (
      style[1]
        ? all.filter(
            ({ f }) =>
              f.properties.name.toLowerCase() === style[1].toLowerCase(),
          )
        : selected
    ).filter(({ f }) =>
      ['LineString', 'MultiLineString'].includes(f.geometry.type),
    );
    if (found.length !== 1)
      return missing(
        'Pilih satu garis atau sebutkan nama garis unik dalam tanda kutip.',
      );
    const { f, l } = found[0],
      colors: Record<string, string> = {
        biru: '#2563eb',
        merah: '#dc2626',
        hijau: '#16a34a',
        hitam: '#111827',
      };
    return result({
      tool: 'styleFeature',
      layerId: l.id,
      featureId: f.id,
      style: {
        ...(f.properties.style ?? l.style),
        color: colors[style[2].toLowerCase()],
      },
    });
  }
  const from = p.match(
    /^buat(?:kan)? garis dari titik (.+?) ke titik (.+?)(?: pada layer "([^"]+)")?$/i,
  );
  if (from) {
    const points = [from[1], from[2]].map((name) =>
      all.filter(
        ({ f }) =>
          f.geometry.type === 'Point' &&
          f.properties.name.toLowerCase() ===
            name.replace(/^"|"$/g, '').toLowerCase(),
      ),
    );
    if (points.some((matches) => matches.length !== 1))
      return missing(
        'Nama titik tidak ditemukan atau ambigu. Gunakan nama unik.',
      );
    const targets = from[3]
      ? layers.filter((l) => l.name.toLowerCase() === from[3].toLowerCase())
      : layers;
    if (targets.length !== 1)
      return missing('Tentukan pada layer "nama" yang unik untuk garis.');
    return result({
      tool: 'createFeature',
      layerId: targets[0].id,
      name: `Garis ${from[1]}–${from[2]}`,
      geometry: {
        type: 'LineString',
        coordinates: points.map(([{ f }]) => lonLat(f.geometry.coordinates)),
      },
    });
  }
  if (/^(buat|ubah|edit|tambahkan).*\b(garis|vertex)\b/i.test(p))
    return missing(
      'Gunakan nama titik yang sudah ada: Buat garis dari titik A ke titik B. Untuk vertex, pilih satu garis terlebih dahulu.',
    );
  return null;
}
