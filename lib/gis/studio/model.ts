import type { FeatureCollection, Feature, Geometry, Position } from "geojson";
export type VectorCollection = FeatureCollection<Geometry | null>;
export type VectorFeature = Feature<Geometry | null>;
export const STUDIO_LIMITS = {
  bytes: 10 * 1024 * 1024,
  expanded: 25 * 1024 * 1024,
  features: 10000,
  vertices: 150000,
  layers: 8,
  attributes: 80,
} as const;
export class StudioError extends Error {}
export function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new StudioError(message);
}
export function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function exact(
  v: unknown,
  keys: string[],
): asserts v is Record<string, unknown> {
  check(
    record(v) && Object.keys(v).every((k) => keys.includes(k)),
    "Struktur/properti tidak didukung.",
  );
}
export const shortText = (v: unknown, max = 160): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;
export type Scalar = string | number | boolean | null;
export type Source = {
  kind: "user-vector" | "synthetic";
  format: "geojson" | "shapefile";
  files: { name: string; bytes: number; sha256: string }[];
  importedAt: string;
  originalCRS: string;
  outputCRS: "OGC:CRS84";
  processing: "user-declared-ArcGIS" | "not-specified";
  citation: string;
  license: string;
};
export type StudioLayer = {
  id: string;
  name: string;
  visible: boolean;
  color: string;
  opacity: number;
  filter: { field: string; equals: Scalar } | null;
  data: VectorCollection;
  source: Source;
};
export type StudioDocument = {
  schemaVersion: 1;
  id: string;
  revision: string;
  title: string;
  basemap: "none" | "osm";
  layers: StudioLayer[];
  focus: string | null;
  updatedAt: string;
};
export const BASEMAPS = {
  none: {
    name: "Tanpa peta dasar",
    kind: "none",
    source: "Tidak ada permintaan tile eksternal",
    license: "Tidak berlaku",
    url: null,
  },
  osm: {
    name: "OpenStreetMap Standard",
    kind: "raster-display-only",
    source: "OpenStreetMap contributors",
    license: "ODbL untuk data OSM; ikuti kebijakan tile",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    attributionURL: "https://www.openstreetmap.org/copyright",
    policy: "https://operations.osmfoundation.org/policies/tiles/",
  },
} as const;
export function freshDocument(): StudioDocument {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    revision: crypto.randomUUID(),
    title: "Peta vektor baru",
    basemap: "none",
    layers: [],
    focus: null,
    updatedAt: new Date().toISOString(),
  };
}
function attributes(v: unknown, depth = 0): void {
  check(depth <= 8, "Atribut terlalu dalam.");
  if (v === null || typeof v === "boolean") return;
  if (typeof v === "number") {
    check(Number.isFinite(v), "Angka atribut harus finite.");
    return;
  }
  if (typeof v === "string") {
    check(v.length <= 4096, "Teks atribut terlalu panjang.");
    return;
  }
  check(Array.isArray(v) || record(v), "Nilai atribut tidak sah.");
  if (Array.isArray(v)) {
    check(v.length <= 100, "Array atribut terlalu besar.");
    v.forEach((x) => attributes(x, depth + 1));
    return;
  }
  const entries = Object.entries(v);
  check(entries.length <= STUDIO_LIMITS.attributes, "Terlalu banyak atribut.");
  entries.forEach(([key, value]) => {
    check(
      key.length <= 160 &&
        !["__proto__", "prototype", "constructor"].includes(key),
      "Nama atribut tidak sah.",
    );
    attributes(value, depth + 1);
  });
}
export function normalizeGeoJSON(value: unknown): VectorCollection {
  check(
    record(value) &&
      value.type === "FeatureCollection" &&
      Array.isArray(value.features),
    "Gunakan GeoJSON FeatureCollection hasil ekspor WGS84.",
  );
  check(
    value.features.length > 0 &&
      value.features.length <= STUDIO_LIMITS.features,
    "Gunakan 1–10.000 fitur per layer.",
  );
  if (value.crs !== undefined) {
    const crs = value.crs;
    check(
      record(crs) &&
        record(crs.properties) &&
        typeof crs.properties.name === "string" &&
        /(?:CRS84|EPSG(?::|::)4326)$/i.test(crs.properties.name),
      "GeoJSON berproyeksi harus diekspor ulang ke WGS84 (longitude, latitude).",
    );
  }
  let vertices = 0;
  const position = (p: unknown): Position => {
    check(
      Array.isArray(p) &&
        (p.length === 2 || p.length === 3) &&
        p.every((n) => typeof n === "number" && Number.isFinite(n)),
      "Koordinat harus 2/3 angka finite.",
    );
    check(
      p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90,
      "Koordinat di luar longitude/latitude WGS84. Periksa CRS.",
    );
    check(
      ++vertices <= STUDIO_LIMITS.vertices,
      "Batas 150.000 vertex terlampaui.",
    );
    return [...p];
  };
  const line = (v: unknown, ring = false): Position[] => {
    check(
      Array.isArray(v) && v.length >= (ring ? 4 : 2),
      "Garis/ring tidak lengkap.",
    );
    const result = v.map(position);
    if (ring)
      check(
        result[0].length === result.at(-1)!.length &&
          result[0].every((n, i) => n === result.at(-1)![i]),
        "Ring poligon harus tertutup.",
      );
    return result;
  };
  const polygon = (v: unknown): Position[][] => {
    check(Array.isArray(v) && v.length > 0, "Poligon tanpa ring.");
    return v.map((x) => line(x, true));
  };
  const geometry = (g: unknown, depth = 0): Geometry => {
    check(record(g) && depth <= 4, "Geometri tidak sah/terlalu dalam.");
    switch (g.type) {
      case "Point":
        return { type: "Point", coordinates: position(g.coordinates) };
      case "MultiPoint":
        check(
          Array.isArray(g.coordinates) && g.coordinates.length > 0,
          "MultiPoint kosong.",
        );
        return { type: "MultiPoint", coordinates: g.coordinates.map(position) };
      case "LineString":
        return { type: "LineString", coordinates: line(g.coordinates) };
      case "MultiLineString":
        check(
          Array.isArray(g.coordinates) && g.coordinates.length > 0,
          "MultiLineString kosong.",
        );
        return {
          type: "MultiLineString",
          coordinates: g.coordinates.map((x) => line(x)),
        };
      case "Polygon":
        return { type: "Polygon", coordinates: polygon(g.coordinates) };
      case "MultiPolygon":
        check(
          Array.isArray(g.coordinates) && g.coordinates.length > 0,
          "MultiPolygon kosong.",
        );
        return {
          type: "MultiPolygon",
          coordinates: g.coordinates.map(polygon),
        };
      case "GeometryCollection":
        check(
          Array.isArray(g.geometries) &&
            g.geometries.length > 0 &&
            g.geometries.length <= 100,
          "GeometryCollection tidak sah.",
        );
        return {
          type: "GeometryCollection",
          geometries: g.geometries.map((x) => geometry(x, depth + 1)),
        };
      default:
        throw new StudioError("Tipe geometri tidak didukung.");
    }
  };
  const features = value.features.map((f) => {
    check(
      record(f) &&
        f.type === "Feature" &&
        (f.properties === null || record(f.properties)),
      "Fitur/atribut tidak sah.",
    );
    attributes(f.properties);
    check(
      f.id === undefined ||
        shortText(f.id, 160) ||
        (typeof f.id === "number" && Number.isFinite(f.id)),
      "ID fitur tidak sah.",
    );
    return {
      type: "Feature" as const,
      ...(f.id === undefined ? {} : { id: f.id as string | number }),
      properties: structuredClone(f.properties),
      geometry: f.geometry === null ? null : geometry(f.geometry),
    };
  });
  check(vertices > 0, "Layer tidak memiliki geometri yang dapat ditampilkan.");
  return { type: "FeatureCollection", features };
}
export function fields(layer: StudioLayer): string[] {
  return [
    ...new Set(
      layer.data.features.flatMap((f) => Object.keys(f.properties ?? {})),
    ),
  ].sort();
}
export function visibleFeatures(layer: StudioLayer): VectorCollection {
  const filter = layer.filter;
  return {
    type: "FeatureCollection",
    features: filter
      ? layer.data.features.filter(
          (f) =>
            Object.hasOwn(f.properties ?? {}, filter.field) &&
            f.properties?.[filter.field] === filter.equals,
        )
      : layer.data.features,
  };
}
export function parseDocument(v: unknown): StudioDocument {
  exact(v, [
    "schemaVersion",
    "id",
    "revision",
    "title",
    "basemap",
    "layers",
    "focus",
    "updatedAt",
  ]);
  check(
    v.schemaVersion === 1 &&
      shortText(v.id, 80) &&
      shortText(v.revision, 80) &&
      shortText(v.title, 200) &&
      ["none", "osm"].includes(String(v.basemap)),
    "Dokumen peta tidak sah.",
  );
  check(
    Array.isArray(v.layers) &&
      v.layers.length <= STUDIO_LIMITS.layers &&
      new Set(v.layers.map((l) => (record(l) ? l.id : ""))).size ===
        v.layers.length,
    "Layer ganda/terlalu banyak.",
  );
  let total = 0;
  const layers = v.layers.map((l) => {
    exact(l, [
      "id",
      "name",
      "visible",
      "color",
      "opacity",
      "filter",
      "data",
      "source",
    ]);
    check(
      shortText(l.id, 80) &&
        shortText(l.name) &&
        typeof l.visible === "boolean" &&
        /^#[0-9a-f]{6}$/i.test(String(l.color)) &&
        typeof l.opacity === "number" &&
        Number.isFinite(l.opacity) &&
        l.opacity >= 0 &&
        l.opacity <= 1,
      "Tampilan layer tidak sah.",
    );
    const data = normalizeGeoJSON(l.data);
    total += data.features.length;
    check(total <= STUDIO_LIMITS.features, "Total fitur peta melebihi 10.000.");
    const source = l.source;
    exact(source, [
      "kind",
      "format",
      "files",
      "importedAt",
      "originalCRS",
      "outputCRS",
      "processing",
      "citation",
      "license",
    ]);
    check(
      ["user-vector", "synthetic"].includes(String(source.kind)) &&
        ["geojson", "shapefile"].includes(String(source.format)) &&
        source.outputCRS === "OGC:CRS84" &&
        ["user-declared-ArcGIS", "not-specified"].includes(
          String(source.processing),
        ) &&
        shortText(source.originalCRS, 32768) &&
        shortText(source.citation, 1000) &&
        shortText(source.license, 1000) &&
        typeof source.importedAt === "string" &&
        Number.isFinite(Date.parse(source.importedAt)),
      "Metadata asal tidak lengkap.",
    );
    check(
      Array.isArray(source.files) &&
        source.files.length > 0 &&
        source.files.length <= 5,
      "Manifest berkas tidak sah.",
    );
    source.files.forEach((f) => {
      exact(f, ["name", "bytes", "sha256"]);
      check(
        shortText(f.name, 160) &&
          Number.isSafeInteger(f.bytes) &&
          Number(f.bytes) > 0 &&
          Number(f.bytes) <= STUDIO_LIMITS.bytes &&
          /^[0-9a-f]{64}$/.test(String(f.sha256)),
        "Hash/ukuran sumber tidak sah.",
      );
    });
    if (l.filter !== null) {
      exact(l.filter, ["field", "equals"]);
      check(
        typeof l.filter.field === "string" &&
          fields({ data } as StudioLayer).includes(l.filter.field) &&
          (l.filter.equals === null ||
            ["string", "boolean"].includes(typeof l.filter.equals) ||
            (typeof l.filter.equals === "number" &&
              Number.isFinite(l.filter.equals))),
        "Filter tidak sah.",
      );
    }
    return { ...l, data } as unknown as StudioLayer;
  });
  check(
    v.focus === null || layers.some((l) => l.id === v.focus),
    "Layer fokus tidak ditemukan.",
  );
  check(
    typeof v.updatedAt === "string" && Number.isFinite(Date.parse(v.updatedAt)),
    "Waktu dokumen tidak sah.",
  );
  return { ...v, layers } as unknown as StudioDocument;
}
export function exportVector(
  doc: StudioDocument,
): VectorCollection & { p4i: unknown } {
  return {
    type: "FeatureCollection",
    features: doc.layers
      .filter((l) => l.visible)
      .flatMap((l) => visibleFeatures(l).features),
    p4i: {
      schemaVersion: 1,
      documentId: doc.id,
      revision: doc.revision,
      title: doc.title,
      exportedAt: new Date().toISOString(),
      basemap: BASEMAPS[doc.basemap],
      processing:
        "Komposisi/filter visual. Tidak melakukan overlay atau penilaian ulang ArcGIS.",
      layers: doc.layers
        .filter((l) => l.visible)
        .map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          opacity: l.opacity,
          filter: l.filter,
          exportedFeatures: visibleFeatures(l).features.length,
          source: l.source,
        })),
    },
  };
}
