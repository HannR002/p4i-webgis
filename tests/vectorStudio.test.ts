import { describe, it, expect } from "vitest";
import {
  BASEMAPS,
  exportVector,
  normalizeGeoJSON,
  parseDocument,
  visibleFeatures,
} from "../lib/gis/studio/model";
import {
  applyStudioPlan,
  importDocumentText,
  localRulePlan,
  studioContext,
  validateActions,
} from "../lib/gis/studio/plans";
import { collection, documentFixture } from "./vectorStudioFixtures";
describe("vector-only composition, provenance and restoration", () => {
  it("preserves source coordinates including Z, null geometry and all attribute values", () => {
    const f = normalizeGeoJSON(collection);
    expect(f).toEqual(collection);
    expect(f).not.toBe(collection);
  });
  it.each([
    "MultiPoint",
    "Polygon",
    "MultiPolygon",
    "MultiLineString",
    "GeometryCollection",
  ])("accepts valid %s vector geometry", (type) => {
    const ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const coords =
      type === "MultiPoint"
        ? [
            [0, 0],
            [1, 1],
          ]
        : type === "Polygon"
          ? [ring]
          : type === "MultiPolygon"
            ? [[ring]]
            : [
                [
                  [0, 0],
                  [1, 1],
                ],
              ];
    const geometry =
      type === "GeometryCollection"
        ? { type, geometries: [{ type: "Point", coordinates: [0, 0] }] }
        : { type, coordinates: coords };
    expect(
      normalizeGeoJSON({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry }],
      }).features[0].geometry?.type,
    ).toBe(type);
  });
  it.each(
    [[NaN, 0], [Infinity, 0], [300, 0], [0, 91], [1]].map((coordinates) => ({
      coordinates,
    })),
  )("rejects invalid coordinate $coordinates", ({ coordinates: coords }) => {
    const v = structuredClone(collection);
    v.features[0].geometry!.coordinates = coords as never;
    expect(() => normalizeGeoJSON(v)).toThrow();
  });
  it("rejects projected GeoJSON and unclosed polygons instead of guessing geometry", () => {
    expect(() =>
      normalizeGeoJSON({
        ...collection,
        crs: { properties: { name: "EPSG:32748" } },
      }),
    ).toThrow(/WGS84/);
    expect(() =>
      normalizeGeoJSON({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                ],
              ],
            },
          },
        ],
      }),
    ).toThrow(/tertutup/);
  });
  it("rejects prototype pollution, oversized attributes and invented source metadata", () => {
    const c = structuredClone(collection);
    c.features[0].properties = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(() => normalizeGeoJSON(c)).toThrow();
    const doc = documentFixture();
    doc.layers[0].source.files[0].sha256 = "not-a-hash";
    expect(() => parseDocument(doc)).toThrow(/Hash/);
  });
  it("composes and filters without rewriting original geometry or inventing data", () => {
    const doc = documentFixture(),
      before = JSON.stringify(doc.layers[0].data);
    const p = localRulePlan("filter: nilai = 2", doc, doc.layers[0]);
    const next = applyStudioPlan(doc, p);
    expect(visibleFeatures(next.layers[0]).features).toHaveLength(1);
    expect(JSON.stringify(next.layers[0].data)).toBe(before);
    expect(doc.layers[0].filter).toBeNull();
  });
  it("exports exact visible source features and per-layer metadata, with no basemap image pixels", () => {
    const d = documentFixture();
    d.basemap = "osm";
    const x = exportVector(d);
    expect(x.features).toEqual(collection.features);
    expect(JSON.stringify(x.p4i)).toContain(
      "SHA-256".toLowerCase().replace("-", ""),
    );
    expect(BASEMAPS.osm.kind).toBe("raster-display-only");
    expect(JSON.stringify(x.p4i)).toContain("OpenStreetMap");
  });
  it("restores a full portable map and source snapshot without substituting newer data", () => {
    const old = documentFixture(),
      saved = JSON.stringify(old);
    const next = applyStudioPlan(
      old,
      localRulePlan("warna: #123456", old, old.layers[0]),
    );
    expect(next.revision).not.toBe(old.revision);
    expect(importDocumentText(saved)).toEqual(old);
    expect(old.layers[0].color).toBe("#168178");
  });
  it("rejects stale plans and extra arbitrary tool/code/url/geometry instructions", () => {
    const doc = documentFixture(),
      ctx = studioContext(doc);
    const plan = localRulePlan("judul: Hasil baru", doc, doc.layers[0]);
    expect(() => applyStudioPlan({ ...doc, revision: "other" }, plan)).toThrow(
      /berubah/,
    );
    for (const a of [
      { type: "overlay", layerId: "layer-fixture" },
      { type: "set_style", layerId: "other", color: "#fff", opacity: 1 },
      {
        type: "fit_layer",
        layerId: "layer-fixture",
        url: "https://example.com",
      },
      { type: "set_title", title: "ok", code: "eval()" },
    ])
      expect(() => validateActions([a], ctx)).toThrow();
  });
  it("labels rules honestly and rejects unsupported geographic generation requests", () => {
    const d = documentFixture();
    expect(localRulePlan("judul: Peta saya", d, d.layers[0]).provider).toBe(
      "rules",
    );
    expect(() =>
      localRulePlan("Buat poligon banjir seluruh dunia", d, d.layers[0]),
    ).toThrow(/tidak memahami/);
  });
  it("preserves source manifest and labels in every save/export", () => {
    const d = documentFixture();
    expect(importDocumentText(JSON.stringify(d)).layers[0].source.kind).toBe(
      "synthetic",
    );
    expect(JSON.stringify(exportVector(d))).toContain(
      "Synthetic automated fixture",
    );
  });
});
