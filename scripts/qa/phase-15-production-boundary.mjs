import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = new URL(
  process.env.P4I_QA_PRODUCTION_BASE_URL || 'http://127.0.0.1:3001',
);
assert(
  ['127.0.0.1', 'localhost'].includes(base.hostname) &&
    base.protocol === 'http:',
);
const dir =
  process.env.P4I_QA_ARTIFACTS ||
  '/workspace/artifacts/phase-15/final/phase-15-production-boundary';
await mkdir(dir, { recursive: true });
const input = {
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  layerId: null,
  expectedRevision: 0,
  requestId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  archive: false,
  layer: {
    id: 'local-vector-1',
    name: 'Synthetic',
    visible: true,
    opacity: 1,
    style: {
      color: '#0f766e',
      fillColor: '#5eead4',
      weight: 2,
      fillOpacity: 0.6,
      radius: 7,
    },
    data: { type: 'FeatureCollection', features: [] },
  },
};
const results = [];
const capabilities = await fetch(new URL('/api/gis/vector-storage', base));
assert.equal(capabilities.status, 200);
assert.deepEqual(await capabilities.json(), {
  available: false,
  mode: 'unavailable',
  projects: [],
});
results.push({
  check: 'production refuses acknowledged local capability',
  status: 200,
});
for (const [check, headers, body, status] of [
  ['no authenticated session', { Origin: base.origin }, input, 401],
  [
    'cross-origin denial',
    {
      Origin: 'https://other.invalid',
      Authorization: 'Bearer synthetic-invalid',
    },
    input,
    403,
  ],
  [
    'production write capability disabled',
    { Origin: base.origin, Authorization: 'Bearer synthetic-invalid' },
    input,
    503,
  ],
  [
    'client-supplied authority refused',
    { Origin: base.origin, Authorization: 'Bearer synthetic-invalid' },
    { ...input, role: 'super_admin' },
    400,
  ],
  [
    'streamed upload budget',
    { Origin: base.origin, Authorization: 'Bearer synthetic-invalid' },
    { ...input, extra: 'x'.repeat(65536) },
    400,
  ],
]) {
  const response = await fetch(new URL('/api/gis/vector-storage', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, status, check);
  const data = await response.json();
  assert(!JSON.stringify(data).includes('phase15-local-test-only'));
  results.push({ check, status: response.status });
}
const load = await fetch(
  new URL(
    '/api/gis/vector-storage?operation=load&projectId=' +
      input.projectId +
      '&layerId=' +
      input.requestId,
    base,
  ),
);
assert.equal(load.status, 503);
results.push({ check: 'production project load disabled', status: 503 });
await writeFile(
  path.join(dir, 'results.json'),
  JSON.stringify({ mode: 'LOCAL_NEXT_START_ONLY', results }, null, 2),
);
console.log(`${results.length} local vector production-boundary checks passed`);
