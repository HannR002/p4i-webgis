import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';
const mocks = vi.hoisted(() => ({ role: vi.fn(), save: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('shpjs', () => {
  throw Error('ZIP parser must never load in the legacy upload route');
});
vi.mock('../lib/server/auth', () => ({
  requireRole: mocks.role,
  AuthorizationError: class extends Error {
    constructor(
      message: string,
      readonly status: 401 | 403,
    ) {
      super(message);
    }
  },
}));
vi.mock('../lib/server/database', () => ({
  getDatabaseRepositories: () => ({
    projects: { createWithLayers: mocks.save },
  }),
}));
import { POST } from '../app/api/projects/route';
import { AuthorizationError } from '../lib/server/auth';
import {
  projectUploadBudget,
  RequestBudget,
} from '../lib/server/requestBudget';
import {
  parseProjectUpload,
  readUploadBytes,
  validateUploadGeoJSON,
} from '../lib/server/projectUpload';
import { PROJECT_UPLOAD as L } from '../lib/uploadPolicy';
import { PROJECT_CREATE_ROLES } from '../lib/authRoles';

const feature = (
  geometry: unknown = { type: 'Point', coordinates: [103.61, -1.61] },
  properties: unknown = { name: 'Synthetic A' },
) => ({ type: 'Feature', geometry, properties });
const collection = (features: unknown[] = [feature()]) => ({
  type: 'FeatureCollection',
  features,
});
const json = () => JSON.stringify(collection());
function upload(
  body = json(),
  filename = 'sample.geojson',
  extra?: (f: FormData) => void,
) {
  const f = new FormData();
  f.set('title', 'Synthetic upload');
  f.set(
    'file',
    new File([body], filename, { type: 'application/octet-stream' }),
  );
  extra?.(f);
  return new Request('http://localhost/api/projects', {
    method: 'POST',
    body: f,
  });
}
function streamRequest(bytes: number, contentLength?: string) {
  let left = bytes;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        if (!left) return c.close();
        const n = Math.min(left, 4096);
        left -= n;
        c.enqueue(new Uint8Array(n));
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers({
    'content-type': 'multipart/form-data; boundary=synthetic',
  });
  if (contentLength !== undefined) headers.set('content-length', contentLength);
  return {
    cancel,
    request: new Request('http://localhost/api/projects', {
      method: 'POST',
      body,
      headers,
      duplex: 'half',
    } as RequestInit),
  };
}
function rawMultipart(raw: string, boundary = 'x') {
  return new Request('http://localhost/api/projects', {
    method: 'POST',
    body: raw,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  });
}
async function rejected(request: Request, code: number) {
  const response = await POST(request);
  expect(response.status).toBe(code);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.save).not.toHaveBeenCalled();
  return response;
}
const budgetSpy = vi.spyOn(projectUploadBudget, 'acquire');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({
    role: 'managerial_analyst',
    user: { id: 'synthetic' },
  });
  mocks.save.mockResolvedValue('synthetic-project');
  const budget = new RequestBudget(20, 2);
  budgetSpy.mockImplementation(() => budget.acquire());
});
afterEach(() => vi.useRealTimers());

