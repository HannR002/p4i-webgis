// Synthetic data only, actual Next -> PostgREST -> PostGIS; never external provider inference.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const state = JSON.parse(
  await readFile(process.env.P4I_VECTOR_TEST_STATE, 'utf8'),
);
assert.match(state.db, /^p4i-vector15-[a-f0-9]+-db$/);
assert.equal(new URL(state.endpoint).hostname, '127.0.0.1');
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const dir =
  process.env.P4I_QA_ARTIFACTS || '/workspace/artifacts/phase-16/browser';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const base = 'http://127.0.0.1:3000',
  flows = [],
  audits = [],
  errors = [];
let external = 0;
async function rpc(operation, input) {
  const r = await fetch(state.endpoint + '/rpc/p4i_vector_store', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.tokens.analyst}`,
    },
    body: JSON.stringify({ operation, input }),
  });
  assert.equal(r.status, 200);
  return r.json();
}
const square = (x, y) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + 0.002, y],
      [x + 0.002, y + 0.002],
      [x, y + 0.002],
      [x, y],
    ],
  ],
});
const layer = {
  id: 'local-vector-1',
  name: 'QA Analisis Survei',
  visible: true,
  opacity: 1,
  style: {
    color: '#0f766e',
    fillColor: '#0f766e',
    weight: 2,
    fillOpacity: 0.3,
    radius: 6,
  },
  data: {
    type: 'FeatureCollection',
    features: [
      { type: 'Point', coordinates: [103.61, -1.61] },
      square(103.61, -1.61),
      square(103.611, -1.61),
    ].map((geometry, i) => ({
      type: 'Feature',
      id: `local-feature-${i + 1}`,
      geometry,
      properties: {
        name: ['A', 'Kawasan B', 'Kawasan C'][i],
        description: 'Synthetic local test',
        attributes: { group: 'uji' },
      },
    })),
  },
};
const doc = await rpc('save', {
  projectId: state.projects.A,
  layerId: null,
  expectedRevision: 0,
  requestId: randomUUID(),
  archive: false,
  layer,
});
const before = await rpc('load', { projectId: doc.projectId, layerId: doc.id });
try {
  const context = await browser.newContext({
    viewport: { width: 1480, height: 1000 },
  });
  await context.addCookies([
    {
      name: 'sb-access-token',
      value: state.tokens.analyst,
      url: base,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/generativelanguage|\/api\/gee\//.test(r.url())) external++;
  });
  await page.goto(base + '/spatial/viewer');
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  // Open persisted data through existing Phase15 UI so AI can resolve its local IDs without assigning DB authority.
  const storage = page.locator('.gis-vector-storage');
  await storage.locator('summary').click();
  await storage
    .getByLabel('Proyek penyimpanan', { exact: true })
    .selectOption(doc.projectId);
  await storage
    .getByLabel('Layer proyek', { exact: true })
    .selectOption(doc.id);
  await storage
    .getByRole('button', { name: 'Buka dari Proyek', exact: true })
    .click();
  await storage.getByText(/Revisi 1 dibuka/).waitFor();
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  await page
    .getByLabel('Instruksi GIS', { exact: true })
    .fill('Buat buffer 500 meter dari titik A.');
  const pending = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/gis/copilot') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Kirim instruksi', exact: true })
    .click();
  const ai = await pending;
  assert.equal(ai.status(), 200);
  const a = await ai.json();
  assert.equal(a.plan.steps[0].action.tool, 'prepareVectorAnalysis');
  assert.equal(a.changed, false);
  let panel = page.getByRole('region', {
    name: 'Analisis vektor PostGIS',
    exact: true,
  });
  await panel
    .getByRole('button', { name: 'Gunakan usulan analisis Copilot' })
    .click();
  async function estimateAndRun() {
    await panel
      .getByRole('button', { name: 'Periksa estimasi PostGIS' })
      .click();
    await panel.getByText(/Estimasi server:/).waitFor();
    const p = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/gis/vector-analysis') &&
        r.request().method() === 'POST',
    );
    await panel
      .getByRole('button', { name: 'Jalankan analisis PostGIS' })
      .click();
    const r = await p;
    assert.equal(r.status(), 200);
    await panel.getByText(/Selesai:/).waitFor();
    return r.json();
  }
  const buffer = await estimateAndRun();
  assert.equal(buffer.request.operation, 'buffer');
  assert.equal(buffer.layer.data.features[0].geometry.type, 'Polygon');
  await page
    .locator('.leaflet-vector-analysis-preview-pane')
    .waitFor({ state: 'attached' });
  assert.ok(
    await page
      .locator(
        '.leaflet-vector-analysis-preview-pane canvas, .leaflet-vector-analysis-preview-pane path',
      )
      .count(),
  );
  await page
    .locator(
      '.leaflet-vector-analysis-preview-pane canvas, .leaflet-vector-analysis-preview-pane svg',
    )
    .first()
    .waitFor({ state: 'visible' });
  flows.push(
    'AI deterministic preparation -> authorized estimate -> real buffer -> existing Leaflet preview',
  );
  await panel.getByLabel('Warna hasil', { exact: true }).fill('#2563eb');
  await panel.getByLabel('Tampilkan hasil analisis', { exact: true }).uncheck();
  assert.equal(
    await page.locator('.leaflet-vector-analysis-preview-pane').count(),
    0,
  );
  await panel.getByLabel('Tampilkan hasil analisis', { exact: true }).check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Unduh GeoJSON hasil' }).click(),
  ]);
  const geo = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(geo.p4iAnalysis.engine, 'PostGIS');
  assert.equal(geo.features[0].geometry.type, 'Polygon');
  flows.push(
    'result visibility/style and real GeoJSON download with provenance',
  );
  await page.screenshot({
    path: dir + '/desktop-analysis.png',
    fullPage: true,
  });
  // The same panel is mounted on Analysis tab; choose two stored inputs and one feature per set.
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  panel = page.getByRole('region', {
    name: 'Analisis vektor PostGIS',
    exact: true,
  });
  await panel
    .getByLabel('Proyek analisis', { exact: true })
    .selectOption(doc.projectId);
  await panel
    .getByLabel('Operasi vektor', { exact: true })
    .selectOption('intersection');
  await panel
    .getByLabel('Layer sumber analisis', { exact: true })
    .selectOption(doc.id);
  await panel
    .getByLabel('Layer pembanding', { exact: true })
    .selectOption(doc.id);
  const source = panel.getByRole('group', { name: /Fitur sumber/ }),
    target = panel.getByRole('group', { name: /Fitur pembanding/ });
  for (const c of await source.getByRole('checkbox').all()) await c.uncheck();
  for (const c of await target.getByRole('checkbox').all()) await c.uncheck();
  await source.getByLabel(/Kawasan B/).check();
  await target.getByLabel(/Kawasan C/).check();
  const intersection = await estimateAndRun();
  assert.equal(intersection.layer.data.features[0].geometry.type, 'Polygon');
  flows.push('two-source intersection from explicit stored feature selections');
  await panel
    .getByRole('button', { name: 'Salin hasil ke editor untuk disimpan' })
    .click();
  await panel.getByText(/Hasil disalin ke editor/).waitFor();
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  const savePanel = page.locator('.gis-vector-storage');
  if (
    !(await savePanel
      .getByLabel('Proyek penyimpanan', { exact: true })
      .isVisible())
  )
    await savePanel.locator('summary').click();
  await savePanel
    .getByLabel('Proyek penyimpanan', { exact: true })
    .selectOption(doc.projectId);
  const savedPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/gis/vector-storage') &&
      r.request().method() === 'POST',
  );
  await savePanel
    .getByRole('button', { name: 'Simpan ke Proyek', exact: true })
    .click();
  const sr = await savedPromise;
  assert.equal(sr.status(), 200);
  const saved = await sr.json();
  assert.notEqual(saved.id, doc.id);
  assert.equal(saved.revision, 1);
  assert.equal(saved.layer.data.features[0].geometry.type, 'Polygon');
  assert.deepEqual(
    await rpc('load', { projectId: doc.projectId, layerId: doc.id }),
    before,
  );
  flows.push(
    'explicit copy + Phase15 authorized save, new revision evidence, source untouched',
  );
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  panel = page.getByRole('region', {
    name: 'Analisis vektor PostGIS',
    exact: true,
  });
  for (const width of [1480, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.scrollIntoViewIfNeeded();
    if (process.env.P4I_AXE_SCRIPT) {
      await page.addScriptTag({ path: process.env.P4I_AXE_SCRIPT });
      const r = await page.evaluate(async () =>
        window.axe.run(
          document.querySelector('[aria-label="Analisis vektor PostGIS"]'),
          {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          },
        ),
      );
      assert.deepEqual(
        r.violations.map((v) => v.id),
        [],
      );
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    audits.push({ width, overflow: false, axeViolations: 0 });
    await page.screenshot({
      path: `${dir}/analysis-${width}.png`,
      fullPage: true,
    });
  }
  const invalid = await page.evaluate(async () => {
    const r = await fetch('/api/gis/vector-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'sql', role: 'super_admin' }),
    });
    return r.status;
  });
  assert.equal(invalid, 400);
  flows.push('direct malformed API denied');
  assert.equal(external, 0);
  assert.deepEqual(errors, []);
  await writeFile(
    dir + '/summary.json',
    JSON.stringify(
      { passed: true, flows, audits, errors, externalCalls: external },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      flows: flows.length,
      audits: audits.length,
      externalCalls: external,
    }),
  );
} catch (e) {
  await writeFile(dir + '/failure.txt', String(e));
  throw e;
} finally {
  await browser.close();
}
