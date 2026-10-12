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
await mkdir(path.resolve('public/gis/previews'), { recursive: true });
const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1480, height: 920 },
  });
  for (const id of [
    'administration',
    'flood',
    'landcover',
    'terrain',
    'climate',
    'suitability',
  ]) {
    await page.goto(`http://localhost:3000/spatial/viewer?webmap=${id}`);
    await page.getByLabel('Basemap', { exact: true }).selectOption('none');
    await page
      .locator('.leaflet-workspace-layer-demo-boundaries-pane canvas')
      .waitFor();
    if (id !== 'administration')
      await page.waitForFunction(() =>
        [...document.images].some(
          (i) =>
            i.src.includes('/api/gis/tiles/') &&
            i.classList.contains('leaflet-tile-loaded'),
        ),
      );
    await page
      .locator('.gis-map-area')
      .screenshot({ path: path.resolve('public/gis/previews', `${id}.png`) });
    console.log('Captured actual workspace preview:', id);
  }
} finally {
  await browser.close();
}
