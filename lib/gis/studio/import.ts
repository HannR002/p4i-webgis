import { parseShp, parseDbf, combine } from "shpjs";
import proj4 from "proj4";
import { inspectShapefile } from "./shapefileBounds";
import { check, normalizeGeoJSON, STUDIO_LIMITS } from "./model";
import type { VectorCollection } from "./model";
export type ImportPart = { name: string; bytes: ArrayBuffer };
function zipCRC(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const decode = (b: ArrayBuffer) =>
  new TextDecoder("utf-8", { fatal: true }).decode(b);
/** Read central-directory declarations before any decompression. No ZIP64/encryption/paths/nested archives. */
export type ZipEntry = {
  name: string;
  method: number;
  size: number;
  compressed: number;
  offset: number;
  crc: number;
};
export function validateZip(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  check(
    buffer.byteLength >= 22 && buffer.byteLength <= STUDIO_LIMITS.bytes,
    "Ukuran ZIP tidak sah.",
  );
  let end = -1;
  for (
    let i = buffer.byteLength - 22;
    i >= Math.max(0, buffer.byteLength - 65557);
    i--
  )
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === buffer.byteLength
    ) {
      end = i;
      break;
    }
  check(
    end >= 0 &&
      view.getUint16(end + 4, true) === 0 &&
      view.getUint16(end + 6, true) === 0,
    "ZIP multipart/format tidak didukung.",
  );
  const count = view.getUint16(end + 10, true),
    length = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  check(
    count >= 4 &&
      count <= 12 &&
      count === view.getUint16(end + 8, true) &&
      start + length === end,
    "Direktori ZIP tidak sah/terlalu besar.",
  );
  const names = new Set<string>();
  const entries: ZipEntry[] = [];
  let offset = start,
    expanded = 0;
  for (let i = 0; i < count; i++) {
    check(
      offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50,
      "Entri ZIP tidak sah.",
    );
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      compressed = view.getUint32(offset + 20, true),
      size = view.getUint32(offset + 24, true),
      nl = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    check(
      !(flags & 1) &&
        [0, 8].includes(method) &&
        size > 0 &&
        compressed > 0 &&
        size <= STUDIO_LIMITS.expanded &&
        size / compressed <= 100 &&
        local + 30 < start &&
        offset + 46 + nl + extra + comment <= end,
      "ZIP terenkripsi/bomb/ZIP64 tidak didukung.",
    );
    const rawName = new Uint8Array(buffer, offset + 46, nl);
    check(
      rawName.every((c) => c >= 32 && c < 127),
      "Gunakan nama berkas ZIP ASCII.",
    );
    const name = new TextDecoder().decode(rawName).toLowerCase();
    check(
      /^[a-z0-9 _.-]+\.(shp|shx|dbf|prj|cpg|xml|sbn|sbx|qix)$/.test(name) &&
        !name.includes("..") &&
        !names.has(name),
      "ZIP hanya satu Shapefile pada root; tanpa jalur/duplikat.",
    );
    names.add(name);
    check(
      view.getUint32(local, true) === 0x04034b50 &&
        view.getUint16(local + 8, true) === method &&
        view.getUint16(local + 6, true) === flags,
      "Header ZIP berbeda.",
    );
    const localNameLength = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    check(
      localNameLength === nl &&
        local + 30 + localNameLength + localExtra + compressed <= start,
      "Offset ZIP di luar batas.",
    );
    check(
      rawName.every((b, j) => b === view.getUint8(local + 30 + j)),
      "Nama header ZIP berbeda.",
    );
    entries.push({
      name,
      method,
      size,
      compressed,
      offset: local + 30 + localNameLength + localExtra,
      crc: view.getUint32(offset + 16, true),
    });
    expanded += size;
    check(
      expanded <= STUDIO_LIMITS.expanded,
      "ZIP melebihi 25 MiB setelah ekstraksi.",
    );
    offset += 46 + nl + extra + comment;
  }
  check(offset === end, "Direktori ZIP tidak konsisten.");
  const shapes = [...names].filter((n) => n.endsWith(".shp"));
  check(shapes.length === 1, "ZIP harus memuat tepat satu Shapefile.");
  const base = shapes[0].slice(0, -4);
  check(
    [".shx", ".dbf", ".prj"].every((ext) => names.has(base + ext)),
    "ZIP harus berisi .shp, .shx, .dbf dan .prj dengan nama sama.",
  );
  return entries;
}
export async function parseVectorParts(parts: ImportPart[]): Promise<{
  data: VectorCollection;
  originalCRS: string;
  format: "geojson" | "shapefile";
}> {
  check(
    parts.length >= 1 &&
      parts.length <= 5 &&
      parts.every(
        (p) =>
          p.bytes.byteLength > 0 &&
          p.name.length <= 160 &&
          !/[\\/]/.test(p.name),
      ) &&
      parts.reduce((n, p) => n + p.bytes.byteLength, 0) <= STUDIO_LIMITS.bytes,
    "Maksimum 10 MiB / satu paket berkas.",
  );
  if (parts.length === 1 && /\.(geojson|json)$/i.test(parts[0].name))
    return {
      data: normalizeGeoJSON(JSON.parse(decode(parts[0].bytes))),
      originalCRS: "GeoJSON RFC7946 / WGS84 (diharapkan dari eksportir)",
      format: "geojson",
    };
  let raw: unknown, originalCRS: string;
  if (parts.length === 1 && /\.zip$/i.test(parts[0].name)) {
    const entries = validateZip(parts[0].bytes);
    const extracted: ImportPart[] = [];
    for (const e of entries) {
      const stored = parts[0].bytes.slice(e.offset, e.offset + e.compressed);
      let data: ArrayBuffer;
      if (e.method === 0) {
        check(stored.byteLength === e.size, "Panjang entri ZIP tidak cocok.");
        data = stored;
      } else {
        const reader = new Blob([stored])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"))
          .getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const c = await reader.read();
            if (c.done) break;
            size += c.value.length;
            check(
              size <= e.size && size <= STUDIO_LIMITS.expanded,
              "Ekstraksi ZIP melebihi batas yang dideklarasikan.",
            );
            chunks.push(c.value);
          }
        } finally {
          await reader.cancel();
        }
        check(size === e.size, "Panjang ekstraksi ZIP tidak cocok.");
        const bytes = new Uint8Array(size);
        let n = 0;
        for (const c of chunks) {
          bytes.set(c, n);
          n += c.length;
        }
        data = bytes.buffer;
      }
      check(
        zipCRC(new Uint8Array(data)) === e.crc,
        "CRC berkas ZIP tidak cocok.",
      );
      if (/\.(shp|shx|dbf|prj|cpg)$/.test(e.name))
        extracted.push({ name: e.name, bytes: data });
    }
    return parseVectorParts(extracted);
  } else {
    const input = new Map(parts.map((p) => [p.name.toLowerCase(), p.bytes]));
    check(input.size === parts.length, "Berkas ganda.");
    const names = [...input.keys()].filter((n) => n.endsWith(".shp"));
    check(
      names.length === 1,
      "Pilih .shp bersama .shx, .dbf, .prj (dan .cpg jika ada).",
    );
    const base = names[0].slice(0, -4);
    check(
      [".shp", ".shx", ".dbf", ".prj"].every((e) => input.has(base + e)) &&
        [...input.keys()].every((n) =>
          [".shp", ".shx", ".dbf", ".prj", ".cpg"].some((e) => n === base + e),
        ),
      "Komponen Shapefile harus bernama sama dan lengkap.",
    );
    const shape = input.get(base + ".shp")!,
      index = input.get(base + ".shx")!,
      dbf = input.get(base + ".dbf")!,
      prj = input.get(base + ".prj")!;
    check(
      shape.byteLength >= 100 &&
        index.byteLength >= 100 &&
        (index.byteLength - 100) % 8 === 0 &&
        (index.byteLength - 100) / 8 <= STUDIO_LIMITS.features &&
        dbf.byteLength >= 33 &&
        prj.byteLength <= 32768,
      "Header/ukuran Shapefile tidak sah.",
    );
    check(
      new DataView(shape).getInt32(0) === 9994 &&
        new DataView(index).getInt32(0) === 9994 &&
        new DataView(shape).getInt32(24) * 2 === shape.byteLength &&
        new DataView(index).getInt32(24) * 2 === index.byteLength &&
        new DataView(dbf).getUint32(4, true) === (index.byteLength - 100) / 8,
      "Jumlah/ukuran komponen Shapefile tidak cocok.",
    );
    inspectShapefile(shape, index, dbf);
    originalCRS = decode(prj);
    check(originalCRS.trim().length > 0, ".prj kosong.");
    // shpjs silently falls back for malformed projections: reject before calling it.
    try {
      proj4(originalCRS);
    } catch {
      throw Error(
        "Proyeksi .prj tidak dikenali. Ekspor ulang dari ArcGIS ke WGS84.",
      );
    }
    const geometry = parseShp(shape, originalCRS);
    const rows = parseDbf(
      dbf,
      input.get(base + ".cpg") ?? new TextEncoder().encode("UTF-8").buffer,
    );
    check(
      geometry.length === rows.length &&
        geometry.length === (index.byteLength - 100) / 8,
      "Geometri dan atribut Shapefile tidak sama jumlahnya.",
    );
    raw = combine([geometry, rows]);
  }
  check(!Array.isArray(raw), "Satu layer per impor.");
  return { data: normalizeGeoJSON(raw), originalCRS, format: "shapefile" };
}
