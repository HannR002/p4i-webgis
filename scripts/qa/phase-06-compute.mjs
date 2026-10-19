import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const dir = path.resolve(process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase-06');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.P4I_CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const base = process.env.P4I_QA_BASE_URL || 'http://localhost:3000';
const errors = [],
  flows = [],
  audits = [];
let externalComputeCalls = 0;
let page;
async function ask(page, prompt) {
  const pending = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/gis/copilot') && r.request().method() === 'POST',
  );
  await page.getByLabel('Instruksi GIS', { exact: true }).fill(prompt);
  await page
    .getByRole('button', { name: 'Kirim instruksi', exact: true })
    .click();
  const response = await pending,
    body = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(body));
  // The form clears the prompt after success, so the submit button remains
  // disabled. Its restored label signals completion; the exact job ID/state
  // below proves React rendered this response rather than an older card.
  await page
    .getByRole('button', { name: 'Kirim instruksi', exact: true })
    .waitFor();
  assert.equal(
    await page.locator('.gis-copilot .gis-error[role=alert]').count(),
    0,
    'Copilot rejected the response; do not conceal stale-state failures',
  );
  const job = body.results?.find((result) => result.data?.job)?.data.job;
  if (job) {
    await page.waitForFunction(
      ({ id, state }) =>
        [...document.querySelectorAll('.gis-compute-card')].some(
          (card) =>
            card.textContent?.includes(id) &&
            [...card.querySelectorAll('[role=status] .gis-tag')].some(
              (tag) => tag.textContent?.trim() === state,
            ),
        ),
      { id: job.id, state: job.state },
    );
  }
  return body;
}
async function screenshot(page, name) {
  await page.locator('.gis-compute-card').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: path.join(dir, name), fullPage: true });
}
try {
  page = await browser.newPage({
    viewport: { width: 1480, height: 1000 },
    acceptDownloads: true,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\/api\/gee\//.test(r.url())) externalComputeCalls++;
  });
  await page.goto(`${base}/spatial/viewer?webmap=climate`);
  await page.getByText('Layer aktif (2)', { exact: true }).waitFor();
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  let r = await ask(page, 'Hitung luas area contoh Barat');
  assert.equal(r.results[0].data.job.state, 'COMPLETED');
  assert.equal(r.recipe.analysisResults.length, 1);
  await page
    .locator('.gis-compute-card')
    .getByText('COMPLETED', { exact: true })
    .waitFor();
  await screenshot(page, 'area-desktop.png');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('button', { name: 'Unduh laporan draft (.md)', exact: true })
      .click(),
  ]);
  await download.saveAs(path.join(dir, 'area-draft.md'));
  assert.match(
    await readFile(path.join(dir, 'area-draft.md'), 'utf8'),
    /areaSquareMetres/,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  flows.push(
    'Automatic area job, MapRecipe result, undo/redo, actual Markdown download',
  );
  r = await ask(page, 'Hitung jarak [103.55, -1.6] ke [103.65, -1.6]');
  assert.equal(r.results[0].data.job.state, 'COMPLETED');
  assert.ok(r.results[0].data.job.result.values.distanceMetres > 11000);
  flows.push('Distance operation from explicit [longitude,latitude] inputs');
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  const panel = page.locator('.gis-analysis-configuration');
  await panel
    .getByLabel('Jenis konfigurasi analisis')
    .selectOption('zonal-statistics');
  await panel
    .getByLabel('Nama konfigurasi', { exact: true })
    .fill('Zonal approved QA');
  await panel.getByLabel('AOI konfigurasi').selectOption('demo-aoi-west');
  await panel
    .getByLabel('Dataset Raster', { exact: true })
    .selectOption('demo-landcover');
  await panel
    .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
    .click();
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  r = await ask(page, 'Jalankan konfigurasi "Zonal approved QA"');
  const job = r.results[0].data.job;
  assert.equal(job.state, 'AWAITING_APPROVAL');
  assert.equal(r.changed, false);
  await screenshot(page, 'approval-desktop.png');
  const denied = await page.evaluate(async (id) => {
    const r = await fetch('/api/gis/compute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'execute', jobId: id }),
    });
    return r.status;
  }, job.id);
  assert.equal(denied, 403);
  flows.push('1600-cell job blocked before explicit approval');
  await page
    .getByRole('button', { name: 'Setujui batas & jalankan', exact: true })
    .click();
  await page
    .locator('.gis-compute-card')
    .getByText('COMPLETED', { exact: true })
    .waitFor();
  await screenshot(page, 'zonal-desktop.png');
  await page
    .locator('.gis-compute-card')
    .getByText('Nilai hasil, NoData dan provenance', { exact: true })
    .click();
  assert.match(
    await page.locator('.gis-compute-card').innerText(),
    /histogram/,
  );
  flows.push(
    'Human approval bound to snapshot; categorical native zonal statistics; result applied to workspace',
  );
  const another = await browser.newPage();
  await another.goto(`${base}/spatial/ai`);
  const inaccessible = await another.evaluate(async (id) => {
    const r = await fetch('/api/gis/compute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get', jobId: id }),
    });
    return r.status;
  }, job.id);
  assert.equal(inaccessible, 403);
  await another.close();
  flows.push('Job cannot be read from another anonymous browser session');
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  for (const [label, file] of [
    ['Ekspor resep JSON', 'computed-map.json'],
    ['Ekspor Ringkasan (PDF)', 'computed-map.pdf'],
    ['Ekspor Citra Peta (PNG)', 'computed-map.png'],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45000 }),
      page.getByRole('button', { name: label, exact: true }).click(),
    ]);
    await download.saveAs(path.join(dir, file));
    assert.ok((await readFile(path.join(dir, file))).length > 100);
  }
  const exported = JSON.parse(
    await readFile(path.join(dir, 'computed-map.json'), 'utf8'),
  );
  assert.ok(exported.analysisResults.some((result) => result.jobId === job.id));
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  flows.push(
    'Computed result retained in JSON; existing PDF and PNG downloads complete',
  );
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await screenshot(page, `zonal-${width}.png`);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      ),
      false,
    );
    if (process.env.P4I_AXE_PATH) {
      await page.addScriptTag({ path: process.env.P4I_AXE_PATH });
      const audit = await page.evaluate(
        async () =>
          await window.axe.run('.gis-copilot', {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          }),
      );
      audits.push({ width, violations: audit.violations });
      assert.equal(
        audit.violations.length,
        0,
        JSON.stringify(audit.violations),
      );
    }
  }
  flows.push('390px/768px responsive overflow and WCAG AA automated checks');
  await page.setViewportSize({ width: 1480, height: 1000 });
  r = await ask(page, 'Jalankan konfigurasi "Zonal approved QA"');
  assert.equal(r.results[0].data.job.state, 'AWAITING_APPROVAL');
  await page.getByRole('button', { name: 'Batalkan job', exact: true }).click();
  await page
    .locator('.gis-compute-card')
    .getByText('CANCELLED', { exact: true })
    .waitFor();
  await page
    .getByRole('button', {
      name: 'Coba ulang (persetujuan baru bila perlu)',
      exact: true,
    })
    .click();
  await page
    .locator('.gis-compute-card')
    .getByText('AWAITING_APPROVAL', { exact: true })
    .waitFor();
  flows.push('Cancelled approval job retries with fresh approval requirement');
  r = await ask(
    page,
    'Analisis kerawanan banjir Kecamatan X menggunakan konfigurasi yang tersedia dan tampilkan hasilnya',
  );
  assert.equal(r.status, 'unsupported');
  assert.equal(r.changed, false);
  flows.push('Unresolved real AOI refusal with no fabricated flood result');
  await ask(page, 'Buat draft konfigurasi flood "Flood QA"');
  r = await ask(page, 'Jalankan konfigurasi "Flood QA"');
  assert.equal(r.results[0].data.job.estimate.monetaryCost, 'UNKNOWN');
  await page.locator('.gis-compute-card').waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Setujui batas & jalankan', exact: true })
      .isDisabled(),
    true,
  );
  await screenshot(page, 'unknown-cost-desktop.png');
  flows.push(
    'Unavailable flood adapter displays UNKNOWN external cost and disabled approval',
  );
  assert.equal(externalComputeCalls, 0);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, 'browser-summary.json'),
    JSON.stringify({ flows, audits, errors, externalComputeCalls }, null, 2),
  );
  console.log(JSON.stringify({ flows, errors, externalComputeCalls }, null, 2));
} catch (error) {
  await writeFile(
    path.join(dir, 'failure.json'),
    JSON.stringify(
      {
        message: error.message,
        flows,
        errors,
        externalComputeCalls,
        copilot: page
          ? await page
              .locator('.gis-copilot')
              .innerText()
              .catch(() => 'unavailable')
          : 'unavailable',
      },
      null,
      2,
    ),
  );
  if (page)
    await page
      .screenshot({ path: path.join(dir, 'failure.png'), fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
