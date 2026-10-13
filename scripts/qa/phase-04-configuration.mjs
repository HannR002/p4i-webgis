import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const artifactDir = path.resolve(
  process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase-04',
);
await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.P4I_CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const base = process.env.P4I_QA_BASE_URL || 'http://localhost:3000';
const errors = [],
  audits = [];
async function capture(page, panel, name) {
  await panel.evaluate((element) =>
    element.closest('.gis-panel-content')?.scrollTo(0, 0),
  );
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true });
}
let geeCalls = 0;
try {
  const direct = await browser.newPage({
    viewport: { width: 1480, height: 1000 },
  });
  direct.on('pageerror', (e) => errors.push(e.message));
  direct.on('console', (msg) => {
    if (
      msg.type() === 'error' &&
      /hydration|didn't match|server rendered/i.test(msg.text())
    )
      errors.push(msg.text());
  });
  await Promise.all([
    direct.waitForResponse((r) => r.url().includes('/api/gis/catalog')),
    direct.goto(`${base}/spatial/analysis`),
  ]);
  await direct.getByLabel('Nama konfigurasi', { exact: true }).waitFor();
  await direct.close();
  console.log('PASS direct analysis route hydration and catalog readiness');
  const page = await browser.newPage({
    viewport: { width: 1480, height: 1000 },
    acceptDownloads: true,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes('/api/gee/')) geeCalls++;
  });
  await page.goto(`${base}/spatial/viewer?webmap=climate`);
  await page.getByText('Layer aktif (2)', { exact: true }).waitFor();
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  const panel = page.locator('.gis-analysis-configuration');
  await panel
    .getByLabel('Nama konfigurasi', { exact: true })
    .fill('AHP Scenario');
  await panel.getByLabel('Rasio konfigurasi bencanaVsKesuburan').fill('9');
  await panel
    .getByLabel('Rasio konfigurasi bencanaVsKepadatan')
    .fill(String(1 / 9));
  await panel.getByLabel('Rasio konfigurasi kesuburanVsKepadatan').fill('9');
  await panel
    .getByText(
      'konsistensi rendah; informasi, bukan blokir penyimpanan/penerapan',
      { exact: false },
    )
    .waitFor();
  await panel
    .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
    .click();
  await panel
    .getByText('Tersimpan lokal: AHP Scenario · v1', { exact: true })
    .waitFor();
  await panel
    .getByLabel('Catatan konfigurasi')
    .fill('Scenario saved without methodology review.');
  await panel
    .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
    .click();
  await panel
    .getByText('Tersimpan lokal: AHP Scenario · v2', { exact: true })
    .waitFor();
  await panel
    .getByRole('button', { name: 'Terapkan konfigurasi ke peta', exact: true })
    .click();
  await panel
    .getByText(
      'Konfigurasi diterapkan ke resep dan bobot sesi. Tidak ada hasil spasial yang dibuat.',
      { exact: true },
    )
    .waitFor();
  await panel
    .getByRole('button', { name: 'Duplikasi konfigurasi', exact: true })
    .click();
  assert.match(
    await panel.getByLabel('Nama konfigurasi', { exact: true }).inputValue(),
    /salinan/,
  );
  await panel
    .getByRole('button', { name: 'Hapus konfigurasi lokal', exact: true })
    .click();
  await panel
    .getByLabel('Konfigurasi tersimpan')
    .selectOption({ label: 'AHP Scenario · v2' });
  await panel
    .getByRole('button', { name: 'Muat konfigurasi', exact: true })
    .click();
  assert.equal(
    await panel.getByLabel('Nama konfigurasi', { exact: true }).inputValue(),
    'AHP Scenario',
  );
  await page.getByRole('tab', { name: 'Pixel', exact: true }).click();
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  assert.equal(
    await panel.getByLabel('Nama konfigurasi', { exact: true }).inputValue(),
    'AHP Scenario',
  );
  console.log(
    'PASS high-CR AHP save/apply, named revisions, duplicate/delete/load and editor persistence across tabs',
  );
  await panel.getByLabel('Jenis konfigurasi analisis').selectOption('wlc');
  await panel
    .getByLabel('Nama konfigurasi', { exact: true })
    .fill('WLC Scenario');
  await panel.getByLabel('Bobot konfigurasi Bencana').fill('20');
  await panel.getByLabel('Bobot konfigurasi Kesuburan').fill('30');
  await panel.getByLabel('Bobot konfigurasi Kepadatan').fill('50');
  for (const [key, value] of [
    ['bencana', '1'],
    ['kesuburan', '2'],
    ['kepadatan', '3'],
  ])
    await panel.getByLabel(`Skor skenario ${key}`).fill(value);
  await panel
    .getByText('Hasil skenario input: 3.1000', { exact: true })
    .waitFor();
  await panel
    .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
    .click();
  await panel
    .getByRole('button', { name: 'Terapkan konfigurasi ke peta', exact: true })
    .click();
  await panel
    .getByText(
      'Konfigurasi di resep: WLC Scenario · v1. Editor di bawah adalah draft sesi.',
      { exact: true },
    )
    .waitFor();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await panel
    .getByText(
      'Konfigurasi di resep: AHP Scenario · v2. Editor di bawah adalah draft sesi.',
      { exact: true },
    )
    .waitFor();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await panel
    .getByText(
      'Konfigurasi di resep: WLC Scenario · v1. Editor di bawah adalah draft sesi.',
      { exact: true },
    )
    .waitFor();
  await capture(page, panel, 'wlc-desktop.png');
  const configDownload = page.waitForEvent('download');
  await panel
    .getByRole('button', { name: 'Ekspor konfigurasi JSON', exact: true })
    .click();
  const configFile = path.join(artifactDir, 'analysis-configuration.json');
  await (await configDownload).saveAs(configFile);
  await panel
    .getByLabel('Impor konfigurasi JSON', { exact: true })
    .setInputFiles(configFile);
  assert.equal(
    await panel.getByLabel('Nama konfigurasi', { exact: true }).inputValue(),
    'WLC Scenario',
  );
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  for (const [label, file] of [
    ['Ekspor resep JSON', 'map-recipe.json'],
    ['Ekspor Ringkasan (PDF)', 'analysis-report.pdf'],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45000 }),
      page.getByRole('button', { name: label, exact: true }).click(),
    ]);
    await download.saveAs(path.join(artifactDir, file));
  }
  const recipe = JSON.parse(
    await readFile(path.join(artifactDir, 'map-recipe.json'), 'utf8'),
  );
  assert.equal(recipe.analysisConfiguration.name, 'WLC Scenario');
  assert.equal(recipe.analysis.weightMethod, 'manual-wlc');
  assert.deepEqual(recipe.analysis.weights, {
    bencana: 0.2,
    kesuburan: 0.3,
    kepadatan: 0.5,
  });
  await page.reload();
  await page.getByText('Layer aktif (2)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Buka', exact: true }).click();
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  await panel
    .getByLabel('Konfigurasi tersimpan')
    .selectOption({ label: 'WLC Scenario · v1' });
  await panel
    .getByRole('button', { name: 'Muat konfigurasi', exact: true })
    .click();
  assert.equal(
    await panel.getByLabel('Bobot konfigurasi Bencana').inputValue(),
    '20',
  );
  await panel.getByLabel('Bobot konfigurasi Bencana').fill('100');
  assert.equal(
    await panel
      .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
      .isDisabled(),
    true,
  );
  await panel
    .getByRole('button', { name: 'Reset bobot konfigurasi', exact: true })
    .click();
  assert.equal(
    await panel
      .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
      .isDisabled(),
    false,
  );
  console.log(
    'PASS WLC weights/scenario, invalid total/reset, recipe undo/redo, config JSON import/export, real PDF download and reload persistence',
  );
  await panel
    .getByLabel('Jenis konfigurasi analisis')
    .selectOption('raster-reclassification');
  await panel
    .getByRole('button', { name: 'Jalankan konfigurasi lokal', exact: true })
    .click();
  await panel
    .getByRole('heading', { name: 'Hasil konfigurasi · DEMO', exact: true })
    .waitFor();
  const rules = await panel
    .getByLabel('Aturan klasifikasi konfigurasi JSON')
    .inputValue();
  await panel.getByLabel('Aturan klasifikasi konfigurasi JSON').fill('{broken');
  assert.equal(
    await panel
      .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
      .isDisabled(),
    true,
  );
  await panel.getByLabel('Aturan klasifikasi konfigurasi JSON').fill(rules);
  await panel
    .getByLabel('Jenis konfigurasi analisis')
    .selectOption('zonal-statistics');
  await panel.getByLabel('AOI konfigurasi').selectOption('demo-aoi-west');
  await panel
    .getByRole('button', { name: 'Jalankan konfigurasi lokal', exact: true })
    .click();
  await panel.getByText('Sel valid 7 · NoData 1', { exact: true }).waitFor();
  await capture(page, panel, 'zonal-desktop.png');
  await panel
    .getByLabel('Dataset Raster', { exact: true })
    .selectOption('demo-landcover');
  await panel
    .getByRole('button', { name: 'Jalankan konfigurasi lokal', exact: true })
    .click();
  await panel
    .getByText('Histogram kode kelas; mean tidak dihitung', { exact: true })
    .waitFor();
  console.log(
    'PASS real local provider reclassification, malformed rules refusal, native zonal statistics/NoData and categorical histogram',
  );
  // Editing while an analysis is pending must cancel its result and recipe mutation.
  let enteredResolve;
  const entered = new Promise((resolve) => {
    enteredResolve = resolve;
  });
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/gis/process', async (route) => {
    enteredResolve();
    await delayed;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'unavailable',
          reason: 'Delayed fixture',
        }),
      })
      .catch(() => {});
  });
  await panel
    .getByRole('button', { name: 'Jalankan konfigurasi lokal', exact: true })
    .click();
  await entered;
  await panel
    .getByLabel('Nama konfigurasi', { exact: true })
    .fill('Changed pending');
  release();
  await page.unroute('**/api/gis/process');
  assert.equal(
    await panel
      .getByRole('button', { name: 'Jalankan konfigurasi lokal', exact: true })
      .isDisabled(),
    false,
  );
  assert.equal(
    await panel
      .getByRole('heading', { name: 'Hasil konfigurasi · DEMO', exact: true })
      .count(),
    0,
  );
  console.log('PASS pending analysis cancellation on draft edit');
  await panel
    .getByLabel('Jenis konfigurasi analisis')
    .selectOption('flood-susceptibility');
  await panel
    .getByLabel('Nama konfigurasi', { exact: true })
    .fill('Flood Experimental');
  await panel
    .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
    .click();
  await panel
    .getByText('Tersimpan lokal: Flood Experimental · v1', { exact: true })
    .waitFor();
  await panel
    .getByRole('button', { name: 'Tinjau kesiapan konfigurasi', exact: true })
    .click();
  await panel
    .getByText(
      'Konfigurasi flood eksperimental tersimpan; adapter pemilihan dataset/mapping GEE belum tersedia. Tidak ada komputasi dijalankan.',
      { exact: true },
    )
    .waitFor();
  await capture(page, panel, 'flood-desktop.png');
  await page.reload();
  await page.getByText('Layer aktif (2)', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  await panel
    .getByLabel('Konfigurasi tersimpan')
    .selectOption({ label: 'Flood Experimental · v1' });
  await panel
    .getByRole('button', { name: 'Muat konfigurasi', exact: true })
    .click();
  assert.equal(
    await panel.getByLabel('Dataset Curah hujan').inputValue(),
    'demo-rainfall',
  );
  assert.equal(await panel.getByRole('alert').count(), 0);
  assert.equal(
    await panel
      .getByLabel('Jenis konfigurasi analisis')
      .locator('option[value="buffer"]')
      .count(),
    0,
  );
  assert.equal(geeCalls, 0);
  console.log(
    'PASS experimental flood metadata/mappings saved without methodology approval or GEE calls; unsupported engines hidden',
  );
  const axe = await readFile(process.env.P4I_AXE_SCRIPT, 'utf8');
  for (const width of [1480, 390]) {
    const qa = await browser.newPage({ viewport: { width, height: 1000 } });
    qa.on('pageerror', (e) => errors.push(e.message));
    await qa.goto(`${base}/spatial/viewer?webmap=climate`);
    await qa.getByText('Layer aktif (2)', { exact: true }).waitFor();
    await qa.getByRole('tab', { name: 'Analisis', exact: true }).click();
    const config = qa.locator('.gis-analysis-configuration');
    for (const type of [
      'ahp-smce',
      'wlc',
      'flood-susceptibility',
      'zonal-statistics',
    ]) {
      await config.getByLabel('Jenis konfigurasi analisis').selectOption(type);
      await qa.addScriptTag({ content: axe });
      const violations = await qa.evaluate(async () => {
        const r = await window.axe.run(document.querySelector('.gis-shell'), {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        });
        return r.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        }));
      });
      audits.push({ width, type, violations });
      assert.deepEqual(violations, []);
      assert.equal(
        await qa.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (
        width === 390 &&
        ['flood-susceptibility', 'zonal-statistics'].includes(type)
      )
        await capture(qa, config, `${type}-390.png`);
    }
    await qa.close();
  }
  const broken = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await broken.goto(base);
  await broken.evaluate(() =>
    localStorage.setItem('p4i-analysis-configurations-v1', '{corrupt'),
  );
  await broken.goto(`${base}/spatial/viewer?webmap=climate`);
  await broken.getByText('Layer aktif (2)', { exact: true }).waitFor();
  await broken.getByRole('tab', { name: 'Analisis', exact: true }).click();
  await broken
    .getByText('Penyimpanan konfigurasi rusak; data tidak ditimpa', {
      exact: true,
    })
    .waitFor();
  await broken
    .locator('.gis-analysis-configuration')
    .getByRole('button', { name: 'Simpan konfigurasi', exact: true })
    .click();
  assert.equal(
    await broken.evaluate(() =>
      localStorage.getItem('p4i-analysis-configurations-v1'),
    ),
    '{corrupt',
  );
  await broken.close();
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(artifactDir, 'browser-summary.json'),
    JSON.stringify({ pageErrors: errors, geeCalls, audits }, null, 2),
  );
  console.log(
    'PASS eight desktop/mobile Axe audits, no overflow/page errors, corrupt-storage preservation',
  );
} finally {
  await browser.close();
}
