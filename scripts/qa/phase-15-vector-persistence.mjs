// Requires the explicit disposable local fixture. Uses real UI -> Next API -> PostgREST -> PostGIS.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const state = JSON.parse(
  await readFile(
    process.env.P4I_VECTOR_TEST_STATE ||
      '/workspace/artifacts/phase-15/local-state.json',
    'utf8',
  ),
);
assert.match(state.db, /^p4i-vector15-[a-f0-9]+-db$/);
assert.equal(new URL(state.endpoint).hostname, '127.0.0.1');
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const dir =
  process.env.P4I_QA_ARTIFACTS || '/workspace/artifacts/phase-15/browser';
await mkdir(dir, { recursive: true });
const base = 'http://127.0.0.1:3000',
  browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
const flows = [],
  audits = [],
  errors = [];
let external = 0;
async function newPage(who = 'analyst') {
  const context = await browser.newContext({
    viewport: { width: 1480, height: 1000 },
  });
  if (who !== 'guest')
    await context.addCookies([
      {
        name: 'sb-access-token',
        value: state.tokens[who],
        url: base,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/generativelanguage|\/api\/gee\//.test(r.url())) external++;
  });
  page.on('dialog', (d) => d.accept());
  await page.goto(base + '/spatial/viewer');
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  const panel = page.locator('.gis-vector-storage');
  await panel.locator('summary').click();
  await panel.getByLabel('Proyek penyimpanan', { exact: true }).waitFor();
  return { page, context, panel };
}
async function chooseA(p) {
  await p.panel
    .getByLabel('Proyek penyimpanan', { exact: true })
    .selectOption(state.projects.A);
}
async function load(p, id) {
  await chooseA(p);
  await p.panel.getByLabel('Layer proyek', { exact: true }).selectOption(id);
  await p.panel
    .getByRole('button', { name: 'Buka dari Proyek', exact: true })
    .click();
  await p.panel.getByText(/Revisi \d+ dibuka/).waitFor();
}
async function save(p) {
  const response = p.page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/gis/vector-storage') &&
      r.request().method() === 'POST',
  );
  await p.panel
    .getByRole('button', { name: 'Simpan ke Proyek', exact: true })
    .click();
  const r = await response;
  return { status: r.status(), data: await r.json() };
}
async function recipe(page) {
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('button', { name: 'Ekspor resep JSON', exact: true })
      .click(),
  ]);
  return JSON.parse(await readFile(await d.path(), 'utf8'));
}
try {
  const a = await newPage();
  await chooseA(a);
  const editor = a.page.locator('.gis-vector-editor');
  await editor
    .getByLabel('Nama layer baru', { exact: true })
    .fill('Survei Persisten');
  await editor
    .getByRole('button', { name: 'Tambah layer vektor', exact: true })
    .click();
  await editor.getByLabel('Nama titik', { exact: true }).fill('A');
  await editor.getByLabel('Longitude', { exact: true }).fill('103.61');
  await editor.getByLabel('Latitude', { exact: true }).fill('-1.61');
  await editor
    .getByRole('button', { name: 'Tambahkan titik koordinat', exact: true })
    .click();
  const first = await save(a);
  assert.equal(first.status, 200);
  assert.equal(first.data.revision, 1);
  const id = first.data.id;
  await a.panel
    .getByText('Sesuai revisi tersimpan 1.', { exact: true })
    .waitFor();
  assert.equal(
    await a.page.evaluate(() => localStorage.getItem('p4i-map-draft-v1')),
    null,
  );
  flows.push(
    'Explicit authenticated UI save commits real PostGIS revision 1, without localStorage fallback',
  );
  const b = await newPage();
  await load(b, id);
  assert.equal(
    (await recipe(b.page)).sketchLayers[0].data.features[0].properties.name,
    'A',
  );
  await load(a, id);
  await editor.getByLabel('A · Point', { exact: true }).check();
  await editor
    .getByLabel('Koordinat GeoJSON (longitude, latitude)', { exact: true })
    .fill('[103.62,-1.62]');
  await editor
    .getByRole('button', { name: 'Perbarui geometri', exact: true })
    .click();
  const next = await save(a);
  assert.equal(next.status, 200);
  assert.equal(next.data.revision, 2);
  assert.equal(next.data.features[0].id, first.data.features[0].id);
  const be = b.page.locator('.gis-vector-editor');
  await be.getByLabel('A · Point', { exact: true }).check();
  await be.getByLabel('Nama objek', { exact: true }).fill('Stale edit');
  await be
    .getByRole('button', { name: 'Perbarui nama dan deskripsi', exact: true })
    .click();
  const conflict = await save(b);
  assert.equal(conflict.status, 409);
  assert.match(await b.panel.innerText(), /Konflik revisi/);
  assert.equal(
    (await recipe(b.page)).sketchLayers[0].data.features[0].properties.name,
    'Stale edit',
  );
  await b.panel
    .getByRole('button', { name: 'Muat ulang perubahan', exact: true })
    .click();
  await b.panel.getByText(/Revisi 2 dibuka/).waitFor();
  assert.deepEqual(
    (await recipe(b.page)).sketchLayers[0].data.features[0].geometry
      .coordinates,
    [103.62, -1.62],
  );
  flows.push(
    'Fresh browser reopens durable data; two sessions conflict safely; explicit reload obtains revision 2',
  );
  await a.page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.notDeepEqual(
    (await recipe(a.page)).sketchLayers[0].data.features[0].geometry
      .coordinates,
    [103.62, -1.62],
  );
  const server = await a.page.request.get(
    base +
      `/api/gis/vector-storage?operation=load&projectId=${state.projects.A}&layerId=${id}`,
  );
  assert.equal((await server.json()).revision, 2);
  await a.panel
    .getByRole('button', { name: 'Batalkan perubahan lokal', exact: true })
    .click();
  assert.deepEqual(
    (await recipe(a.page)).sketchLayers[0].data.features[0].geometry
      .coordinates,
    [103.62, -1.62],
  );
  await a.panel
    .getByRole('button', { name: 'Simpan draft lokal', exact: true })
    .click();
  assert.equal(
    JSON.parse(
      await a.page.evaluate(() => localStorage.getItem('p4i-map-draft-v1')),
    ).sketchLayers[0].data.features[0].properties.name,
    'A',
  );
  flows.push(
    'Local Undo does not revert committed revision; cancel-local restores last committed snapshot',
  );
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    started = new Promise((r) => (entered = r));
  await a.page.route('**/api/gis/vector-storage', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    entered();
    await gate;
    await route.fulfill({ response });
  });
  const pending = save(a);
  await started;
  await editor
    .getByLabel('Nama objek', { exact: true })
    .fill('Pending local edit');
  await editor
    .getByRole('button', { name: 'Perbarui nama dan deskripsi', exact: true })
    .click();
  release();
  assert.equal((await pending).status, 200);
  await a.panel.getByText(/sesi berubah saat menyimpan/).waitFor();
  assert.equal(
    (await recipe(a.page)).sketchLayers[0].data.features[0].properties.name,
    'Pending local edit',
  );
  await a.page.unroute('**/api/gis/vector-storage');
  await a.panel
    .getByRole('button', { name: 'Simpan draft lokal', exact: true })
    .click();
  await load(a, id);
  flows.push(
    'Delayed committed save retains newer local edits and refuses stale project-binding attachment',
  );
  // Import and persist all Phase 14 multipart/hole fixtures as another layer in this existing project.
  await editor.getByText('Impor GeoJSON lokal', { exact: true }).click();
  await editor
    .getByLabel('Saya memastikan input WGS84 longitude, latitude', {
      exact: true,
    })
    .check();
  await editor
    .getByLabel('File GeoJSON', { exact: true })
    .setInputFiles(
      path.resolve('docs/evidence/phase-14/synthetic-multipart.geojson'),
    );
  await editor
    .getByLabel('Layer edit', { exact: true })
    .selectOption({ label: 'Impor lokal' });
  const multi = await save(a);
  assert.equal(multi.status, 200);
  assert.equal(multi.data.layer.data.features.length, 3);
  const c = await newPage();
  await load(c, multi.data.id);
  const roundtrip = (await recipe(c.page)).sketchLayers[0].data.features.map(
    (f) => f.geometry,
  );
  const original = JSON.parse(
    await readFile(
      'docs/evidence/phase-14/synthetic-multipart.geojson',
      'utf8',
    ),
  ).features.map((f) => f.geometry);
  assert.deepEqual(roundtrip, original);
  flows.push(
    'Real server roundtrip preserves Polygon holes, MultiLineString and MultiPolygon in a second project layer',
  );
  const client = await newPage('clientA');
  await load(client, id);
  assert.equal(
    await client.panel
      .getByRole('button', { name: 'Simpan ke Proyek', exact: true })
      .isDisabled(),
    true,
  );
  const forged = {
    projectId: state.projects.A,
    layerId: id,
    expectedRevision: 2,
    requestId: crypto.randomUUID(),
    layer: next.data.layer,
    archive: false,
  };
  const denied = await client.page.request.post(
    base + '/api/gis/vector-storage',
    { headers: { Origin: base }, data: forged },
  );
  assert.equal(denied.status(), 403);
  const other = await newPage('clientB');
  const cross = await other.page.request.get(
    base +
      `/api/gis/vector-storage?operation=load&projectId=${state.projects.A}&layerId=${id}`,
  );
  assert.equal(cross.status(), 403);
  const invalidIdentity = await other.page.request.get(
    base + '/api/gis/vector-storage',
    { headers: { Authorization: 'Bearer invalid.synthetic.signature' } },
  );
  assert.equal(invalidIdentity.status(), 401);
  const disabledIdentity = await other.page.request.get(
    base + '/api/gis/vector-storage',
    { headers: { Authorization: 'Bearer ' + state.tokens.disabled } },
  );
  assert.equal(disabledIdentity.status(), 403);
  flows.push(
    'Read-only client controls and direct API deny writes; other-client project access denied',
  );
  for (const width of [1480, 768, 390, 320]) {
    await c.page.setViewportSize({ width, height: 1000 });
    await c.panel.scrollIntoViewIfNeeded();
    assert(
      await c.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overflow ${width}`,
    );
    if (process.env.P4I_AXE_SCRIPT) {
      await c.page.addScriptTag({ path: process.env.P4I_AXE_SCRIPT });
      const check = await c.page.evaluate(() =>
        window.axe.run(document.querySelector('main') || document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
        }),
      );
      audits.push({
        width,
        violations: check.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      });
      assert.deepEqual(audits.at(-1).violations, []);
    }
    await c.page.screenshot({
      path: path.join(dir, `persistence-${width}.png`),
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
  console.error(e.message);
  for (const context of browser.contexts()) {
    const p = context.pages()[0];
    if (p)
      await p.screenshot({
        path: path.join(
          dir,
          `failure-${browser.contexts().indexOf(context)}.png`,
        ),
        fullPage: true,
      });
  }
  throw e;
} finally {
  await browser.close();
}
