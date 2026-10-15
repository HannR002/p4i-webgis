import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || "playwright-core"
);
const dir = path.resolve(process.env.P4I_QA_ARTIFACTS || "/tmp/p4i-phase-05");
await mkdir(dir, { recursive: true });
const base = process.env.P4I_QA_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.P4I_CHROMIUM || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [],
  audits = [],
  flows = [];
let geeCalls = 0,
  analysisCalls = 0;
function attach(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /hydration|didn't match|server rendered/i.test(m.text())
    )
      errors.push(m.text());
  });
  page.on("request", (r) => {
    if (r.url().includes("/api/gee/")) geeCalls++;
    if (r.url().includes("/api/gis/process")) analysisCalls++;
  });
}
async function ask(page, prompt) {
  const request = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/gis/copilot") && r.request().method() === "POST",
  );
  await page.getByLabel("Instruksi GIS", { exact: true }).fill(prompt);
  await page
    .getByRole("button", { name: "Kirim instruksi", exact: true })
    .click();
  const response = await request;
  const body = await response.json();
  await page
    .getByRole("button", { name: "Kirim instruksi", exact: true })
    .waitFor();
  if (response.status() !== 200) throw Error(JSON.stringify(body));
  return body;
}
async function capture(page, name, anchor = ".gis-copilot-status") {
  const target = name.startsWith("approval")
    ? page.getByRole("button", {
        name: "Setujui simpan konfigurasi lokal",
        exact: true,
      })
    : page.locator(anchor).first();
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: path.join(dir, name), fullPage: true });
}
async function exportRecipe(page, name) {
  await page.getByRole("tab", { name: "Layer", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Ekspor resep JSON", exact: true })
      .click(),
  ]);
  const file = path.join(dir, name);
  await download.saveAs(file);
  await page.getByRole("tab", { name: "AI GIS", exact: true }).click();
  return JSON.parse(await readFile(file, "utf8"));
}
try {
  const direct = await browser.newPage();
  attach(direct);
  await direct.goto(`${base}/spatial/ai`);
  await direct
    .getByRole("button", { name: "Kirim instruksi", exact: true })
    .waitFor();
  assert.equal(
    await direct.getByLabel("Otomatis terapkan perubahan sesi").isChecked(),
    true,
  );
  await direct.close();
  const page = await browser.newPage({
    viewport: { width: 1480, height: 1000 },
    acceptDownloads: true,
  });
  attach(page);
  await page.goto(`${base}/spatial/viewer?webmap=climate`);
  await page.getByText("Layer aktif (2)", { exact: true }).waitFor();
  await page.getByLabel("Basemap", { exact: true }).selectOption("none");
  await page.getByRole("tab", { name: "AI GIS", exact: true }).click();
  let result = await ask(
    page,
    "Buatkan peta tutupan lahan area contoh Barat, tambahkan batas kecamatan, gunakan basemap OSM dan buatkan legenda",
  );
  assert.equal(result.status, "completed");
  assert.equal(result.changed, true);
  assert.equal(result.recipe.aoi.id, "demo-aoi-west");
  assert.equal(result.recipe.layers.length, 2);
  assert.equal(result.plan.provider.mode, "demo");
  await page
    .locator(
      ".leaflet-workspace-layer-demo-landcover-pane img.leaflet-tile-loaded",
    )
    .first()
    .waitFor();
  await page
    .getByText("-1.6000, 103.5700 · Zoom 13", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Terapkan ke sesi peta", exact: true })
      .count(),
    0,
  );
  await page.getByRole("tab", { name: "Layer", exact: true }).click();
  await page.getByText("Layer aktif (2)", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Pilih area kajian").inputValue(),
    "demo-aoi-west",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(
    await page.getByLabel("Basemap", { exact: true }).inputValue(),
    "none",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page
    .getByText("-1.6000, 103.5700 · Zoom 13", { exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "AI GIS", exact: true }).click();
  await capture(page, "auto-map-desktop.png");
  flows.push(
    "automatic authorized map generation, existing renderer, AOI, legend and atomic Undo/Redo",
  );
  result = await ask(page, "Ubah opacity tutupan lahan menjadi 25%");
  assert.equal(
    result.recipe.layers.find((l) => l.datasetId === "demo-landcover").opacity,
    0.25,
  );
  result = await ask(page, "Ubah warna tutupan lahan #008000 #ffff00 #ff0000");
  assert.equal(
    result.recipe.layers.find((l) => l.datasetId === "demo-landcover").style
      .palette.length,
    3,
  );
  result = await ask(page, "Pindahkan tutupan lahan ke urutan 1");
  assert.equal(result.recipe.layers[0].datasetId, "demo-landcover");
  result = await ask(page, "Cari hujan");
  assert.equal(result.changed, false);
  assert.equal(result.results[0].data.kind, "datasets");
  result = await ask(page, "Metadata tutupan lahan");
  assert.equal(result.changed, false);
  assert.equal(result.results[0].data.dataset.raster.crs, "EPSG:4326");
  result = await ask(page, "Inspeksi pixel tutupan lahan di pusat peta");
  assert.equal(result.changed, false);
  assert.equal(result.results[0].data.samples[0].demo, true);
  await capture(page, "pixel-desktop.png", ".gis-copilot-pixel");
  result = await ask(page, "Inspeksi pixel tutupan lahan titik 0, 0");
  assert.equal(result.results[0].data.samples[0].noData, true);
  const before = await exportRecipe(page, "before-unavailable.json");
  result = await ask(
    page,
    "Buat peta tutupan lahan Kota Jambi dengan batas kecamatan",
  );
  assert.equal(result.status, "needs-input");
  assert.equal(result.changed, false);
  assert.deepEqual(result.recipe, before);
  flows.push(
    "opacity/style/order, actual catalog metadata/provider pixels/NoData and no silent real-AOI substitution",
  );
  await page.getByLabel("Otomatis terapkan perubahan sesi").uncheck();
  result = await ask(page, "Tambahkan curah hujan");
  assert.equal(result.status, "preview");
  assert.equal(result.changed, false);
  const reviewedId = result.plan.id;
  await page.getByRole("tab", { name: "Layer", exact: true }).click();
  await page.getByRole("tab", { name: "AI GIS", exact: true }).click();
  const applied = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/gis/copilot") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Terapkan ke sesi peta", exact: true })
    .click();
  const appliedResult = await (await applied).json();
  assert.equal(appliedResult.plan.id, reviewedId);
  assert.equal(appliedResult.recipe.layers.length, 3);
  await page
    .getByRole("button", { name: "Kirim instruksi", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByLabel("Otomatis terapkan perubahan sesi").check();
  flows.push(
    "optional preview, exact reviewed-plan execution and tab persistence",
  );
  result = await ask(page, 'Buat draft konfigurasi wlc "Skenario Copilot"');
  let draft = result.results[0].data.configuration;
  assert.equal(draft.experimental, true);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("p4i-analysis-configurations-v1"),
    ),
    null,
  );
  result = await ask(
    page,
    'Ubah bobot konfigurasi "Skenario Copilot" menjadi bencana 20%, kesuburan 30%, kepadatan 50%',
  );
  const fork = result.results[0].data.configuration;
  assert.notEqual(fork.id, draft.id);
  assert.deepEqual(fork.weights, {
    bencana: 0.2,
    kesuburan: 0.3,
    kepadatan: 0.5,
  });
  await page
    .getByRole("button", { name: "Batalkan draft AI", exact: true })
    .click();
  result = await ask(
    page,
    'Ubah bobot konfigurasi "Skenario Copilot" menjadi bencana 20%, kesuburan 30%, kepadatan 50%',
  );
  draft = result.results[0].data.configuration;
  result = await ask(page, `Siapkan konfigurasi "${draft.id}"`);
  assert.equal(result.results[0].data.kind, "preparation");
  assert.equal(result.changed, false);
  assert.equal(analysisCalls, 0);
  result = await ask(page, `Terapkan konfigurasi "${draft.id}"`);
  assert.equal(result.recipe.analysis.weightMethod, "manual-wlc");
  assert.deepEqual(result.recipe.analysis.weights, {
    bencana: 0.2,
    kesuburan: 0.3,
    kepadatan: 0.5,
  });
  result = await ask(page, `Simpan konfigurasi "${draft.id}"`);
  assert.equal(result.status, "approval-required");
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("p4i-analysis-configurations-v1"),
    ),
    null,
  );
  await capture(page, "approval-desktop.png", ".gis-copilot-approval");
  await page
    .getByRole("button", { name: "Batalkan persetujuan", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("p4i-analysis-configurations-v1"),
    ),
    null,
  );
  await ask(page, `Simpan konfigurasi "${draft.id}"`);
  await page
    .getByRole("button", {
      name: "Setujui simpan konfigurasi lokal",
      exact: true,
    })
    .click();
  await page
    .getByText(`Disetujui dan disimpan lokal: ${draft.name} · v1.`, {
      exact: true,
    })
    .waitFor();
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("p4i-analysis-configurations-v1"))
        .configurations,
  );
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, draft.id);
  assert.equal(saved[0].version, 1);
  result = await ask(page, "Daftar konfigurasi analisis");
  assert.ok(
    result.results[0].data.configurations.some((c) => c.id === draft.id),
  );
  flows.push(
    "Phase 04 config create/select/fork/undo/prepare/apply and explicit local save approval, no automatic persistence",
  );
  result = await ask(
    page,
    'Buat draft konfigurasi zonal-statistics "Zonal Copilot"',
  );
  const zonal = result.results[0].data.configuration;
  result = await ask(page, `Siapkan konfigurasi "${zonal.id}"`);
  assert.equal(result.results[0].data.request.operation, "zonal-statistics");
  assert.equal(analysisCalls, 0);
  await page
    .getByRole("button", {
      name: "Buka konfigurasi untuk eksekusi eksplisit",
      exact: true,
    })
    .click();
  assert.equal(
    await page.getByLabel("Nama konfigurasi", { exact: true }).inputValue(),
    "Zonal Copilot",
  );
  await page
    .locator(".gis-analysis-configuration")
    .getByRole("button", { name: "Jalankan konfigurasi lokal", exact: true })
    .click();
  await page.getByText("Sel valid 799 · NoData 1", { exact: true }).waitFor();
  assert.equal(analysisCalls, 1);
  await page.getByRole("tab", { name: "AI GIS", exact: true }).click();
  flows.push(
    "analysis preparation does not compute; explicit existing Analysis panel executes native DEMO statistics",
  );
  result = await ask(page, "Publikasikan peta");
  assert.equal(result.approval.supported, false);
  assert.equal(
    await page
      .getByRole("button", {
        name: "Setujui simpan konfigurasi lokal",
        exact: true,
      })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Batalkan persetujuan", exact: true })
    .click();
  const original = await exportRecipe(page, "before-cancel.json");
  let enteredResolve, release;
  const entered = new Promise((r) => {
      enteredResolve = r;
    }),
    hold = new Promise((r) => {
      release = r;
    });
  await page.route("**/api/gis/copilot", async (route) => {
    const response = await route.fetch();
    enteredResolve();
    await hold;
    await route.fulfill({ response }).catch(() => {});
  });
  await page
    .getByLabel("Instruksi GIS", { exact: true })
    .fill('Ubah judul peta "TERLAMBAT"');
  await page
    .getByRole("button", { name: "Kirim instruksi", exact: true })
    .click();
  await entered;
  await page
    .getByRole("button", { name: "Batalkan permintaan AI", exact: true })
    .click();
  release();
  await page.unroute("**/api/gis/copilot");
  assert.deepEqual(await exportRecipe(page, "after-cancel.json"), original);
  let enteredAgain, releaseAgain;
  const arrived = new Promise((r) => {
      enteredAgain = r;
    }),
    held = new Promise((r) => {
      releaseAgain = r;
    });
  await page.route("**/api/gis/copilot", async (route) => {
    const response = await route.fetch();
    enteredAgain();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  await page
    .getByLabel("Instruksi GIS", { exact: true })
    .fill('Ubah judul peta "STALE"');
  await page
    .getByRole("button", { name: "Kirim instruksi", exact: true })
    .click();
  await arrived;
  await page.getByRole("tab", { name: "Layer", exact: true }).click();
  await page.getByLabel("Judul peta").fill("Edit manusia");
  await page.getByLabel("Deskripsi peta").focus();
  await page.getByRole("tab", { name: "AI GIS", exact: true }).click();
  releaseAgain();
  await page.unroute("**/api/gis/copilot");
  await page
    .getByRole("alert")
    .filter({ hasText: "Peta atau izin berubah" })
    .waitFor();
  const unchanged = await exportRecipe(page, "after-stale.json");
  assert.equal(unchanged.title, "Edit manusia");
  flows.push(
    "request abort and stale-response rejection keep human map changes",
  );
  const deniedResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/gis/copilot"),
  );
  await page
    .getByLabel("Instruksi GIS", { exact: true })
    .fill("jalankan SQL select *");
  await page
    .getByRole("button", { name: "Kirim instruksi", exact: true })
    .click();
  assert.equal((await deniedResponse).status(), 403);
  await page.getByRole("alert").filter({ hasText: "Instruksi kode" }).waitFor();
  const finalRecipe = await exportRecipe(page, "ai-recipe.json");
  assert.equal(finalRecipe.provenance, "ai");
  assert.equal(geeCalls, 0);
  const axe = await readFile(process.env.P4I_AXE_SCRIPT, "utf8");
  for (const width of [1480, 390]) {
    const qa = await browser.newPage({ viewport: { width, height: 1000 } });
    attach(qa);
    await qa.goto(`${base}/spatial/viewer?webmap=climate`);
    await qa.getByText("Layer aktif (2)", { exact: true }).waitFor();
    await qa.getByRole("tab", { name: "AI GIS", exact: true }).click();
    for (const state of ["automatic-map", "pixel", "approval", "unavailable"]) {
      if (state === "automatic-map")
        await ask(
          qa,
          "Buat peta tutupan lahan area contoh Barat dan batas kecamatan",
        );
      if (state === "pixel") await ask(qa, "Inspeksi pixel di pusat peta");
      if (state === "approval") {
        const created = await ask(qa, 'Buat draft konfigurasi wlc "Audit"');
        await ask(
          qa,
          `Simpan konfigurasi "${created.results[0].data.configuration.id}"`,
        );
      }
      if (state === "unavailable") await ask(qa, "Jalankan analisis banjir");
      await qa.addScriptTag({ content: axe });
      const violations = await qa.evaluate(async () => {
        const r = await window.axe.run(document.querySelector(".gis-shell"), {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        });
        return r.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        }));
      });
      audits.push({ width, state, violations });
      assert.deepEqual(violations, []);
      assert.equal(
        await qa.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (width === 390 && ["pixel", "approval"].includes(state))
        await capture(qa, `${state}-390.png`);
    }
    await qa.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(geeCalls, 0);
  await writeFile(
    path.join(dir, "browser-summary.json"),
    JSON.stringify(
      { pageErrors: errors, geeCalls, analysisCalls, flows, audits },
      null,
      2,
    ),
  );
  for (const flow of flows) console.log(`PASS ${flow}`);
  console.log(
    "PASS direct AI route hydration, eight desktop/mobile Axe audits and zero GEE calls",
  );
} finally {
  await browser.close();
}
