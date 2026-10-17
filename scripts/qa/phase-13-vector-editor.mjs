import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const dir = path.resolve(process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase13');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.P4I_CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const base = process.env.P4I_QA_BASE_URL || 'http://localhost:3000',
  errors = [],
  audits = [],
  flows = [];
let externalAI = 0;
async function ask(page, prompt) {
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  await page.getByLabel('Instruksi GIS', { exact: true }).fill(prompt);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/gis/copilot') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Kirim instruksi', exact: true })
    .click();
  const r = await response;
  assert.equal(r.status(), 200);
  const b = await r.json();
  await page
    .getByRole('button', { name: 'Kirim instruksi', exact: true })
    .waitFor();
  return b;
}
async function recipe(page) {
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('button', { name: 'Ekspor resep JSON', exact: true })
      .click(),
  ]);
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}
try {
  const page = await browser.newPage({
    viewport: { width: 1480, height: 1000 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/generativelanguage|\/api\/gee\//.test(r.url())) externalAI++;
  });
  await page.goto(`${base}/spatial/viewer`);
  await page.getByLabel('Basemap', { exact: true }).waitFor();
  let r = await ask(
    page,
    'Buatkan peta baru bernama Survei Lapangan dan gunakan OpenStreetMap.',
  );
  assert.equal(r.recipe.title, 'Survei Lapangan');
  r = await ask(
    page,
    'Tambahkan titik A pada longitude 103.61 dan latitude -1.61, warna merah.',
  );
  assert.deepEqual(
    r.recipe.sketchLayers[0].data.features[0].geometry.coordinates,
    [103.61, -1.61],
  );
  r = await ask(
    page,
    'Tambahkan titik B [103.62, -1.61]; C [103.62, -1.62]; D [103.61, -1.62]',
  );
  assert.equal(r.recipe.sketchLayers[0].data.features.length, 4);
  r = await ask(
    page,
    'Buat poligon dari titik A, B, C, dan D. Beri warna hijau dengan transparansi 40%.',
  );
  assert.equal(r.recipe.sketchLayers[0].data.features.length, 5);
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  await page
    .locator('.leaflet-sketch-local-vector-1-0-pane canvas')
    .first()
    .waitFor();
  assert(
    await page
      .locator('.leaflet-sketch-local-vector-1-0-pane canvas')
      .evaluate((c) => {
        const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        return a.some((v, i) => i % 4 === 3 && v > 0);
      }),
  );
  flows.push('Indonesian map/points/polygon appear in actual Leaflet pane');
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  const saved = JSON.parse(
    await page.evaluate(() => localStorage.getItem('p4i-map-draft-v1')),
  );
  assert.equal(saved.sketchLayers[0].data.features.length, 5);
  const panel = page.locator('.gis-vector-editor');
  await panel.getByLabel('A · Point', { exact: true }).check();
  await panel.getByLabel('Nama objek', { exact: true }).fill('Titik survei');
  await panel
    .getByRole('button', { name: 'Perbarui nama dan deskripsi', exact: true })
    .click();
  await panel
    .getByLabel('Koordinat GeoJSON (longitude, latitude)', { exact: true })
    .fill('[103.605,-1.605]');
  await panel
    .getByRole('button', { name: 'Perbarui geometri', exact: true })
    .click();
  await panel.getByLabel('Style objek warna', { exact: true }).fill('#2563eb');
  let parsed = await recipe(page);
  assert.equal(
    parsed.sketchLayers[0].data.features[0].properties.name,
    'Titik survei',
  );
  assert.deepEqual(
    parsed.sketchLayers[0].data.features[0].geometry.coordinates,
    [103.605, -1.605],
  );
  await panel.getByRole('button', { name: 'Hapus objek', exact: true }).click();
  assert.equal((await recipe(page)).sketchLayers[0].data.features.length, 4);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal((await recipe(page)).sketchLayers[0].data.features.length, 5);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal((await recipe(page)).sketchLayers[0].data.features.length, 4);
  flows.push('Manual rename, coordinates, style, delete, Undo/Redo');
  await page.getByRole('button', { name: 'Buka', exact: true }).click();
  assert.deepEqual((await recipe(page)).sketchLayers, saved.sketchLayers);
  flows.push(
    'Explicit save and reload GeoJSON in existing local MapRecipe draft',
  );
  await panel
    .getByRole('button', { name: 'Tambah titik dengan klik', exact: true })
    .click();
  const map = page.locator('.leaflet-container');
  await map.click({ position: { x: 220, y: 180 } });
  assert.equal((await recipe(page)).sketchLayers[0].data.features.length, 6);
  await panel
    .getByRole('button', { name: 'Gambar poligon', exact: true })
    .click();
  for (const position of [
    { x: 210, y: 150 },
    { x: 270, y: 150 },
    { x: 270, y: 200 },
  ])
    await map.click({ position });
  await panel
    .getByRole('button', { name: 'Selesaikan poligon', exact: true })
    .click();
  assert.equal((await recipe(page)).sketchLayers[0].data.features.length, 7);
  await panel
    .getByRole('button', { name: 'Selesai edit', exact: true })
    .click();
  flows.push('Click-to-add point and polygon vertices');
  const [geojson] = await Promise.all([
    page.waitForEvent('download'),
    panel
      .getByRole('button', { name: 'Unduh GeoJSON layer', exact: true })
      .click(),
  ]);
  await geojson.saveAs(path.join(dir, 'synthetic-vector.geojson'));
  assert.equal(
    JSON.parse(await readFile(await geojson.path(), 'utf8')).features.length,
    7,
  );
  for (const [name, pattern] of [
    ['Ekspor PNG', /PNG/i],
    ['Ekspor PDF', /PDF/i],
  ]) {
    const button = page.getByRole('button', { name: pattern }).first();
    if (await button.count()) {
      const [d] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        button.click(),
      ]);
      await d.saveAs(path.join(dir, d.suggestedFilename()));
      flows.push(`${name} download`);
    }
  }
  const missing = await ask(page, 'Tambahkan titik tanpa koordinat');
  assert.equal(missing.status, 'needs-input');
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  for (const width of [1480, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overflow ${width}`,
    );
    if (process.env.P4I_AXE_SCRIPT) {
      await page.addScriptTag({ path: process.env.P4I_AXE_SCRIPT });
      const result = await page.evaluate(async () =>
        window.axe.run(document.querySelector('main') || document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
        }),
      );
      audits.push({
        width,
        violations: result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
      });
      assert.deepEqual(audits.at(-1).violations, []);
    }
    await page.screenshot({
      path: path.join(dir, `editor-${width}.png`),
      fullPage: true,
    });
  }
  assert.equal(externalAI, 0);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, 'results.json'),
    JSON.stringify(
      { flows, audits, errors, externalAI, result: 'passed' },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ flows, audits, errors, externalAI, result: 'passed' }),
  );
} finally {
  await browser.close();
}
