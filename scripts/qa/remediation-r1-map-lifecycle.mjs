// Browser-only synthetic responses: no PostGIS fixture, credentials or external providers.
// Exercises real workspace/Copilot/reducer/Leaflet UI. This does not test database authorization.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const fixture = JSON.parse(await readFile(new URL('../../tests/fixtures/vector-analysis-lifecycle.json', import.meta.url), 'utf8'));
const { document: doc, result } = fixture;
const { chromium } = await import(process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.P4I_QA_BASE_URL || 'http://127.0.0.1:3000';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const dir = process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-remediation-r1';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.P4I_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
const flows = [], errors = [], audits = [];
let forbiddenCalls = 0, writes = 0;
const overlay = '.leaflet-vector-analysis-preview-pane canvas, .leaflet-vector-analysis-preview-pane path';
const panel = (page) => page.locator('.gis-vector-analysis:visible').first();
async function absent(page) {
  await page.waitForFunction((selector) => !document.querySelector(selector), overlay);
}
async function estimate(page) {
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  const p = panel(page);
  const project = p.getByLabel('Proyek analisis', { exact: true });
  if (await project.inputValue() !== doc.projectId) await project.selectOption(doc.projectId);
  const source = p.getByLabel('Layer sumber analisis', { exact: true });
  if (await source.inputValue() !== doc.id) await source.selectOption(doc.id);
  await p.getByRole('group', { name: /Fitur sumber/ }).waitFor();
  await p.getByRole('button', { name: 'Periksa estimasi PostGIS' }).click();
  await p.getByText(/Estimasi server:/).waitFor();
}
async function run(page) {
  await estimate(page);
  await panel(page).getByRole('button', { name: 'Jalankan analisis PostGIS' }).click();
  await panel(page).getByText(/Selesai:/).waitFor();
  await page.locator(overlay).first().waitFor({ state: 'attached' });
}
async function copilot(page, title, preview = false) {
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  const automatic = page.getByLabel('Otomatis terapkan perubahan sesi', { exact: true });
  await automatic.setChecked(!preview);
  await page.getByLabel('Instruksi GIS', { exact: true }).fill(`Buatkan peta baru bernama ${title} dan gunakan tanpa basemap.`);
  const response = page.waitForResponse((r) => r.url().endsWith('/api/gis/copilot') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Kirim instruksi', exact: true }).click();
  const r = await response; assert.equal(r.status(), 200);
  const value = await r.json();
  assert(value.plan.steps.some((s) => s.action.tool === 'createMap'));
  if (preview) {
    await page.getByRole('button', { name: 'Terapkan ke sesi peta' }).waitFor();
    assert(await page.locator(overlay).count() > 0, 'Preview must not discard the current result');
    await page.getByRole('button', { name: 'Terapkan ke sesi peta' }).click();
  }
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await absent(page);
}
const cases = [
  ['Copilot new map, Undo/Redo and a result created in the new context', async (page) => {
    await copilot(page, 'R1 fresh map');
    await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
    assert.equal(await panel(page).getByText(/Estimasi server:/).count(), 0);
    assert.equal(await panel(page).getByLabel('Proyek analisis', { exact: true }).inputValue(), '');
    await run(page);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await absent(page);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.getByRole('heading', { name: 'R1 fresh map', exact: true }).waitFor();
    await absent(page);
  }],
  ['Reviewed Copilot createMap clears overlay only when applied', async (page) => {
    await copilot(page, 'R1 reviewed map', true);
  }],
  ['Catalog client-side navigation replaces map without retaining overlay', async (page) => {
    await page.getByRole('link', { name: 'Webmap', exact: true }).click();
    await page.getByRole('link', { name: /Lihat Peta/ }).first().click();
    await page.locator('.gis-workspace-header h1').waitFor();
    await absent(page);
  }],
  ['Old preview cannot cross a byte-identical draft replacement', async (page) => {
    const title = await page.locator('.gis-workspace-header h1').textContent();
    await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
    await page.getByLabel('Otomatis terapkan perubahan sesi', { exact: true }).uncheck();
    await page.getByLabel('Instruksi GIS', { exact: true }).fill('Buatkan peta baru bernama Rejected old preview dan gunakan tanpa basemap.');
    await page.getByRole('button', { name: 'Kirim instruksi', exact: true }).click();
    await page.getByRole('button', { name: 'Terapkan ke sesi peta' }).waitFor();
    await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
    await page.getByRole('button', { name: 'Buka', exact: true }).click();
    await page.getByText('Draft dimuat.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Terapkan ke sesi peta' }).click();
    await page.getByText('Peta berubah sejak preview dibuat. Minta rencana baru.', { exact: true }).waitFor();
    assert.equal(await page.locator('.gis-workspace-header h1').textContent(), title);
    await absent(page);
  }],
  ['Opening identical local draft clears result and estimate', async (page) => {
    await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
    await page.getByRole('button', { name: 'Buka', exact: true }).click();
    await page.getByText('Draft dimuat.', { exact: true }).waitFor();
    await absent(page);
    assert.equal(await panel(page).getByText(/Estimasi server:/).count(), 0);
  }],
  ['Validated MapRecipe import clears prior overlay even with identical local IDs', async (page) => {
    await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
    const json = await page.evaluate(() => localStorage.getItem('p4i-map-draft-v1'));
    assert(json);
    await page.getByRole('tab', { name: 'Layer', exact: true }).click();
    await page.getByLabel('Impor MapRecipe JSON', { exact: true }).setInputFiles({ name: 'synthetic-r1.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await absent(page);
  }],
  ['Reopening project layer invalidates result without writing revisions', async (page) => {
    await page.getByRole('tab', { name: 'Layer', exact: true }).click();
    await page.locator('.gis-vector-storage').getByRole('button', { name: 'Buka dari Proyek', exact: true }).click();
    await absent(page);
  }],
  ['Harmless presentation changes preserve existing result', async (page) => {
    const p = panel(page);
    await p.getByLabel('Warna hasil', { exact: true }).fill('#2563eb');
    await p.getByLabel('Tampilkan hasil analisis', { exact: true }).uncheck();
    await absent(page);
    await p.getByLabel('Tampilkan hasil analisis', { exact: true }).check();
    await page.locator(overlay).first().waitFor({ state: 'attached' });
    await page.getByRole('tab', { name: 'Layer', exact: true }).click();
    await page.getByLabel('Basemap', { exact: true }).selectOption('none');
    await page.locator('.leaflet-control-zoom-in').click();
    await page.locator(overlay).first().waitFor({ state: 'attached' });
    assert(await page.locator(overlay).count() > 0);
    await page.screenshot({ path: dir + '/preserved-presentation.png', fullPage: true });
  }],
  ['Delayed analysis response cannot restore state after replacement', async (page, delay) => {
    // Keep request pending while a different UI pathway replaces the map.
    await estimate(page);
    delay.enabled = true;
    const started = new Promise((resolve) => { delay.started = resolve; });
    await panel(page).getByRole('button', { name: 'Jalankan analisis PostGIS' }).click();
    await started;
    await page.getByRole('tab', { name: 'Layer', exact: true }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('heading', { name: 'Peta kerja baru', exact: true }).waitFor();
    delay.release();
    await delay.delivered;
    await absent(page);
    await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
    assert.equal(await panel(page).getByText(/Estimasi server:/).count(), 0);
    assert(await panel(page).getByRole('button', { name: 'Jalankan analisis PostGIS' }).isDisabled());
  }],
];
try {
  for (const [name, test] of cases) {
    const context = await browser.newContext({ viewport: { width: 1480, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    const delay = { enabled: false };
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (/generativelanguage|supabase\.(co|com)|earthengine/.test(url.hostname) || url.pathname.startsWith('/api/gee/')) {
        forbiddenCalls++; return route.abort();
      }
      return route.continue();
    });
    await context.route('**/api/gis/vector-storage**', async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') { writes++; return route.fulfill({ status: 403, json: { error: 'Synthetic read-only fixture' } }); }
      const op = new URL(request.url()).searchParams.get('operation');
      const value = op === 'load' ? doc : op === 'layers' ? [{ id: doc.id, name: doc.layer.name, revision: doc.revision, featureCount: 1 }] : {
        available: true, mode: 'local-postgis', projects: [{ id: doc.projectId, title: 'R1 synthetic project', accessTier: 'restricted', canEdit: true }],
      };
      return route.fulfill({ json: value });
    });
    await context.route('**/api/gis/vector-analysis**', async (route) => {
      const request = route.request().postDataJSON();
      const preview = new URL(route.request().url()).searchParams.get('preview') === 'true';
      const value = preview ? result.estimate : { ...result, request };
      if (!preview && delay.enabled) {
        let done;
        delay.delivered = new Promise((resolve) => { done = resolve; });
        const hold = new Promise((resolve) => { delay.release = resolve; });
        delay.started();
        await hold;
        try { await route.fulfill({ json: value }); } catch { /* aborted on lifecycle disposal */ }
        done(); return;
      }
      return route.fulfill({ json: value });
    });
    await page.goto(base + '/spatial/viewer');
    await page.getByLabel('Basemap', { exact: true }).selectOption('none');
    const storage = page.locator('.gis-vector-storage');
    await storage.locator('summary').click();
    await storage.getByLabel('Proyek penyimpanan', { exact: true }).selectOption(doc.projectId);
    await storage.getByLabel('Layer proyek', { exact: true }).selectOption(doc.id);
    await storage.getByRole('button', { name: 'Buka dari Proyek', exact: true }).click();
    await storage.getByText(/Revisi 7 dibuka/).waitFor();
    await run(page);
    if (!flows.length) await page.screenshot({ path: dir + '/before-replacement.png', fullPage: true });
    await test(page, delay);
    flows.push(name);
    console.log('PASS', name);
    if (name.startsWith('Reviewed')) {
      await page.screenshot({ path: dir + '/after-replacement.png', fullPage: true });
      if (process.env.P4I_AXE_SCRIPT) {
        for (const width of [1480, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.addScriptTag({ path: process.env.P4I_AXE_SCRIPT });
          const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, impact: v.impact })));
          assert.deepEqual(violations, []); audits.push({ width, violations });
        }
      }
    }
    await context.close();
  }
  assert.equal(forbiddenCalls, 0); assert.equal(writes, 0); assert.deepEqual(errors, []);
  await writeFile(dir + '/results.json', JSON.stringify({ flows, audits, errors, forbiddenCalls, storageWrites: writes, dataMode: 'SYNTHETIC_BROWSER_MOCK_NO_DATABASE', result: 'passed' }, null, 2));
} finally { await browser.close(); }
