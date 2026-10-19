// Starts one owned Next dev process and a loopback HTTP double for Auth/REST.
// No real Supabase/PostGIS, auth credentials, migrations, provider calls or disk persistence.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
const { chromium } = await import(
  process.env.P4I_PLAYWRIGHT_MODULE || 'playwright-core'
);
const dir = path.resolve(process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-r2-upload');
await mkdir(dir, { recursive: true });
const events = [],
  errors = [],
  audits = [];
const roles = {
  analyst: 'managerial_analyst',
  admin: 'super_admin',
  client: 'b2b_client',
};
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const reply = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/auth/v1/user') {
    const actor = req.headers.authorization?.replace(
      'Bearer r2-synthetic-',
      '',
    );
    if (!Object.hasOwn(roles, actor ?? ''))
      return reply(401, { message: 'Synthetic identity denied' });
    // Deliberately misleading metadata: trusted user_profiles must govern the role.
    return reply(200, {
      id: actor,
      email: `${actor}@example.invalid`,
      user_metadata: { role: 'super_admin' },
    });
  }
  if (url.pathname === '/rest/v1/user_profiles') {
    const actor = url.searchParams.get('id')?.replace('eq.', '');
    return reply(
      200,
      Object.hasOwn(roles, actor ?? '')
        ? [{ role: roles[actor], is_disabled: false }]
        : [],
    );
  }
  if (
    req.method === 'POST' &&
    ['/rest/v1/spatial_projects', '/rest/v1/vector_layers'].includes(
      url.pathname,
    )
  ) {
    let size = 0,
      body = '';
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 400_000) {
        reply(413, {});
        return;
      }
      body += chunk;
    }
    const value = JSON.parse(body);
    events.push({ table: url.pathname, value });
    return reply(
      201,
      url.pathname.endsWith('spatial_projects')
        ? { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }
        : null,
    );
  }
  return reply(404, { error: 'Unexpected synthetic endpoint' });
});
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
const provider = `http://127.0.0.1:${fixture.address().port}`;
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const log = await open(dir + '/next.log', 'w');
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  AUTH_PROVIDER: 'supabase',
  DATABASE_PROVIDER: 'supabase',
  NEXT_PUBLIC_SUPABASE_URL: provider,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test-only',
  SUPABASE_SERVICE_ROLE_KEY: 'local-test-only',
  GIS_DEMO_MODE: 'true',
  AI_PROVIDER: 'demo',
  GEMINI_FREE_ENABLED: 'false',
  GEMINI_API_KEY: '',
  GEE_PROJECT_ID: '',
  GEE_SOIL_ASSET_ID: '',
  GEE_SERVICE_ACCOUNT_JSON: '',
  GEE_SERVICE_ACCOUNT_JSON_BASE64: '',
  VECTOR_STORAGE_MODE: 'disabled',
  VECTOR_STORAGE_LOCAL_ACK: '',
  VECTOR_STORAGE_LOCAL_URL: '',
};
delete env.P4I_VECTOR_TEST_STATE;
delete env.P4I_VECTOR_ANALYSIS;
const app = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  { env, stdio: ['ignore', log.fd, log.fd] },
);
const exited = new Promise((resolve) => app.once('exit', resolve));
let browser;
const collection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [103.61, -1.61] },
      properties: { name: 'Synthetic upload point' },
    },
  ],
};
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null)
      throw Error('Owned Next server exited; inspect next.log');
    try {
      ready = (
        await fetch(base + '/login', { signal: AbortSignal.timeout(1000) })
      ).ok;
    } catch {}
    if (ready) break;
    await delay(250);
  }
  assert(ready, 'Owned Next server did not become ready');
  browser = await chromium.launch({
    executablePath: process.env.P4I_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1480, height: 1000 },
  });
  await context.addCookies([
    { name: 'sb-access-token', value: 'r2-synthetic-analyst', url: base },
  ]);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !['localhost', '127.0.0.1'].includes(url.hostname)
    ) {
      errors.push('Unexpected external browser request');
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base + '/admin/upload');
  await page.getByRole('heading', { name: 'Upload Proyek Spasial' }).waitFor();
  await page
    .getByLabel('Nama Proyek', { exact: true })
    .fill('Synthetic R2 project');
  await page
    .getByLabel('Deskripsi', { exact: true })
    .fill('Public synthetic regression fixture; no client data');
  await page
    .getByLabel('Tingkat Akses', { exact: true })
    .selectOption('restricted');
  const input = page.locator('#file-upload');
  await input.setInputFiles({
    name: 'unsafe.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('PK'),
  });
  await page.getByRole('button', { name: 'Unggah Proyek' }).click();
  await page
    .getByRole('alert')
    .getByText(/ZIP dinonaktifkan/)
    .waitFor();
  assert.equal(events.length, 0);
  await input.setInputFiles({
    name: 'huge.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(256 * 1024 + 1, 32),
  });
  await page.getByRole('button', { name: 'Unggah Proyek' }).click();
  await page
    .getByRole('alert')
    .getByText(/maksimal 256 KiB/)
    .waitFor();
  assert.equal(events.length, 0);
  await input.setInputFiles({
    name: 'safe.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(collection)),
  });
  const sent = page.waitForResponse(
    (r) =>
      r.url() === base + '/api/projects' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Unggah Proyek' }).click();
  assert.equal((await sent).status(), 201);
  await page.getByText('Proyek berhasil diunggah!', { exact: true }).waitFor();
  assert.equal(events.length, 2);
  assert.equal(events[0].value.access_tier, 'restricted');
  assert.deepEqual(events[1].value[0].geom, collection.features[0].geometry);
  const api = async (actor, content, filename = 'data.json') => {
    const f = new FormData();
    f.set('title', 'Synthetic API test');
    f.set('file', new File([content], filename));
    return fetch(base + '/api/projects', {
      method: 'POST',
      body: f,
      headers: actor ? { Authorization: `Bearer r2-synthetic-${actor}` } : {},
    });
  };
  assert.equal((await api(null, '{}')).status, 401);
  assert.equal((await api('client', JSON.stringify(collection))).status, 403);
  assert.equal((await api('analyst', 'PK', 'x.zip')).status, 415);
  assert.equal(
    (
      await api(
        'analyst',
        JSON.stringify(collection).replace('[103.61,-1.61]', '[999,999]'),
      )
    ).status,
    400,
  );
  assert.equal(
    events.length,
    2,
    'Rejected uploads must not call the synthetic write endpoints',
  );
  assert.equal((await api('admin', JSON.stringify(collection))).status, 201);
  assert.equal(events.length, 4);
  if (process.env.P4I_AXE_SCRIPT)
    for (const width of [1480, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.addScriptTag({ path: process.env.P4I_AXE_SCRIPT });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'],
          })
        ).violations.map((v) => ({ id: v.id, impact: v.impact })),
      );
      assert.deepEqual(violations, []);
      audits.push({ width, violations });
      await page.screenshot({
        path: `${dir}/upload-${width}.png`,
        fullPage: true,
      });
    }
  assert.deepEqual(errors, []);
  await writeFile(
    dir + '/results.json',
    JSON.stringify(
      {
        result: 'passed',
        dataMode: 'LOOPBACK_AUTH_REST_DOUBLE_NO_DATABASE',
        syntheticWrites: events.length,
        flows: [
          'ZIP/oversize UI refusal',
          'Analyst GeoJSON upload preserves coordinates and restricted tier',
          'Unauthorized and client-metadata escalation refusal',
          'ZIP and invalid geometry rejected before persistence',
          'Super admin upload',
          'Desktop/mobile upload form',
        ],
        errors,
        audits,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS R2 upload browser/API flows against loopback Auth/REST double; no database',
  );
} finally {
  await browser?.close();
  app.kill('SIGTERM');
  await Promise.race([exited, delay(5000)]);
  if (app.exitCode === null && app.signalCode === null) {
    app.kill('SIGKILL');
    await exited;
  }
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
  await log.close();
}
