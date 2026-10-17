import type { GISPlanningInput } from '../../../gis/copilotContracts';
import type { MapAction } from '../../../gis/contracts';
import {
  DEFAULT_SKETCH_STYLE,
  parseVectorAction,
  type SketchStyle,
} from '../../../gis/vectorEditing';

/** Closed Indonesian grammar. Unknown coordinates/ambiguous object names never become inferred geometry. */
export function planVector(
  input: GISPlanningInput,
): { actions: MapAction[]; clarification?: string } | null {
  const p = input.prompt.trim(),
    lower = p.toLowerCase();
  const newMap = p.match(
    /^buat(?:kan)? peta baru (?:bernama|dengan nama)\s+(.+?)(?:\s+dan gunakan\s+(OpenStreetMap|OSM|tanpa basemap))?[.!]?$/i,
  );
  if (newMap)
    return {
      actions: [
        { tool: 'createMap', title: newMap[1].replace(/^"|"$/g, '') },
        {
          tool: 'setBasemap',
          basemap:
            newMap[2]?.toLowerCase() === 'tanpa basemap' ? 'none' : 'osm',
        },
      ],
    };
  if (/^(simpan|save).*peta|^simpan.*draft$/i.test(p))
    return {
      actions: [],
      clarification:
        'Klik Simpan draft untuk menyetujui penyimpanan lokal. Copilot tidak menyimpan otomatis.',
    };
  const createLayer = p.match(
    /^(?:buat|tambahkan)(?:kan)? layer vektor (?:bernama )?(.+?)[.!]?$/i,
  );
  if (createLayer)
    return {
      actions: [
        {
          tool: 'createVectorLayer',
          name: createLayer[1].replace(/^"|"$/g, ''),
        },
      ],
    };
  if (
    !/^(tambah(?:kan)?|buat(?:kan)?|ubah|ganti|hapus|edit|sembunyikan|tampilkan)\b/i.test(
      p,
    ) ||
    !/(titik|poligon|polygon|layer vektor)/i.test(p)
  )
    return null;
  const actions: MapAction[] = [],
    layers = input.recipe.sketchLayers ?? [];
  const missing = (clarification: string) => ({
    actions: [] as MapAction[],
    clarification,
  });
  const layerName =
    p.match(/(?:pada|di) layer "([^"]+)"/i)?.[1] ??
    p.match(/layer vektor "([^"]+)"/i)?.[1];
  const targets = layerName
    ? layers.filter((l) => l.name.toLowerCase() === layerName.toLowerCase())
    : layers;
  if (targets.length > 1)
    return missing('Ada beberapa layer. Tentukan pada layer "nama" yang unik.');
  if (layerName && !targets.length)
    return missing('Layer vektor tidak dikenal. Buat layer terlebih dahulu.');
  let layerId = targets[0]?.id;
  const creation = /^(tambah|buat)/i.test(p);
  if (!layerId) {
    if (!creation) return missing('Belum ada layer vektor lokal.');
    actions.push({ tool: 'createVectorLayer', name: 'Vektor lokal' });
    layerId = 'local-vector-1';
  }
  const colors: Record<string, string> = {
    merah: '#dc2626',
    hijau: '#16a34a',
    biru: '#2563eb',
    kuning: '#ca8a04',
    hitam: '#111827',
  };
  const requestedColor = p
    .match(/warna\s+(#[a-f0-9]{6}|merah|hijau|biru|kuning|hitam)/i)?.[1]
    ?.toLowerCase();
  const opacity = p.match(/(?:transparansi|opasitas)\s+(\d+(?:\.\d+)?)\s*%/i);
  const style: SketchStyle = {
    ...DEFAULT_SKETCH_STYLE,
    ...(requestedColor
      ? {
          color: colors[requestedColor] ?? requestedColor,
          fillColor: colors[requestedColor] ?? requestedColor,
        }
      : {}),
    ...(opacity
      ? {
          fillOpacity: /transparansi/i.test(opacity[0])
            ? 1 - Number(opacity[1]) / 100
            : Number(opacity[1]) / 100,
        }
      : {}),
  };
  const styled = !!requestedColor || !!opacity;
  const pairs = [
    ...p.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g),
  ].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  const namedCoordinates = p.match(
    /longitude\s+(-?\d+(?:\.\d+)?)\s+(?:dan\s+)?latitude\s+(-?\d+(?:\.\d+)?)/i,
  );
  const add = (action: MapAction) => {
    if (action.tool !== 'setMapTitle') parseVectorAction(action);
    actions.push(action);
    return { actions };
  };
  const nameOf = (raw: string) => raw.trim().replace(/^"|"$/g, '');
  const name = p.match(
    /(?:titik|poligon|polygon)\s+("[^"]+"|[\p{L}\p{N}_-]+)/iu,
  )?.[1];
  const features = layers.flatMap((l) =>
    l.data.features.map((f) => ({ f, l })),
  );
  if (creation && /poligon|polygon/i.test(p)) {
    if (/dari titik terpilih/i.test(p)) {
      if (!input.selectedVectorIds || input.selectedVectorIds.length < 3)
        return missing('Pilih minimal tiga titik dalam urutan keliling.');
      return add({
        tool: 'createPolygonFromSelectedPoints',
        layerId,
        name: 'Poligon pilihan',
        pointIds: input.selectedVectorIds,
        ...(styled ? { style } : {}),
      });
    }
    const from = p.match(
      /dari titik\s+(.+?)(?:\.\s*Beri|\s+beri|\s+warna|\s+pada layer|$)/i,
    );
    if (from) {
      const names = from[1]
        .replace(/\s+dan\s+/gi, ',')
        .split(',')
        .map((n) => nameOf(n.replace(/[.!]$/, '')))
        .filter(Boolean);
      if (names.length < 3)
        return missing(
          'Sebutkan minimal tiga nama titik dalam urutan keliling yang jelas.',
        );
      const ids: string[] = [];
      for (const n of names) {
        const found = features.filter(
          ({ f }) =>
            f.geometry.type === 'Point' &&
            f.properties.name.toLowerCase() === n.toLowerCase(),
        );
        if (found.length !== 1)
          return missing(
            `Titik ${n} tidak ditemukan atau ambigu. Gunakan nama unik dan urutan keliling.`,
          );
        ids.push(found[0].f.id);
      }
      return add({
        tool: 'createPolygonFromSelectedPoints',
        layerId,
        name: 'Poligon pilihan',
        pointIds: ids,
        ...(styled ? { style } : {}),
      });
    }
    if (pairs.length < 3)
      return missing(
        'Sebutkan minimal tiga vertex [longitude, latitude] atau nama titik berurutan.',
      );
    return add({
      tool: 'createPolygon',
      layerId,
      name:
        name && !['dari', 'dengan'].includes(name.toLowerCase())
          ? nameOf(name)
          : 'Poligon lokal',
      vertices: pairs,
      ...(styled ? { style } : {}),
    });
  }
  if (creation && /titik/i.test(p)) {
    if (pairs.length > 1) {
      const matches = [
        ...p.matchAll(
          /(?:titik\s+)?("[^"]+"|[\p{L}\p{N}_-]+)\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/giu,
        ),
      ];
      if (matches.length !== pairs.length)
        return missing(
          'Gunakan titik A [longitude, latitude]; B [longitude, latitude].',
        );
      return add({
        tool: 'createMultiplePoints',
        layerId,
        points: matches.map((m) => ({
          name: nameOf(m[1]),
          coordinates: [Number(m[2]), Number(m[3])],
          ...(styled ? { style } : {}),
        })),
      });
    }
    const coordinates = namedCoordinates
      ? ([Number(namedCoordinates[1]), Number(namedCoordinates[2])] as [
          number,
          number,
        ])
      : pairs[0];
    if (!coordinates || !name)
      return missing(
        'Sebutkan nama dan longitude serta latitude. Contoh: Tambahkan titik A pada longitude 103.61 dan latitude -1.61.',
      );
    return add({
      tool: 'createPoint',
      layerId,
      name: nameOf(name),
      coordinates,
      ...(styled ? { style } : {}),
    });
  }
  if (/layer vektor/.test(lower)) {
    const named = p.match(/layer vektor "([^"]+)"/i)?.[1];
    const found = layers.filter((l) => l.name === named);
    if (found.length !== 1)
      return missing('Sebutkan nama layer unik dalam tanda kutip.');
    const newName = p.match(/menjadi "([^"]+)"/i)?.[1];
    return add({
      tool: 'updateVectorLayer',
      layerId: found[0].id,
      ...(newName ? { name: newName } : {}),
      ...(styled ? { style } : {}),
      ...(/^hapus/i.test(p)
        ? { remove: true }
        : /^sembunyikan/i.test(p)
          ? { visible: false }
          : /^tampilkan/i.test(p)
            ? { visible: true }
            : {}),
    });
  }
  const found = features.filter(
    ({ f }) =>
      name && f.properties.name.toLowerCase() === nameOf(name).toLowerCase(),
  );
  if (found.length !== 1)
    return missing(
      'Sebutkan nama objek yang ada dan unik; gunakan tanda kutip untuk nama panjang.',
    );
  const { f, l } = found[0],
    target = { layerId: l.id, featureId: f.id };
  if (/^hapus/i.test(p)) return add({ tool: 'deleteFeature', ...target });
  const rename = p.match(/menjadi\s+("[^"]+"|[\p{L}\p{N}_-]+)/iu)?.[1];
  if (rename)
    return add({
      tool: 'updateFeatureProperties',
      ...target,
      name: nameOf(rename),
      description: f.properties.description,
      attributes: f.properties.attributes,
    });
  if (styled)
    return add({
      tool: 'styleFeature',
      ...target,
      style: {
        ...(f.properties.style ?? l.style),
        ...(requestedColor
          ? { color: style.color, fillColor: style.fillColor }
          : {}),
        ...(opacity ? { fillOpacity: style.fillOpacity } : {}),
      },
    });
  if (f.geometry.type === 'Point' && (namedCoordinates || pairs.length === 1))
    return add({
      tool: 'updateFeatureGeometry',
      ...target,
      geometry: {
        type: 'Point',
        coordinates: namedCoordinates
          ? [Number(namedCoordinates[1]), Number(namedCoordinates[2])]
          : pairs[0],
      },
    });
  if (f.geometry.type === 'Polygon' && pairs.length >= 3)
    return add({
      tool: 'updateFeatureGeometry',
      ...target,
      geometry: { type: 'Polygon', coordinates: [pairs] },
    });
  return missing(
    'Sebutkan nama baru, warna, atau koordinat eksplisit untuk edit objek.',
  );
}
