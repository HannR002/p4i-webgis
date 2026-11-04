import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  saveStudioDocument,
  listStudioDocuments,
  loadStudioDocument,
} from "../lib/gis/studio/storage";
import { applyStudioPlan, localRulePlan } from "../lib/gis/studio/plans";
import { documentFixture } from "./vectorStudioFixtures";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
describe("IndexedDB adapter with standards-oriented fake-indexeddb, not browser E2E", () => {
  it("persists and restores exact source geometry and metadata", async () => {
    const d = documentFixture();
    await saveStudioDocument(d);
    const rows = await listStudioDocuments();
    expect(rows).toHaveLength(1);
    expect(await loadStudioDocument(rows[0].key)).toEqual(d);
  });
  it("keeps old snapshots after a new style revision and does not duplicate repeated save", async () => {
    const d = documentFixture();
    await saveStudioDocument(d);
    await saveStudioDocument(d);
    const next = applyStudioPlan(
      d,
      localRulePlan("warna: #112233", d, d.layers[0]),
    );
    await saveStudioDocument(next);
    expect(await listStudioDocuments()).toHaveLength(2);
    const old = await loadStudioDocument(`${d.id}:${d.revision}`);
    expect(old.layers[0].color).toBe("#168178");
    expect(old.layers[0].data).toEqual(next.layers[0].data);
  });
  it("rejects a missing snapshot rather than creating an empty fake success", async () => {
    await expect(loadStudioDocument("does-not-exist")).rejects.toThrow(
      /tidak ditemukan/,
    );
  });
  it("serializes concurrent saves and keeps each document scope distinct", async () => {
    const d = documentFixture(),
      e = { ...documentFixture(), title: "Other fixture" };
    await Promise.all([saveStudioDocument(d), saveStudioDocument(e)]);
    expect(await listStudioDocuments()).toHaveLength(2);
    expect((await loadStudioDocument(`${e.id}:${e.revision}`)).title).toBe(
      "Other fixture",
    );
  });
});
