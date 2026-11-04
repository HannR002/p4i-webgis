// Synthetic fixtures only. No survey, participant, or P4I production data.
import { deflateRawSync } from "node:zlib";
import {
  freshDocument,
  parseDocument,
  type StudioDocument,
} from "../lib/gis/studio/model";
import type { ImportPart } from "../lib/gis/studio/import";
export const collection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "fixture-A",
      geometry: { type: "Point", coordinates: [103.6, -1.6, 5] },
      properties: { nama: "A", nilai: 1, aktif: true },
    },
    {
      type: "Feature",
      id: "fixture-B",
      geometry: {
        type: "LineString",
        coordinates: [
          [103.6, -1.6],
          [103.61, -1.61],
        ],
      },
      properties: { nama: "B", nilai: 2, aktif: false },
    },
    {
      type: "Feature",
      id: "fixture-empty",
      geometry: null,
      properties: { nama: "C", nilai: null, aktif: false },
    },
  ],
};
export function documentFixture(): StudioDocument {
  const doc = freshDocument();
  return parseDocument({
    ...doc,
    layers: [
      {
        id: "layer-fixture",
        name: "Layer sintetik",
        visible: true,
        color: "#168178",
        opacity: 0.8,
        filter: null,
        data: collection,
        source: {
          kind: "synthetic",
          format: "geojson",
          files: [
            { name: "SYNTHETIC.geojson", bytes: 100, sha256: "a".repeat(64) },
          ],
          importedAt: new Date().toISOString(),
          originalCRS: "WGS84",
          outputCRS: "OGC:CRS84",
          processing: "not-specified",
          citation: "Synthetic automated fixture",
          license: "Test only",
        },
      },
    ],
  });
}
export const wgs =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
export function pointShapefile(x = 103.6, y = -1.6, prj = wgs): ImportPart[] {
  const shp = new ArrayBuffer(128),
    v = new DataView(shp);
  v.setInt32(0, 9994);
  v.setInt32(24, 64);
  v.setInt32(28, 1000, true);
  v.setInt32(32, 1, true);
  v.setFloat64(36, x, true);
  v.setFloat64(44, y, true);
  v.setFloat64(52, x, true);
  v.setFloat64(60, y, true);
  v.setInt32(100, 1);
  v.setInt32(104, 10);
  v.setInt32(108, 1, true);
  v.setFloat64(112, x, true);
  v.setFloat64(120, y, true);
  const shx = new ArrayBuffer(108);
  new Uint8Array(shx).set(new Uint8Array(shp, 0, 100));
  const i = new DataView(shx);
  i.setInt32(24, 54);
  i.setInt32(100, 50);
  i.setInt32(104, 10);
  const dbf = new ArrayBuffer(83),
    d = new DataView(dbf),
    b = new Uint8Array(dbf);
  b[0] = 3;
  b[1] = 126;
  b[2] = 11;
  b[3] = 4;
  d.setUint32(4, 1, true);
  d.setUint16(8, 65, true);
  d.setUint16(10, 17, true);
  b.set(new TextEncoder().encode("nama"), 32);
  b[43] = 67;
  b[48] = 16;
  b[64] = 13;
  b.fill(32, 65, 82);
  b.set(new TextEncoder().encode("fixture-A"), 66);
  b[82] = 26;
  return [
    { name: "sample.shp", bytes: shp },
    { name: "sample.shx", bytes: shx },
    { name: "sample.dbf", bytes: dbf },
    { name: "sample.prj", bytes: new TextEncoder().encode(prj).buffer },
  ];
}
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function zipFixture(parts: ImportPart[], method = 0): ArrayBuffer {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name),
      data = Buffer.from(part.bytes),
      packed = method === 8 ? deflateRawSync(data) : data,
      crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(method, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(name.length, 26);
    local.push(h, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + packed.length;
  }
  const dir = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...local, dir, end]);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.length,
  ) as ArrayBuffer;
}
