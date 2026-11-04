import { describe, it, expect } from "vitest";
import { parseVectorParts, validateZip } from "../lib/gis/studio/import";
import {
  collection,
  crc32,
  pointShapefile,
  wgs,
  zipFixture,
} from "./vectorStudioFixtures";
describe("actual GeoJSON / shapefile parser, no external fetch", () => {
  it("imports GeoJSON bytes and preserves coordinate/attribute values", async () => {
    const result = await parseVectorParts([
      {
        name: "hasil.geojson",
        bytes: new TextEncoder().encode(JSON.stringify(collection)).buffer,
      },
    ]);
    expect(result.data).toEqual(collection);
    expect(result.format).toBe("geojson");
  });
  it("parses a real independently constructed SHP/SHX/DBF/PRJ package", async () => {
    const r = await parseVectorParts(pointShapefile());
    expect(r.data.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [103.6, -1.6],
    });
    expect(r.data.features[0].properties?.nama).toBe("fixture-A");
    expect(r.originalCRS).toBe(wgs);
  });
  it.each([0, 8])(
    "imports ZIP method %s, validates headers and actual decompressed sizes/CRC",
    async (method) => {
      expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
      const zip = zipFixture(pointShapefile(), method);
      expect(validateZip(zip)).toHaveLength(4);
      const r = await parseVectorParts([{ name: "hasil.zip", bytes: zip }]);
      expect(r.data.features[0].properties?.nama).toBe("fixture-A");
      expect(r.originalCRS).toBe(wgs);
    },
  );
  it("reprojects known UTM central-meridian reference without inventing longitude", async () => {
    const prj =
      'PROJCS["WGS 84 / UTM zone 48N",' +
      wgs +
      ',PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",105],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1]]';
    const r = await parseVectorParts(pointShapefile(500000, 0, prj));
    const g = r.data.features[0].geometry;
    expect(g?.type).toBe("Point");
    if (g?.type === "Point") {
      expect(g.coordinates[0]).toBeCloseTo(105, 8);
      expect(g.coordinates[1]).toBeCloseTo(0, 8);
    }
  });
  it("requires CRS and matching attribute/geometry counts", async () => {
    await expect(
      parseVectorParts(
        pointShapefile().filter((p) => !p.name.endsWith(".prj")),
      ),
    ).rejects.toThrow(/lengkap/);
    const parts = pointShapefile();
    new DataView(parts[2].bytes).setUint32(4, 2, true);
    await expect(parseVectorParts(parts)).rejects.toThrow(/cocok/);
  });
  it("rejects missing ZIP CRS, multiple layers, traversal and duplicate names before decompression", () => {
    const parts = pointShapefile();
    for (const p of [
      [
        ...parts.slice(0, 3),
        { name: "other.cpg", bytes: new TextEncoder().encode("UTF-8").buffer },
      ],
      [...parts, { ...parts[0], name: "other.shp" }],
      parts.map((x) => ({ ...x, name: "../" + x.name })),
      [...parts, parts[0]],
    ])
      expect(() => validateZip(zipFixture(p))).toThrow();
  });
  it("rejects a decompressed-size lie and corrupt CRC instead of accepting a fake safe ZIP declaration", async () => {
    const zip = zipFixture(pointShapefile(), 8),
      view = new DataView(zip);
    const end = zip.byteLength - 22,
      start = view.getUint32(end + 16, true);
    view.setUint32(start + 24, 1, true);
    await expect(
      parseVectorParts([{ name: "bad.zip", bytes: zip }]),
    ).rejects.toThrow(/batas|cocok/);
    const bad = zipFixture(pointShapefile()),
      v = new DataView(bad);
    v.setUint8(30 + "sample.shp".length + 120, 199);
    await expect(
      parseVectorParts([{ name: "bad.zip", bytes: bad }]),
    ).rejects.toThrow(/CRC/);
  });
  it("rejects oversized files, bare .shp, invalid JSON and unsupported CRS", async () => {
    await expect(
      parseVectorParts([
        { name: "huge.geojson", bytes: new ArrayBuffer(10 * 1024 * 1024 + 1) },
      ]),
    ).rejects.toThrow(/10 MiB/);
    await expect(
      parseVectorParts(pointShapefile().slice(0, 1)),
    ).rejects.toThrow();
    await expect(
      parseVectorParts([
        { name: "broken.geojson", bytes: new TextEncoder().encode("{").buffer },
      ]),
    ).rejects.toThrow();
  });
});
it("rejects invalid .prj even when numbers happen to fit longitude/latitude", async () => {
  await expect(
    parseVectorParts(pointShapefile(10, 10, "THIS_IS_NOT_A_CRS")),
  ).rejects.toThrow(/tidak dikenali/);
});
it("rejects SHX offsets and declared multi-point allocation bombs before vendor parsing", async () => {
  const bad = pointShapefile();
  new DataView(bad[1].bytes).setInt32(100, 1000000);
  await expect(parseVectorParts(bad)).rejects.toThrow(/Offset/);
  const p = pointShapefile();
  const s = new ArrayBuffer(148);
  new Uint8Array(s).set(new Uint8Array(p[0].bytes));
  const v = new DataView(s);
  v.setInt32(24, 74);
  v.setInt32(32, 8, true);
  v.setInt32(104, 20);
  v.setInt32(108, 8, true);
  v.setInt32(144, 1000000000, true);
  p[0].bytes = s;
  const i = new DataView(p[1].bytes);
  i.setInt32(32, 8, true);
  i.setInt32(104, 20);
  await expect(parseVectorParts(p)).rejects.toThrow(/vertex/);
});
