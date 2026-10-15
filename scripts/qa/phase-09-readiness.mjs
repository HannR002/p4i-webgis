import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = new URL(
  process.env.P4I_QA_PRODUCTION_BASE_URL || 'http://localhost:3001',
);
assert(
  ['localhost', '127.0.0.1'].includes(base.hostname) &&
    base.protocol === 'http:',
  'Production-mode QA must target a local test server',
);
const dir = path.resolve(
  process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase09-production',
);
await mkdir(dir, { recursive: true });
const recipe = {
  schemaVersion: 1,
  id: 'local-map',
  title: 'Peta kerja baru',
  description: '',
  basemap: 'none',
  viewport: { center: [-1.6, 103.62], zoom: 12 },
  layers: [],
  aoi: null,
  legend: [],
  analysis: null,
  provenance: 'human',
};
const results = [];
async function call(route, body) {
  return fetch(new URL(route, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base.origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
for (const [route, body, status] of [
  ['/api/consulting', undefined, 403],
  ['/api/consulting/download?id=unknown&format=pdf', undefined, 403],
  ['/api/gis/compute', { action: 'get', jobId: 'unknown' }, 403],
  ['/api/gis/copilot', { prompt: 'Tambahkan hujan', recipe }, 503],
  [
    '/api/gis/pixel',
    { datasetIds: ['demo-rainfall'], latitude: -1.6, longitude: 103.6 },
    503,
  ],
  ['/api/gis/vector/demo-boundaries', undefined, 503],
  ['/api/gis/tiles/demo-rainfall/2/0/0', undefined, 503],
  [
    '/api/gee/flood-analysis',
    { kecamatan_id: '123e4567-e89b-42d3-a456-426614174001' },
    401,
  ],
  ['/api/admin/users', undefined, 401],
]) {
  const response = await call(route, body);
  assert.equal(response.status, status, route);
  results.push({ route, status: response.status });
}
const catalog = await call('/api/gis/catalog');
const data = await catalog.json();
assert.equal(catalog.status, 200);
assert.equal(data.mode, 'unavailable');
results.push({
  route: '/api/gis/catalog',
  mode: data.mode,
  status: catalog.status,
});
for (const [route, body, max] of [
  ['/api/boundaries', undefined, 120],
  ['/api/gis/copilot', {}, 60],
]) {
  let limited = false;
  for (let i = 0; i <= max; i++) {
    const response = await call(route, body);
    if (response.status === 429) {
      assert.equal(response.headers.get('Retry-After'), '60');
      assert.match(response.headers.get('Cache-Control'), /no-store/);
      limited = true;
      break;
    }
    assert.equal(response.status, 400);
  }
  assert(limited, route + ' budget did not refuse');
  results.push({ route, status: 429, processRateLimit: true });
}
await writeFile(
  path.join(dir, 'production-isolation.json'),
  JSON.stringify(
    {
      mode: 'LOCAL_NEXT_START_WITH_DEMO_FLAGS_SET',
      results,
      externalAnalysisExecuted: false,
    },
    null,
    2,
  ) + '\n',
);
console.log(`${results.length} local production isolation/rate checks passed`);
