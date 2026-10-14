import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const dir = path.resolve(process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase-07');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.P4I_CHROMIUM || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const base = process.env.P4I_QA_BASE_URL || 'http://localhost:3000',
  errors = [],
  flows = [],
  audits = [];
let geeCalls = 0;
async function persona(page, value) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/consulting') && r.request().method() === 'POST',
  );
  await page.getByLabel('Peran simulasi', { exact: true }).selectOption(value);
  assert.equal((await response).status(), 200);
  await page.waitForFunction((value) => {
    const control = document.querySelector(
      'select[aria-label="Peran simulasi"]',
    );
    return control?.value === value && !control.disabled;
  }, value);
}
async function open(page) {
  await page.getByRole('button', { name: /Phase07 report/ }).click();
  await page.getByRole('heading', { name: /Preview laporan/ }).waitFor();
}
async function capture(page, name) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: path.join(dir, name), fullPage: true });
}
async function state(page, name) {
  await page.getByRole('status').filter({ hasText: name }).first().waitFor();
}
try {
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
  await page.getByRole('tab', { name: 'AI GIS', exact: true }).click();
  let pending = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/gis/copilot') && r.request().method() === 'POST',
  );
  await page
    .getByLabel('Instruksi GIS', { exact: true })
    .fill('Hitung luas area contoh Barat');
  await page
    .getByRole('button', { name: 'Kirim instruksi', exact: true })
    .click();
  const computed = await (await pending).json();
  assert.equal(computed.results[0].data.job.state, 'COMPLETED');
  const jobId = computed.results[0].data.job.id;
  await page.getByRole('tab', { name: 'Layer', exact: true }).click();
  await page
    .getByRole('link', {
      name: 'Siapkan deliverable dari peta sesi',
      exact: true,
    })
    .click();
  await page.getByLabel('Peran simulasi', { exact: true }).waitFor();
  await page
    .getByLabel('Judul laporan', { exact: true })
    .fill('Phase07 report');
  await page
    .getByLabel('Catatan analis (internal)', { exact: true })
    .fill('INTERNAL-QA-ANALYST-NOTE');
  await page
    .getByRole('button', {
      name: 'Siapkan draft dengan Copilot DEMO',
      exact: true,
    })
    .click();
  await state(page, 'Draft Copilot DEMO disiapkan');
  await page.getByRole('button', { name: 'Simpan draft', exact: true }).click();
  await state(page, 'DRAFT');
  await page.getByLabel('Job komputasi Phase 06', { exact: true }).fill(jobId);
  await page
    .getByRole('button', {
      name: 'Lampirkan/perbarui job terotorisasi',
      exact: true,
    })
    .click();
  await state(page, 'revisi 2');
  await capture(page, 'analyst-desktop.png');
  flows.push(
    'Existing map → Copilot draft → isolated project report; owned real compute result attached',
  );
  await page
    .getByRole('button', { name: 'Kirim untuk review', exact: true })
    .click();
  await state(page, 'READY_FOR_REVIEW');
  await persona(page, 'client-a');
  assert.equal(
    await page.getByRole('button', { name: /Phase07 report/ }).count(),
    0,
  );
  flows.push('Entitled client cannot see unpublished draft');
  await persona(page, 'reviewer');
  await open(page);
  await page
    .getByLabel('Komentar reviewer', { exact: true })
    .fill('Tinjau interpretasi ringkasan dan perjelas asumsi.');
  await page.getByRole('button', { name: 'Minta revisi', exact: true }).click();
  await state(page, 'CHANGES_REQUESTED');
  await persona(page, 'analyst');
  await open(page);
  await page
    .getByLabel('Asumsi analisis', { exact: true })
    .fill(
      'Data fixture sintetik; area dihitung pada geometri DEMO dengan pendekatan bola.',
    );
  await page
    .getByRole('button', { name: 'Simpan revisi baru', exact: true })
    .click();
  await state(page, 'revisi 3');
  await page
    .getByRole('button', { name: 'Kirim untuk review', exact: true })
    .click();
  await state(page, 'READY_FOR_REVIEW');
  await persona(page, 'reviewer');
  await open(page);
  assert.equal(
    await page
      .getByRole('button', { name: 'Setujui revisi untuk rilis', exact: true })
      .isDisabled(),
    true,
  );
  for (const label of [
    'Kelengkapan laporan',
    'Interpretasi sesuai tujuan',
    'Sumber dan isi diizinkan untuk rilis',
    'Kualitas profesional memadai',
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page
    .getByLabel('Komentar reviewer', { exact: true })
    .fill(
      'Isi DEMO lengkap dan interpretasi sesuai tujuan simulasi. Bukan validasi metodologi ilmiah.',
    );
  await capture(page, 'review-desktop.png');
  await page
    .getByRole('button', { name: 'Setujui revisi untuk rilis', exact: true })
    .click();
  await state(page, 'APPROVED');
  flows.push(
    'Request changes, new immutable revision, resubmission and explicit four-check human review',
  );
  await persona(page, 'admin');
  assert.equal(
    await page.getByRole('button', { name: /Phase07 report/ }).count(),
    0,
  );
  assert.match(
    await page.locator('.consulting-page').innerText(),
    /admin tidak otomatis/,
  );
  flows.push('Admin persona receives no implicit reviewer or publisher grant');
  await persona(page, 'publisher');
  await open(page);
  await capture(page, 'release-desktop.png');
  await page
    .getByRole('button', {
      name: 'Simulasikan rilis ke klien DEMO',
      exact: true,
    })
    .click();
  await state(page, 'PUBLISHED');
  await persona(page, 'client-a');
  await open(page);
  assert.equal(
    await page.getByLabel('Catatan analis (internal)', { exact: true }).count(),
    0,
  );
  assert.ok(
    !(await page.locator('.consulting-page').innerText()).includes(
      'INTERNAL-QA-ANALYST-NOTE',
    ),
  );
  for (const [label, file] of [
    ['Unduh laporan PDF', 'client-report.pdf'],
    ['Unduh bukti JSON', 'client-evidence.json'],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: label, exact: true }).click(),
    ]);
    await download.saveAs(path.join(dir, file));
    assert.ok((await readFile(path.join(dir, file))).length > 100);
  }
  const evidence = JSON.parse(
    await readFile(path.join(dir, 'client-evidence.json'), 'utf8'),
  );
  assert.equal(evidence.document.revision.number, 3);
  assert.equal(evidence.document.revision.analysisRun.jobId, jobId);
  assert.equal(evidence.document.publication.official, false);
  assert.ok(!JSON.stringify(evidence).includes('INTERNAL-QA-ANALYST-NOTE'));
  assert.ok(evidence.document.revision.content.mapOutline.rings.length > 0);
  await capture(page, 'client-desktop.png');
  flows.push(
    'Explicit simulated release, published revision-only client DTO and actual PDF/JSON downloads; internal notes redacted',
  );
  for (const width of [1480, 390, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await capture(page, `client-${width}.png`);
    if (process.env.P4I_AXE_SCRIPT) {
      await page.addScriptTag({ path: process.env.P4I_AXE_SCRIPT });
      const result = await page.evaluate(
        async () =>
          await window.axe.run('.consulting-page', {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          }),
      );
      audits.push({ width, violations: result.violations });
      assert.equal(
        result.violations.length,
        0,
        JSON.stringify(result.violations),
      );
    }
  }
  await page.setViewportSize({ width: 1480, height: 1000 });
  await persona(page, 'analyst');
  await open(page);
  await page
    .getByLabel('Ringkasan analisis', { exact: true })
    .fill('UNPUBLISHED-REVISION-DO-NOT-LEAK');
  await page
    .getByRole('button', { name: 'Simpan revisi baru', exact: true })
    .click();
  await state(page, 'DRAFT');
  await persona(page, 'client-a');
  await open(page);
  assert.ok(
    !(await page.locator('.consulting-page').innerText()).includes(
      'UNPUBLISHED-REVISION-DO-NOT-LEAK',
    ),
  );
  await page
    .getByRole('heading', { name: 'Preview laporan · revisi 3', exact: true })
    .waitFor();
  await persona(page, 'client-b');
  assert.equal(
    await page.getByRole('button', { name: /Phase07 report/ }).count(),
    0,
  );
  flows.push(
    'New draft preserves released revision; other-client project cannot access report',
  );
  const stranger = await browser.newPage();
  await stranger.goto(`${base}/spatial/consulting`);
  await stranger.getByLabel('Peran simulasi', { exact: true }).waitFor();
  assert.equal(
    await stranger.getByRole('button', { name: /Phase07 report/ }).count(),
    0,
  );
  await stranger.close();
  flows.push(
    'Separate development session has no access to first session reports',
  );
  assert.deepEqual(errors, []);
  assert.equal(geeCalls, 0);
  await writeFile(
    path.join(dir, 'browser-summary.json'),
    JSON.stringify({ flows, audits, errors, geeCalls }, null, 2),
  );
  console.log(JSON.stringify({ flows, errors, geeCalls }, null, 2));
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page
      .screenshot({ path: path.join(dir, 'failure.png'), fullPage: true })
      .catch(() => {});
    await writeFile(
      path.join(dir, 'failure.txt'),
      await page.locator('body').innerText(),
    ).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
