import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const dir = path.resolve(process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase14');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.P4I_CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const flows = [],
  errors = [],
  audits = [];
let external = 0;
const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (/generativelanguage|\/api\/gee\//.test(r.url())) external++;
});
async function exportRecipe() {
  // Does not switch tabs: mode and unfinished editing must remain intact.
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('button', { name: 'Ekspor resep JSON', exact: true })
      .click(),
  ]);
  return JSON.parse(await readFile(await d.path(), 'utf8'));
}
async function ask(prompt) {
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
  const data = await r.json();
  await page
    .getByRole('button', { name: 'Kirim instruksi', exact: true })
    .waitFor();
  return data;
}
try {
  await page.goto(
    (process.env.P4I_QA_BASE_URL || 'http://localhost:3000') +
      '/spatial/viewer',
  );
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  const panel = page.locator('.gis-vector-editor'),
    map = page.locator('.leaflet-container');
  await panel
    .getByRole('button', { name: 'Tambah layer vektor', exact: true })
    .click();
  await panel
    .getByRole('button', { name: 'Gambar garis', exact: true })
    .click();
  for (const position of [
    { x: 240, y: 180 },
    { x: 330, y: 180 },
    { x: 390, y: 240 },
  ])
    await map.click({ position });
  assert.equal((await exportRecipe()).sketchLayers[0].data.features.length, 0);
  await panel
    .getByRole('button', { name: 'Selesaikan garis', exact: true })
    .click();
  let recipe = await exportRecipe();
  assert.equal(
    recipe.sketchLayers[0].data.features[0].geometry.type,
    'LineString',
  );
  const original = recipe.sketchLayers[0].data.features[0].geometry;
  flows.push(
    'Real map clicks draw a three-vertex LineString; unfinished geometry excluded from export',
  );
  await panel.getByLabel('Garis 1 · LineString', { exact: true }).check();
  await panel.getByRole('button', { name: 'Edit vertex', exact: true }).click();
  const handles = page.locator('.gis-vertex-handle');
  assert.equal(await handles.count(), 3);
  let box = await handles.nth(1).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 45, { steps: 8 });
  await page.mouse.up();
  recipe = await exportRecipe();
  assert.notDeepEqual(
    recipe.sketchLayers[0].data.features[0].geometry,
    original,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(
    (await exportRecipe()).sketchLayers[0].data.features[0].geometry,
    original,
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const edited = (await exportRecipe()).sketchLayers[0].data.features[0]
    .geometry;
  assert.notDeepEqual(edited, original);
  box = await handles.nth(1).boundingBox();
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual(
    (await exportRecipe()).sketchLayers[0].data.features[0].geometry,
    edited,
  );
  flows.push(
    'Actual draggable Leaflet handles: one Undo for drag, Redo, Escape cancellation',
  );
  await panel
    .getByRole('button', {
      name: 'Sisipkan vertex tengah setelah pilihan',
      exact: true,
    })
    .click();
  assert.equal(
    (await exportRecipe()).sketchLayers[0].data.features[0].geometry.coordinates
      .length,
    4,
  );
  await panel.getByLabel('Nomor vertex', { exact: true }).selectOption('1');
  await panel
    .getByRole('button', { name: 'Hapus vertex pilihan', exact: true })
    .click();
  assert.equal(
    (await exportRecipe()).sketchLayers[0].data.features[0].geometry.coordinates
      .length,
    3,
  );
  await panel
    .getByRole('button', { name: 'Tabel atribut', exact: true })
    .click();
  const table = panel.getByRole('region', {
    name: 'Tabel atribut',
    exact: true,
  });
  await table.getByLabel('Nama field', { exact: true }).fill('sample');
  await table.getByLabel('Tipe field', { exact: true }).selectOption('number');
  await table
    .getByRole('button', { name: 'Tambah field', exact: true })
    .click();
  await table.getByLabel('Garis 1 sample', { exact: true }).fill('42');
  await table.getByLabel('Cari atribut', { exact: true }).click();
  assert.equal(
    (await exportRecipe()).sketchLayers[0].data.features[0].properties
      .attributes.sample,
    42,
  );
  await table.getByLabel('Cari atribut', { exact: true }).fill('missing');
  assert.equal(await table.locator('tbody tr').count(), 0);
  await table.getByLabel('Cari atribut', { exact: true }).fill('Garis');
  assert.equal(await table.locator('tbody tr').count(), 1);
  await table.getByLabel('Pilih baris Garis 1', { exact: true }).uncheck();
  assert.equal(await handles.count(), 0);
  await table.getByLabel('Pilih baris Garis 1', { exact: true }).check();
  assert.equal(await handles.count(), 3);
  flows.push(
    'Keyboard vertex insertion/removal and real typed attribute table editing/filtering/selection',
  );
  // Snapping to a visible existing endpoint from 10 px away, beyond marker hit box.
  box = await handles.first().boundingBox();
  const endpoint = (await exportRecipe()).sketchLayers[0].data.features[0]
    .geometry.coordinates[0];
  await panel
    .getByRole('button', { name: 'Tambah titik dengan klik', exact: true })
    .click();
  await page.mouse.move(box.x + 8, box.y - 2);
  await page.mouse.click(box.x + 8, box.y - 2);
  recipe = await exportRecipe();
  assert.equal(recipe.sketchLayers[0].data.features.length, 2);
  assert.deepEqual(
    recipe.sketchLayers[0].data.features[1].geometry.coordinates,
    endpoint,
  );
  flows.push('Screen-space vertex snap matches the existing endpoint exactly');
  await panel
    .getByRole('button', { name: 'Gambar poligon', exact: true })
    .click();
  for (const position of [
    { x: 450, y: 200 },
    { x: 510, y: 200 },
    { x: 510, y: 270 },
  ])
    await map.click({ position });
  await panel
    .getByRole('button', { name: 'Selesaikan poligon', exact: true })
    .click();
  assert.equal(
    (await exportRecipe()).sketchLayers[0].data.features[2].geometry.type,
    'Polygon',
  );
  await panel
    .getByRole('button', { name: 'Selesai edit', exact: true })
    .click();
  await panel.getByLabel('Garis 1 · LineString', { exact: true }).check();
  const ai = await ask('Ubah warna garis menjadi biru.');
  assert.equal(ai.status, 'completed');
  assert.equal(
    ai.recipe.sketchLayers[0].data.features[0].properties.style.color,
    '#2563eb',
  );
  const inspected = await ask('Tampilkan tabel atribut layer Survei Lapangan.');
  assert.equal(inspected.status, 'completed');
  await page
    .getByRole('region', { name: 'Tabel atribut', exact: true })
    .waitFor();
  flows.push(
    'Existing Copilot applies validated line styling and opens actual attribute table',
  );
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  // Import holes and multipart geometries using only local synthetic coordinates.
  const fixture = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'a',
        properties: { name: 'Area berlubang', sample: 1 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [103.6, -1.6],
              [103.64, -1.6],
              [103.64, -1.64],
              [103.6, -1.64],
              [103.6, -1.6],
            ],
            [
              [103.61, -1.61],
              [103.61, -1.62],
              [103.62, -1.62],
              [103.62, -1.61],
              [103.61, -1.61],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        id: 'b',
        properties: { name: 'Jalur multipart' },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [103.6, -1.6],
              [103.64, -1.64],
            ],
            [
              [103.65, -1.6],
              [103.65, -1.64],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        id: 'c',
        properties: { name: 'Area multipart' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [103.66, -1.6],
                [103.68, -1.6],
                [103.68, -1.62],
                [103.66, -1.6],
              ],
            ],
            [
              [
                [103.69, -1.6],
                [103.7, -1.6],
                [103.7, -1.62],
                [103.69, -1.6],
              ],
            ],
          ],
        },
      },
    ],
  };
  await panel.getByText('Impor GeoJSON lokal', { exact: true }).click();
  await panel
    .getByLabel('Saya memastikan input WGS84 longitude, latitude', {
      exact: true,
    })
    .check();
  await panel
    .getByLabel('File GeoJSON', { exact: true })
    .setInputFiles({
      name: 'synthetic.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await panel
    .getByLabel('Layer edit', { exact: true })
    .selectOption({ label: 'Impor lokal' });
  assert.equal((await exportRecipe()).sketchLayers[1].data.features.length, 3);
  await panel.getByLabel('Area berlubang · Polygon', { exact: true }).check();
  await panel.getByRole('button', { name: 'Edit vertex', exact: true }).click();
  assert.equal(await handles.count(), 8);
  await panel
    .getByRole('button', { name: 'Zoom ke pilihan', exact: true })
    .click();
  await panel.getByLabel('Nama layer', { exact: true }).fill('Survei impor');
  await panel.getByRole('heading', { name: 'Editor vektor lokal' }).click();
  await panel
    .getByRole('button', { name: 'Turunkan urutan', exact: true })
    .click();
  assert.equal((await exportRecipe()).sketchLayers[0].name, 'Survei impor');
  page.once('dialog', (d) => d.dismiss());
  await panel
    .getByRole('button', { name: 'Hapus layer vektor', exact: true })
    .click();
  assert.equal((await exportRecipe()).sketchLayers.length, 2);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel
      .getByRole('button', { name: 'Unduh GeoJSON layer', exact: true })
      .click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(
    exported.features.map((f) => f.geometry),
    fixture.features.map((f) => f.geometry),
  );
  await download.saveAs(path.join(dir, 'synthetic-multipart.geojson'));
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  assert.equal(
    JSON.parse(
      await page.evaluate(() => localStorage.getItem('p4i-map-draft-v1')),
    ).sketchLayers.length,
    2,
  );
  flows.push(
    'Validated local import renders holes/multipart; layer reorder, cancelled deletion, faithful GeoJSON export and explicit save',
  );
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
      const result = await page.evaluate(() =>
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
      path: path.join(dir, `digitizing-${width}.png`),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  assert.equal(external, 0);
  await writeFile(
    path.join(dir, 'results.json'),
    JSON.stringify(
      { flows, audits, errors, external, result: 'passed' },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ flows, audits, errors, external, result: 'passed' }),
  );
} catch (e) {
  await page.screenshot({
    path: path.join(dir, 'failure.png'),
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
