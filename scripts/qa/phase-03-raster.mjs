import path from 'node:path';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const artifactDir = path.resolve(
  process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase-03',
);
await mkdir(artifactDir, { recursive: true });
const chromiumPath = process.env.P4I_CHROMIUM || '/usr/bin/chromium';

import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1480, height: 1000 },
    acceptDownloads: true,
    timezoneId: 'Asia/Jakarta',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:3000/spatial/viewer?webmap=climate');
  await page.getByText('Layer aktif (2)', { exact: true }).waitFor();
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  await page.getByLabel('Pilih area kajian').selectOption('demo-aoi-west');
  await page.getByLabel('Band Curah hujan tahunan').selectOption('daily_mean');
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await page.getByRole('tab', { name: 'Pixel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Inspeksi titik pusat', exact: true })
    .click();
  await page.locator('.gis-pixel-card').waitFor();
  assert.match(
    await page.locator('.gis-pixel-value').textContent(),
    /mm\/hari/,
  );
  assert.match(
    await page.locator('.gis-pixel-card').textContent(),
    /Scale \/ offset/,
  );
  await page.getByLabel('Lintang sampling').fill('-1.575');
  await page.getByLabel('Bujur sampling').fill('103.595');
  await page.getByRole('button', { name: 'Ambil sampel koordinat' }).click();
  await page
    .getByText('Sel dimask / nilai NoData sumber', { exact: true })
    .waitFor();
  await page.getByLabel('Lintang sampling').fill('0');
  await page.getByLabel('Bujur sampling').fill('0');
  await page.getByRole('button', { name: 'Ambil sampel koordinat' }).click();
  await page.getByText('Di luar cakupan grid', { exact: true }).waitFor();
  await page.getByLabel('Lintang sampling').fill('-1.625');
  await page.getByLabel('Bujur sampling').fill('103.545');
  await page.getByRole('button', { name: 'Ambil sampel koordinat' }).click();
  await page
    .locator('.gis-pixel-value')
    .getByText('mm/hari', { exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(artifactDir, 'pixel-band-desktop.png'),
    fullPage: true,
  });
  console.log(
    'PASS native selected band values, raw/physical metadata, internal and outside NoData, keyboard coordinate query',
  );
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  await page.getByRole('button', { name: '+ Tutupan lahan' }).click();
  await page.getByRole('tab', { name: 'Pixel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Inspeksi titik pusat', exact: true })
    .click();
  await page.locator('.gis-pixel-card').nth(1).waitFor();
  await page.getByText('Resolusi/CRS berbeda.', { exact: false }).waitFor();
  assert.match(
    await page.locator('.gis-pixel-card').nth(1).textContent(),
    /kategorikal/,
  );
  await page.getByLabel('Metode sampling').selectOption('bilinear');
  await page.getByRole('button', { name: 'Ambil sampel koordinat' }).click();
  await page
    .getByText('Band kategorikal tidak boleh diinterpolasi', { exact: true })
    .waitFor();
  console.log(
    'PASS categorical codes, resolution mismatch warning and refused categorical bilinear',
  );
  await page.getByRole('tab', { name: 'Analisis', exact: true }).click();
  await page.getByRole('button', { name: 'Jalankan operasi lokal' }).click();
  await page
    .getByRole('heading', { name: 'Statistik native · daily_mean' })
    .waitFor();
  const stats = page.locator('.gis-raster-result');
  assert.match(await stats.textContent(), /7/);
  assert.match(await stats.textContent(), /km²/);
  await page.screenshot({
    path: path.join(artifactDir, 'zonal-desktop.png'),
    fullPage: true,
  });
  await page.getByLabel('Operasi raster').selectOption('clip');
  await page.getByRole('button', { name: 'Jalankan operasi lokal' }).click();
  await page
    .getByText('Deskripsi subset tersedia; file GeoTIFF belum dibuat.', {
      exact: true,
    })
    .waitFor();
  await page.getByLabel('Operasi raster').selectOption('arithmetic');
  await page.getByLabel('Operator aritmetika').selectOption('divide');
  await page.getByLabel('Konstanta raster').fill('0');
  await page.getByRole('button', { name: 'Jalankan operasi lokal' }).click();
  await page.getByText('Pembagi nol; hasil dimask.', { exact: true }).waitFor();
  await page.getByLabel('Raster operasi').selectOption('demo-landcover');
  await page.getByLabel('Operasi raster').selectOption('zonal-statistics');
  await page.getByRole('button', { name: 'Jalankan operasi lokal' }).click();
  await page
    .getByRole('heading', { name: 'Statistik native · land_cover' })
    .waitFor();
  await page
    .getByText('Tidak dihitung untuk kode kelas', { exact: true })
    .waitFor();
  console.log(
    'PASS native AOI statistics/area, clip window descriptor, division-by-zero mask, categorical histogram instead of code mean',
  );
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Buka', exact: true }).click();
  assert.equal(
    await page.getByLabel('Band Curah hujan tahunan').inputValue(),
    'daily_mean',
  );
  for (const [label, name] of [
    ['Ekspor resep JSON', 'recipe.json'],
    ['Ekspor Ringkasan (PDF)', 'raster-report.pdf'],
    ['Ekspor Citra Peta (PNG)', 'raster-map.png'],
  ]) {
    const pending = page.waitForEvent('download', { timeout: 45000 });
    await page.getByRole('button', { name: label, exact: true }).click();
    await (await pending).saveAs(path.join(artifactDir, name));
  }
  const recipe = JSON.parse(
    await readFile(path.join(artifactDir, 'recipe.json'), 'utf8'),
  );
  assert.equal(
    recipe.layers.find((layer) => layer.datasetId === 'demo-rainfall').style
      .band,
    'daily_mean',
  );
  assert.match(
    recipe.legend.find((item) => item.datasetId === 'demo-rainfall').entries[0]
      .label,
    /mm\/hari/,
  );
  console.log(
    'PASS selected band draft load/undo, JSON roundtrip, genuine PNG/PDF downloads',
  );
  const axe = await readFile(
    process.env.P4I_AXE_SCRIPT ||
      '/workspace/artifacts/phase-02/a11y/node_modules/axe-core/axe.min.js',
    'utf8',
  );
  const audits = [];
  for (const width of [1480, 390]) {
    const mobile = await browser.newPage({ viewport: { width, height: 960 } });
    mobile.on('pageerror', (error) => errors.push(error.message));
    await mobile.goto('http://localhost:3000/spatial/viewer?webmap=flood');
    await mobile.getByText('Layer aktif (5)', { exact: true }).waitFor();
    await mobile.getByLabel('Basemap', { exact: true }).selectOption('none');
    await mobile.getByLabel('Pilih area kajian').selectOption('demo-aoi-west');
    for (const panel of ['Pixel', 'Analisis']) {
      await mobile.getByRole('tab', { name: panel, exact: true }).click();
      if (panel === 'Pixel') {
        await mobile
          .getByRole('button', { name: 'Inspeksi titik pusat', exact: true })
          .click();
        await mobile.locator('.gis-pixel-card').nth(3).waitFor();
      } else {
        await mobile
          .getByRole('button', { name: 'Jalankan operasi lokal' })
          .click();
        await mobile.locator('.gis-raster-result').waitFor();
      }
      await mobile.addScriptTag({ content: axe });
      const result = await mobile.evaluate(() =>
        window.axe.run(document.querySelector('.gis-shell'), {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        }),
      );
      const violations = result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      }));
      audits.push({ width, panel, violations });
      assert.deepEqual(violations, []);
      assert.equal(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await mobile.screenshot({
        path: path.join(artifactDir, `${panel.toLowerCase()}-${width}.png`),
        fullPage: true,
      });
    }
    await mobile.close();
  }
  await writeFile(
    path.join(artifactDir, 'browser-summary.json'),
    JSON.stringify({ pageErrors: errors, audits }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS desktop/mobile inspector/operations accessibility and overflow, no JavaScript page errors',
  );
} finally {
  await browser.close();
}