describe('bounded ingestion before multipart or persistence', () => {
  it.each([undefined, '1'])(
    'rejects oversize bytes with missing/false Content-Length %s and cancels',
    async (length) => {
      const { request, cancel } = streamRequest(L.requestBytes + 4096, length);
      await rejected(request, 413);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
  it('rejects declared oversize before pulling even one chunk', async () => {
    const { request, cancel } = streamRequest(10, String(L.requestBytes + 1));
    await rejected(request, 413);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('counts actual bytes up to exactly the fixed buffer ceiling', async () => {
    const result = await readUploadBytes(streamRequest(L.requestBytes).request);
    expect(result.length).toBe(L.requestBytes);
    expect(result.buffer.byteLength).toBe(L.requestBytes);
    const tiny = await readUploadBytes(streamRequest(12).request);
    expect(tiny.length).toBe(12);
    expect(tiny.buffer.byteLength).toBe(L.requestBytes);
  });
  it('rejects an incorrect length even below the byte limit', async () => {
    const request = upload();
    request.headers.set('content-length', '1');
    await rejected(request, 400);
  });
  it('does not call unrestricted Request.formData', async () => {
    const request = upload();
    const parser = vi
      .spyOn(request, 'formData')
      .mockRejectedValue(Error('must not parse'));
    expect((await POST(request)).status).toBe(201);
    expect(parser).not.toHaveBeenCalled();
  });
  it('bounds a slow body and does not await a stalled cancellation promise', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream({
      pull: () => new Promise(() => {}),
      cancel,
    });
    const request = new Request('http://localhost/api/projects', {
      method: 'POST',
      body,
      duplex: 'half',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
    } as RequestInit);
    const pending = rejected(request, 408);
    await vi.advanceTimersByTimeAsync(L.deadlineMs + 1);
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('cancels promptly when the caller aborts', async () => {
    const controller = new AbortController(),
      cancel = vi.fn();
    const request = new Request('http://localhost/api/projects', {
      method: 'POST',
      body: new ReadableStream({ cancel }),
      signal: controller.signal,
      duplex: 'half',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
    } as RequestInit);
    const pending = rejected(request, 408);
    await Promise.resolve();
    controller.abort();
    await pending;
    expect(cancel).toHaveBeenCalled();
  });
  it('rejects unreadable body without leaking source error content', async () => {
    const body = new ReadableStream({
      start(c) {
        c.error(Error('/internal/token=private-marker'));
      },
    });
    const request = new Request('http://localhost/api/projects', {
      method: 'POST',
      body,
      duplex: 'half',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
    } as RequestInit);
    expect(await (await rejected(request, 400)).text()).not.toContain(
      'private-marker',
    );
  });
  it.each([
    ['missing file', (f: FormData) => f.delete('file')],
    [
      'repeated file',
      (f: FormData) => f.append('file', new File([json()], 'second.json')),
    ],
    ['repeated title', (f: FormData) => f.append('title', 'second')],
    ['unknown field', (f: FormData) => f.set('role', 'super_admin')],
    [
      'file in scalar field',
      (f: FormData) => f.set('category', new File(['x'], 'x.json')),
    ],
    ['missing title', (f: FormData) => f.delete('title')],
    ['invalid tier', (f: FormData) => f.set('access_tier', 'admin')],
  ] as const)('rejects %s', async (_, modify) => {
    await rejected(upload(json(), 'data.json', modify), 400);
  });
  it('applies the independent per-file byte ceiling', async () => {
    await rejected(upload(' '.repeat(L.fileBytes + 1)), 413);
  });
  it('bounds non-file fields', async () => {
    await rejected(
      upload(json(), 'data.json', (f) =>
        f.set('description', 'x'.repeat(8001)),
      ),
      413,
    );
  });
  it.each([
    '',
    'multipart/form-data',
    'multipart/form-data; boundary=' + 'a'.repeat(71),
    'application/json',
  ])('rejects media/boundary %s', async (type) => {
    const request = upload();
    request.headers.set('content-type', type);
    await rejected(request, 415);
  });
  it.each([
    '--x\r\nContent-Disposition: form-data; name="title"\r\n\r\na',
    '--x\r\nX-Fill: ' + 'a'.repeat(1025) + '\r\n\r\na\r\n--x--',
    '--x\r\nContent-Disposition: form-data; name="title"\r\nContent-Disposition: form-data; name="file"\r\n\r\na\r\n--x--',
    '--x\r\nContent-Disposition: form-data; name="file"; filename="../x.json"\r\n\r\n{}\r\n--x--',
    '--x\r\nContent-Disposition: form-data; name="title"\r\nContent-Transfer-Encoding: base64\r\n\r\na\r\n--x--',
    '--x--trailing garbage',
  ])('rejects malformed multipart %#', async (raw) => {
    await rejected(rawMultipart(raw), 400);
  });
  it('rejects compressed request encoding before ingestion', async () => {
    const request = upload();
    request.headers.set('content-encoding', 'gzip');
    await rejected(request, 415);
  });
  it('rejects invalid UTF-8 instead of replacement decoding', async () => {
    const f = new FormData();
    f.set('title', 'Synthetic');
    f.set('file', new File([new Uint8Array([0xff, 0xfe])], 'x.json'));
    await rejected(
      new Request('http://localhost/api/projects', { method: 'POST', body: f }),
      400,
    );
  });
});

describe('GeoJSON validity and bounded complexity', () => {
  it.each([
    '{"type":',
    '{}',
    'null',
    '[]',
    JSON.stringify({
      ...collection(),
      crs: { type: 'name', properties: { name: 'EPSG:3857' } },
    }),
    JSON.stringify({
      ...collection(),
      crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    }),
  ])('rejects malformed/unsupported collection %#', async (body) => {
    await rejected(upload(body), 400);
  });
  it.each([
    { type: 'Point', coordinates: [181, 0] },
    { type: 'Point', coordinates: [0, 91] },
    { type: 'Point', coordinates: [103, -1, 5] },
    { type: 'Point', coordinates: ['103', -1] },
    { type: 'Point', coordinates: [[103, -1]] },
    { type: 'Point', coordinates: [] },
    { type: 'GeometryCollection', geometries: [] },
    null,
    { type: 'LineString', coordinates: [[0, 0]] },
    {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0, 0],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [0, 2],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [0, 2],
          [0, 0],
        ],
        [
          [10, 10],
          [11, 10],
          [10, 11],
          [10, 10],
        ],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [179, 0],
        [-179, 1],
      ],
    },
  ])('rejects invalid geometry %# before any write', async (g) => {
    await rejected(upload(JSON.stringify(collection([feature(g)]))), 400);
  });
  it('rejects numeric overflow in otherwise valid JSON', async () => {
    await rejected(upload(json().replace('[103.61,-1.61]', '[1e999,-1]')), 400);
    expect(() =>
      validateUploadGeoJSON(
        collection([feature({ type: 'Point', coordinates: [NaN, 0] })]),
      ),
    ).toThrow();
  });
  it.each([
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { constructor: 'x' },
    { prototype: 'x' },
    { data: { nested: 'not scalar' } },
    { data: ['not scalar'] },
    { data: 'x'.repeat(513) },
    { ['x'.repeat(65)]: 1 },
    { ['bad\u0000key']: 1 },
    Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['k' + i, 1])),
  ])('rejects malicious/unsupported properties %#', async (p) => {
    await rejected(
      upload(JSON.stringify(collection([feature(undefined, p)]))),
      400,
    );
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('bounds total property bytes', async () => {
    await rejected(
      upload(
        JSON.stringify(
          collection([
            feature(
              undefined,
              Object.fromEntries(
                Array.from({ length: 10 }, (_, i) => [
                  'k' + i,
                  'a'.repeat(500),
                ]),
              ),
            ),
          ]),
        ),
      ),
      413,
    );
  });
  it('bounds feature count before geometry processing', async () => {
    await rejected(
      upload(
        JSON.stringify(
          collection(Array.from({ length: L.features + 1 }, () => feature())),
        ),
      ),
      413,
    );
  });
  it('bounds per-feature vertices', async () => {
    await rejected(
      upload(
        JSON.stringify(
          collection([
            feature({
              type: 'MultiPoint',
              coordinates: Array.from({ length: L.featureVertices + 1 }, () => [
                0, 0,
              ]),
            }),
          ]),
        ),
      ),
      413,
    );
  });
  it('bounds cumulative vertices across individually valid geometries', async () => {
    await rejected(
      upload(
        JSON.stringify(
          collection(
            Array.from({ length: 10 }, () =>
              feature({
                type: 'MultiPoint',
                coordinates: Array.from({ length: 501 }, () => [0, 0]),
              }),
            ),
          ),
        ),
      ),
      413,
    );
  });
  it('accepts the exact feature ceiling and cumulative vertex ceiling', async () => {
    expect(
      (
        await POST(
          upload(
            JSON.stringify(
              collection(Array.from({ length: L.features }, () => feature())),
            ),
          ),
        )
      ).status,
    ).toBe(201);
    const points = Array.from({ length: 500 }, () => [0, 0]);
    expect(
      (
        await POST(
          upload(
            JSON.stringify(
              collection(
                Array.from({ length: 10 }, () =>
                  feature({ type: 'MultiPoint', coordinates: points }),
                ),
              ),
            ),
          ),
        )
      ).status,
    ).toBe(201);
  });
  it('rejects deeply nested property content without recursive object traversal', async () => {
    const nested = '['.repeat(1000) + '0' + ']'.repeat(1000);
    await rejected(upload(json().replace('"Synthetic A"', nested)), 400);
  });
  it.each([
    { type: 'Point', coordinates: [103.61, -1.61] },
    {
      type: 'MultiPoint',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    },
    {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [1, 2],
          [1, 1],
        ],
      ],
    },
    {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [3, 3],
            [4, 3],
            [3, 4],
            [3, 3],
          ],
        ],
      ],
    },
  ])(
    'accepts supported %s without coordinate repair or axis changes',
    async (g) => {
      const response = await POST(
        upload(
          JSON.stringify(
            collection([
              feature(g, { name: 'A', count: 2, active: true, empty: null }),
            ]),
          ),
          'data.json',
          (f) => f.set('access_tier', 'restricted'),
        ),
      );
      expect(response.status).toBe(201);
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(mocks.save.mock.calls[0][0].accessTier).toBe('restricted');
      expect(mocks.save.mock.calls[0][1][0].geometry).toEqual(g);
      expect(mocks.role).toHaveBeenCalledWith(
        expect.any(Request),
        PROJECT_CREATE_ROLES,
      );
    },
  );
});

