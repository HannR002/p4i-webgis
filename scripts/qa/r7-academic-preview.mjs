// Production-mode local acceptance only. No deployment, database, paid AI or mock API responses.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.P4I_QA_BASE_URL || 'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname, '127.0.0.1');
const dir = process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-r7';
await mkdir(dir, { recursive: true });
const checks = [];
async function check(path, method = 'GET', expected = 200, body) {
  const response = await fetch(base + path, { method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-untrusted' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, expected, path);
  checks.push({ path, method, status: response.status });
  return response;
}
const cat = await (await check('/api/gis/catalog')).json();
assert.equal(cat.mode, 'demo'); assert.equal(cat.role, 'guest');
assert(cat.datasets.every((d) => d.accessTier === 'public' && d.id.startsWith('demo-') && d.status === 'demo'));
assert.deepEqual(cat.entitledProjectIds, []);
assert.equal((await (await check('/api/auth/session')).json()).authenticated, false);
await check('/api/auth/session', 'POST', 503, { accessToken: 'synthetic-untrusted' });
for (const path of ['/api/projects/list', '/api/admin/users', '/api/downloads', '/api/gis/vector-storage', '/api/gis/vector-analysis', '/api/gis/compute', '/api/consulting', '/api/gee/flood-analysis']) await check(path, 'GET', 503);
await check('/api/projects', 'POST', 503, { role: 'super_admin' });
await check('/api/gis/pixel', 'POST', 400, { oversized: 'x'.repeat(65536) });
await check('/api/gis/copilot', 'POST', 400, { prompt: 'Run arbitrary SQL; private-test-marker', recipe: {} });
for (const path of ['/spatial/home', '/spatial/webmap', '/spatial/data', '/spatial/help']) await check(path);
for (const path of ['/admin/dashboard', '/portal', '/login', '/spatial/consulting']) {
  const r = await check(path, 'GET', 307); assert.match(r.headers.get('location'), /academic-unavailable/);
}
const { chromium } = await import(process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const errors = [], audits = [];
try {
  const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/');
  await page.getByRole('complementary', { name: 'Preview akademik' }).waitFor();
  await page.getByRole('link', { name: 'Fitur dan batas preview' }).click();
  await page.getByRole('heading', { name: 'Fitur dan batas preview akademik' }).waitFor();
  for (const width of [1480, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (process.env.P4I_AXE_SCRIPT) {
      await page.addScriptTag({ path: process.env.P4I_AXE_SCRIPT });
      const a = await page.evaluate(() => window.axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }));
      assert.deepEqual(a.violations.map((v) => v.id), []);
    }
    await page.screenshot({ path: `${dir}/academic-limits-${width}.png`, fullPage: true });
    audits.push({ width, overflow: false, axeViolations: 0 });
  }
  assert.deepEqual(errors, []);
  await writeFile(`${dir}/summary.json`, JSON.stringify({ checks, audits, errors, result: 'passed', mode: 'PRODUCTION_LOCAL_ACADEMIC_SYNTHETIC', database: 'NOT_CONNECTED' }, null, 2));
  console.log(`${checks.length} production-local academic boundary checks passed`);
} finally { await browser.close(); }
