import type { GISPlanningInput } from '../../../gis/copilotContracts';
import {
  parseVectorAnalysisProposal,
  type VectorAnalysisProposal,
} from '../../../gis/vectorAnalysis';
/** Closed Indonesian grammar; no coordinates, database IDs, SQL or external provider calls. */
export function planSpatialAnalysis(
  input: GISPlanningInput,
): VectorAnalysisProposal | { clarification: string } | null {
  const p = input.prompt
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[.!?]$/, '');
  const buffer = p.match(
    /^(?:buat|buatkan) buffer (\d+(?:\.\d+)?) meter (?:dari|untuk) (?:titik |objek )?(.+)$/,
  );
  const area = p.match(
    /^hitung luas (?:poligon |polygon |kawasan )?(.+) dalam (hektare|hektar|m2)$/,
  );
  const length = p.match(
    /^hitung panjang (?:garis )?(.+) dalam (meter|kilometer)$/,
  );
  if (!buffer && !area && !length) return null;
  const name = buffer?.[2] ?? area?.[1] ?? length![1];
  const matches =
    input.recipe.sketchLayers?.flatMap((layer) =>
      layer.data.features
        .filter((f) =>
          name === 'terpilih'
            ? (input.selectedVectorIds ?? []).includes(f.id)
            : f.properties.name.toLowerCase() === name,
        )
        .map((f) => ({ layer, feature: f })),
    ) ?? [];
  if (
    !matches.length ||
    matches.length > 20 ||
    new Set(matches.map((m) => m.layer.id)).size !== 1 ||
    (name !== 'terpilih' && matches.length !== 1)
  )
    return {
      clarification:
        'Nama objek ambigu/tidak tersedia. Pilih 1–20 objek pada satu layer atau sebutkan nama unik; koordinat tidak dibuat.',
    };
  const operation = buffer ? 'buffer' : area ? 'area' : 'length';
  if (
    (area &&
      matches.some(
        (m) => !['Polygon', 'MultiPolygon'].includes(m.feature.geometry.type),
      )) ||
    (length &&
      matches.some(
        (m) =>
          !['LineString', 'MultiLineString'].includes(m.feature.geometry.type),
      ))
  )
    return {
      clarification:
        'Tipe geometri tidak sesuai pengukuran. Pilih polygon untuk luas atau garis untuk panjang.',
    };
  try {
    return parseVectorAnalysisProposal({
      tool: 'prepareVectorAnalysis',
      operation,
      layerId: matches[0].layer.id,
      featureIds: matches.map((m) => m.feature.id),
      parameters: buffer
        ? { distanceMetres: Number(buffer[1]) }
        : {
            unit: area
              ? area[2] === 'm2'
                ? 'm2'
                : 'ha'
              : length![2] === 'meter'
                ? 'm'
                : 'km',
          },
    });
  } catch {
    return {
      clarification:
        'Buffer harus 1–10000 meter; permintaan melampaui batas analisis lokal.',
    };
  }
}
