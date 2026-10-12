import path from 'node:path';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const artifactDir = path.resolve(
  process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase-02',
);
await mkdir(artifactDir, { recursive: true });
const chromiumPath = process.env.P4I_CHROMIUM || '/usr/bin/chromium';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--no-sandbox'],
});
const allErrors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1480, height: 960 },
    acceptDownloads: true,
    timezoneId: 'Asia/Jakarta',
  });
  page.on('pageerror', (e) => allErrors.push(e.message));
  await page.goto('http://localhost:3000/spatial/home');
  await page.getByLabel('Cari peta tematik').fill('curah hujan');
  await page.getByRole('button', { name: 'Cari peta', exact: true }).click();
  await page.getByLabel('Cari webmap').waitFor();
  assert.equal(
    await page.getByLabel('Cari webmap').inputValue(),
    'curah hujan',
  );
  await page.waitForFunction(
    () => document.querySelectorAll('.gis-webmap').length === 1,
  );
  await page.getByRole('button', { name: 'Reset filter', exact: true }).click();
  assert.equal(await page.locator('.gis-webmap').count(), 6);
  await page.getByLabel('Kategori peta').selectOption('Topografi');
  assert.equal(await page.locator('.gis-webmap').count(), 1);
  await page
    .getByRole('link', { name: 'Lihat Peta Kemiringan Lereng', exact: true })
    .click();
  await page.getByText('Layer aktif (2)', { exact: true }).waitFor();
  await page.getByLabel('Basemap', { exact: true }).selectOption('none');
  await page.getByLabel('Judul peta').fill('Kajian P4I QA');
  await page.getByLabel('Deskripsi peta').focus();
  await page
    .getByRole('heading', { name: 'Kajian P4I QA', exact: true })
    .waitFor();
  await page.getByLabel('Deskripsi peta').fill('Tujuan kajian lokal');
  await page.getByLabel('Basemap', { exact: true }).focus();
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await page.getByLabel('Deskripsi peta').fill('');
  await page.getByLabel('Basemap', { exact: true }).focus();
  await page.getByRole('button', { name: 'Buka', exact: true }).click();
  assert.equal(
    await page.getByLabel('Deskripsi peta').inputValue(),
    'Tujuan kajian lokal',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await page.getByLabel('Deskripsi peta').inputValue(), '');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal(
    await page.getByLabel('Deskripsi peta').inputValue(),
    'Tujuan kajian lokal',
  );
  console.log(
    'PASS home search, category filters, genuine View Map action, editable title/description, local save/load and undo/redo',
  );
  await page.getByRole('button', { name: 'Hapus Kemiringan lereng' }).click();
  await page.getByRole('button', { name: '+ Curah hujan tahunan' }).click();
  await page.getByLabel('Opacity Curah hujan tahunan').fill('0.35');
  await page.getByLabel('Tampilkan Curah hujan tahunan').uncheck();
  await page.getByLabel('Tampilkan Curah hujan tahunan').check();
  await page
    .getByRole('button', { name: 'Naikkan Curah hujan tahunan' })
    .isDisabled();
  await page.getByLabel('Pilih area kajian').selectOption('demo-aoi-west');
  const widthBefore = await page
    .locator('.leaflet-container')
    .evaluate((e) => e.clientWidth);
  await page
    .getByRole('button', { name: 'Tampilkan atau sembunyikan panel' })
    .click();
  await page.waitForFunction(
    (w) => document.querySelector('.leaflet-container').clientWidth > w,
    widthBefore,
  );
  await page
    .getByRole('button', { name: 'Tampilkan atau sembunyikan panel' })
    .click();
  await page.getByRole('tab', { name: 'Layer', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page
      .getByRole('tab', { name: 'Pixel', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  assert.equal(
    await page
      .getByRole('tab', { name: 'Pixel', exact: true })
      .evaluate((e) => document.activeElement === e),
    true,
  );
  await page
    .getByRole('button', { name: 'Inspeksi titik pusat', exact: true })
    .click();
  await page.locator('.gis-pixel-card').waitFor();
  assert.match(
    await page.locator('.gis-pixel-value').textContent(),
    /mm\/tahun/,
  );
  await page.screenshot({
    path: path.join(artifactDir, 'pixel-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Pixel', exact: true }).focus();
  await page.keyboard.press('End');
  assert.equal(
    await page
      .getByRole('tab', { name: 'Analisis', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  await page.getByRole('button', { name: 'Simpan bobot AHP ke resep' }).click();
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  await page.getByLabel('Instruksi GIS').fill('Tambahkan tutupan lahan');
  await page.getByRole('button', { name: 'Kirim instruksi' }).click();
  await page.getByRole('button', { name: 'Terapkan ke sesi peta' }).waitFor();
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  await page.getByRole('button', { name: 'Terapkan ke sesi peta' }).waitFor();
  await page.getByRole('button', { name: 'Terapkan ke sesi peta' }).click();
  await page
    .getByText('AI-generated map configuration', { exact: true })
    .waitFor();
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  await page.getByText('Layer aktif (3)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByText('Layer aktif (2)', { exact: true }).waitFor();
  console.log(
    'PASS layer controls, AOI, resize after panel collapse, roving tabs, keyboard pixel sampling, AHP, Copilot state retained between panels/apply/undo',
  );
  await page.locator('.gis-map-legend summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('.gis-map-legend').getAttribute('open'),
    null,
  );
  await page.keyboard.press('Enter');
  const invalid = {
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":999}'),
  };
  await page.locator('input[type=file]').setInputFiles(invalid);
  await page.getByText('MapRecipe tidak valid', { exact: true }).waitFor();
  for (const [label, name] of [
    ['Ekspor resep JSON', 'map-recipe.json'],
    ['Ekspor Citra Peta (PNG)', 'map-export.png'],
    ['Ekspor Ringkasan (PDF)', 'map-report.pdf'],
  ]) {
    const downloaded = page.waitForEvent('download', { timeout: 45000 });
    await page.getByRole('button', { name: label, exact: true }).click();
    await (await downloaded).saveAs(path.join(artifactDir, name));
  }
  const recipe = JSON.parse(
    await readFile(path.join(artifactDir, 'map-recipe.json'), 'utf8'),
  );
  assert.equal(recipe.title, 'Kajian P4I QA');
  assert.ok(recipe.analysis);
  console.log(
    'PASS keyboard legend collapse, invalid import unchanged, real browser JSON/PNG/PDF downloads with saved AHP',
  );
  await page.goto('http://localhost:3000/spatial/data');
  await page.getByText('5 dataset ditemukan', { exact: true }).waitFor();
  await page.getByLabel('Jenis dataset').selectOption('raster');
  assert.equal(await page.locator('.gis-dataset-card').count(), 4);
  await page.getByLabel('Status data').selectOption('available');
  await page
    .getByRole('heading', { name: 'Tidak ada hasil yang cocok' })
    .waitFor();
  await page
    .getByRole('button', { name: 'Reset filter', exact: true })
    .last()
    .click();
  assert.equal(await page.locator('.gis-dataset-card').count(), 5);
  await page.goto('http://localhost:3000/spatial/help');
  await page.getByLabel('Cari panduan').fill('AHP');
  const summary = page.locator('.gis-help-list summary').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await summary.evaluate((e) => e.parentElement.open), true);
  console.log(
    'PASS dataset type/status/empty/reset states and keyboard documentation accordion',
  );
  await page.goto('http://localhost:3000/spatial/viewer?webmap=missing');
  await page
    .getByText('Peta atau dataset tidak ditemukan.', { exact: false })
    .waitFor();
  console.log('PASS invalid selected Webmap gives a recovery link');
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1480, 960],
  ]) {
    const mobile = await browser.newPage({ viewport: { width, height } });
    mobile.on('pageerror', (e) => allErrors.push(e.message));
    for (const route of ['home', 'webmap', 'data', 'help', 'viewer']) {
      await mobile.goto('http://localhost:3000/spatial/' + route);
      await mobile.getByRole('heading', { level: 1 }).waitFor();
      assert.equal(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${width} ${route} overflow`,
      );
    }
    await mobile.getByLabel('Basemap', { exact: true }).selectOption('none');
    await mobile.locator('.leaflet-control-zoom').waitFor();
    await mobile.locator('.gis-map-legend summary').waitFor();
    const controls = await mobile.evaluate(() => {
      const rect = (s) => {
        const e = document.querySelector(s);
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const overlaps = (a, b) =>
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top;
      return {
        toolbarLegend: overlaps(
          rect('.gis-map-toolbar'),
          rect('.gis-map-legend'),
        ),
        toolbarLabel: overlaps(
          rect('.gis-map-toolbar'),
          rect('.gis-map-label'),
        ),
        zoomLabel: overlaps(
          rect('.leaflet-control-zoom'),
          rect('.gis-map-label'),
        ),
      };
    });
    assert.deepEqual(controls, {
      toolbarLegend: false,
      toolbarLabel: false,
      zoomLabel: false,
    });
    const bounds = await mobile.evaluate(() => ({
      panel: document
        .querySelector('.gis-workspace-panel')
        .getBoundingClientRect().bottom,
      footer: document
        .querySelector('.gis-workspace-footer')
        .getBoundingClientRect().top,
      content: document
        .querySelector('.gis-panel-content')
        .getBoundingClientRect().bottom,
    }));
    assert.ok(
      bounds.panel <= bounds.footer + 1 && bounds.content <= bounds.footer + 1,
      'Panel scroll must not overlap the footer',
    );
    if (width <= 800) {
      const menu = mobile.getByRole('button', { name: 'Buka navigasi' });
      await menu.focus();
      await mobile.keyboard.press('Enter');
      const nav = mobile.getByRole('dialog', { name: 'Navigasi portal' });
      await nav.waitFor();
      for (let n = 0; n < 18; n++) {
        await mobile.keyboard.press('Tab');
        assert.equal(
          await nav.evaluate((e) => e.contains(document.activeElement)),
          true,
        );
      }
      await mobile.keyboard.press('Escape');
      await nav.waitFor({ state: 'hidden' });
      assert.equal(
        await menu.evaluate((e) => document.activeElement === e),
        true,
      );
      await menu.click();
      await nav
        .getByRole('link', { name: 'Pusat bantuan', exact: true })
        .click();
      await nav.waitFor({ state: 'hidden' });
      await mobile.goto('http://localhost:3000/spatial/viewer');
      await mobile.getByLabel('Basemap', { exact: true }).selectOption('none');
    }
    await mobile.locator('.leaflet-control-zoom').waitFor();
    await mobile.waitForFunction(() =>
      [...document.images].some(
        (image) =>
          image.src.includes('/api/gis/tiles/') &&
          image.classList.contains('leaflet-tile-loaded'),
      ),
    );
    await mobile.screenshot({
      path: path.join(artifactDir, `workspace-${width}.png`),
      fullPage: true,
    });
    await mobile.close();
    console.log(
      'PASS responsive layout/overlay separation/navigation focus at',
      width,
      height,
    );
  }
  const retry = await browser.newPage();
  let unavailable = true;
  await retry.route('**/api/gis/catalog', (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        })
      : route.continue(),
  );
  await retry.goto('http://localhost:3000/spatial/data');
  await retry
    .getByText('Katalog tidak dapat dimuat.', { exact: true })
    .waitFor();
  unavailable = false;
  await retry.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await retry.getByText('5 dataset ditemukan', { exact: true }).waitFor();
  await retry.close();
  console.log('PASS catalog failure retry recovers without reloading');
  assert.deepEqual(allErrors, []);
  await writeFile(
    path.join(artifactDir, 'flows.json'),
    JSON.stringify(
      {
        pageErrors: allErrors,
        viewports: [320, 390, 768, 1024, 1480],
        result: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
