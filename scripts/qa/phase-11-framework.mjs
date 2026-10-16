import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const base = new URL(
  process.env.P4I_QA_PRODUCTION_BASE_URL || 'http://localhost:3001',
);
assert(
  ['localhost', '127.0.0.1'].includes(base.hostname) &&
    base.protocol === 'http:',
  'Framework QA must target a local test server',
);
const dir = path.resolve(process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase11');
await mkdir(dir, { recursive: true });
const results = [];
const image = await fetch(
  new URL('/_next/image?url=/gis/previews/terrain.png&w=640&q=75', base),
  { headers: { Accept: 'image/webp' } },
);
assert.equal(image.status, 200);
assert.match(image.headers.get('content-type'), /^image\/webp/);
const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
assert.equal(metadata.width, 640);
results.push({ check: 'local image optimization', status: 200, width: 640 });
for (const [check, query] of [
  [
    'disallowed remote image',
    'url=https://example.invalid/private.png&w=640&q=75',
  ],
  ['invalid image width', 'url=/gis/previews/terrain.png&w=1&q=75'],
]) {
  // The disallowed hostname must be rejected by the default remote allowlist.
  const response = await fetch(new URL('/_next/image?' + query, base));
  assert.equal(response.status, 400, check);
  results.push({ check, status: response.status });
}
await writeFile(
  path.join(dir, 'framework-checks.json'),
  JSON.stringify({ mode: 'LOCAL_NEXT_START', results }, null, 2) + '\n',
);
console.log(`${results.length} local framework/image checks passed`);
