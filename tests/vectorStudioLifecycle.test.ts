import { it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { parseVectorParts } from "../lib/gis/studio/import";
import {
  freshDocument,
  parseDocument,
  exportVector,
} from "../lib/gis/studio/model";
import {
  localRulePlan,
  applyStudioPlan,
  importDocumentText,
} from "../lib/gis/studio/plans";
import {
  saveStudioDocument,
  loadStudioDocument,
} from "../lib/gis/studio/storage";
import { pointShapefile, zipFixture } from "./vectorStudioFixtures";
afterEach(() => vi.unstubAllGlobals());
it("runs synthetic SHP ZIP → WGS84 vector → map composition → review/apply → saved v1/v2 → provenance export → portable restore", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const bytes = zipFixture(pointShapefile(), 8);
  const parsed = await parseVectorParts([{ name: "SYNTHETIC.zip", bytes }]);
  let d = freshDocument();
  d = parseDocument({
    ...d,
    layers: [
      {
        id: "input-vector",
        name: "Synthetic shapefile",
        visible: true,
        color: "#168178",
        opacity: 0.8,
        filter: null,
        data: parsed.data,
        source: {
          kind: "synthetic",
          format: parsed.format,
          files: [
            {
              name: "SYNTHETIC.zip",
              bytes: bytes.byteLength,
              sha256: createHash("sha256")
                .update(new Uint8Array(bytes))
                .digest("hex"),
            },
          ],
          importedAt: new Date().toISOString(),
          originalCRS: parsed.originalCRS,
          outputCRS: "OGC:CRS84",
          processing: "not-specified",
          citation: "Independent synthetic parser fixture",
          license: "Test only",
        },
      },
    ],
  });
  await saveStudioDocument(d);
  const proposal = localRulePlan("warna: #223344", d, d.layers[0]);
  expect(d.layers[0].color).toBe("#168178");
  const next = applyStudioPlan(d, proposal);
  await saveStudioDocument(next);
  const old = await loadStudioDocument(`${d.id}:${d.revision}`);
  expect(old).toEqual(d);
  expect(next.layers[0].data).toEqual(old.layers[0].data);
  const exported = exportVector(next);
  expect(exported.features[0].properties?.nama).toBe("fixture-A");
  expect(JSON.stringify(exported.p4i)).toContain("SYNTHETIC.zip");
  expect(importDocumentText(JSON.stringify(next))).toEqual(next);
});
