import assert from 'node:assert/strict';
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
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: chromiumPath,
  args: ['--no-sandbox'],
});
try {
  const axe = await readFile(
    process.env.P4I_AXE_SCRIPT ||
      path.join(artifactDir, 'a11y/node_modules/axe-core/axe.min.js'),
    'utf8',
  );
  const all = [];
  for (const width of [1480, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    for (const route of [
      'home',
      'webmap',
      'data',
      'help',
      'viewer',
      'ai',
      'analysis',
    ]) {
      await page.goto('http://localhost:3000/spatial/' + route);
      await page.getByRole('heading', { level: 1 }).waitFor();
      if (route !== 'help')
        await page.waitForFunction(
          () => !document.querySelector('[aria-busy=true]'),
        );
      if (['viewer', 'ai', 'analysis'].includes(route)) {
        await page.locator('.leaflet-container').waitFor();
        await page.getByRole('tab', { name: 'Layer', exact: true }).click();
        await page.getByLabel('Basemap', { exact: true }).selectOption('none');
        if (route === 'ai')
          await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
        if (route === 'analysis')
          await page
            .getByRole('tab', { name: 'Analisis', exact: true })
            .click();
      }
      await page.addScriptTag({ content: axe });
      const result = await page.evaluate(() =>
        window.axe.run(document.querySelector('.gis-shell'), {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
          },
        }),
      );
      const violations = result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      }));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, `${width} ${route} overflow`);
      assert.deepEqual(violations, [], `${width} ${route} accessibility`);
      all.push({ width, path: route, overflow, violations });
      console.log(
        width,
        route,
        'overflow',
        overflow,
        JSON.stringify(violations),
      );
      if (width === 1480)
        await page.screenshot({
          path: path.join(artifactDir, `${route}-desktop.png`),
          fullPage: true,
        });
    }
    await page.close();
  }
  await writeFile(
    path.join(artifactDir, 'accessibility.json'),
    JSON.stringify(all, null, 2),
  );
} finally {
  await browser.close();
}