describe('ZIP is unconditionally closed, with no decompression path', () => {
  it.each([
    'broken',
    '../escape.shp',
    '/absolute.shp',
    'nested.zip',
    'duplicate.shp',
    'encrypted.shp',
    'unsupported-method.shp',
    'oversize.shp',
  ])('rejects archive scenario %s without invoking shpjs', async (name) => {
    // Tiny controlled archive-like header. Never allocate the claimed expanded size.
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(name === 'encrypted.shp' ? 1 : 0, 6);
    header.writeUInt16LE(name === 'unsupported-method.shp' ? 99 : 8, 8);
    header.writeUInt32LE(name === 'oversize.shp' ? 0xffffffff : 1024, 22);
    const payload = Buffer.concat([
      header,
      Buffer.from(name),
      deflateRawSync(Buffer.alloc(1024)),
    ]);
    const f = new FormData();
    f.set('title', 'Synthetic');
    f.set('file', new File([payload], 'archive.zip'));
    await rejected(
      new Request('http://localhost/api/projects', { method: 'POST', body: f }),
      415,
    );
  });
  it('rejects ZIP magic disguised as JSON', async () => {
    await rejected(upload('PK\u0003\u0004not-expanded', 'archive.json'), 415);
  });
  it.each(['archive.zip', 'source.shp', 'data.csv'])(
    'rejects %s even when contents are valid GeoJSON',
    async (name) => {
      await rejected(upload(json(), name), 415);
    },
  );
});

describe('authorization, concurrency and failure safety', () => {
  it.each([401, 403] as const)(
    'rejects unauthorized %s before consuming input',
    async (status) => {
      mocks.role.mockRejectedValueOnce(
        new AuthorizationError('Denied', status),
      );
      const { request, cancel } = streamRequest(100);
      const reader = vi.spyOn(request.body!, 'getReader');
      await rejected(request, status);
      expect(reader).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalled();
    },
  );
  it('limits concurrent uploads and releases slots after stream failure', async () => {
    vi.useFakeTimers();
    const slow = () =>
      new Request('http://localhost/api/projects', {
        method: 'POST',
        body: new ReadableStream({ pull: () => new Promise(() => {}) }),
        duplex: 'half',
        headers: { 'content-type': 'multipart/form-data; boundary=x' },
      } as RequestInit);
    const a = POST(slow()),
      b = POST(slow());
    const response = await rejected(upload(), 429);
    expect(response.headers.get('retry-after')).toBe('60');
    await vi.advanceTimersByTimeAsync(L.deadlineMs + 1);
    expect((await a).status).toBe(408);
    expect((await b).status).toBe(408);
    expect((await POST(upload())).status).toBe(201);
  });
  it('rate-limits sequential attempts with a bounded global counter', async () => {
    for (let i = 0; i < 20; i++) await rejected(upload('{}'), 400);
    await rejected(upload(), 429);
  });
  it('sanitizes repository failure, makes one attempt and does not add recovery deletes', async () => {
    mocks.save.mockRejectedValueOnce(
      Error('postgres://private-marker /internal/path'),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await POST(upload());
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('private-marker');
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-marker');
      expect(mocks.save).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
  it('accepts quoted browser multipart boundary with accurate length and no MIME trust', async () => {
    const request = upload();
    const bytes = await request.arrayBuffer();
    const type = request.headers
      .get('content-type')!
      .replace(/boundary=(.+)/, 'boundary="$1"');
    const parsed = await parseProjectUpload(
      new Request(request.url, {
        method: 'POST',
        body: bytes,
        headers: {
          'content-type': type,
          'content-length': String(bytes.byteLength),
        },
      }),
    );
    expect(parsed.layers).toHaveLength(1);
  });
});
