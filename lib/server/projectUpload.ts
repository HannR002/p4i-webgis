import 'server-only';
import { PROJECT_UPLOAD as LIMIT } from '../uploadPolicy';
import { sketchGeometry } from '../gis/vectorEditing';
import type { NewProject, NewVectorLayer } from './database/contracts';

export class UploadError extends Error {
  constructor(
    readonly status: 400 | 408 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}
const invalid = () => new UploadError(400, 'Invalid upload format or geometry');
const tooLarge = () => new UploadError(413, 'Upload exceeds resource limits');
const timeout = () =>
  new UploadError(408, 'Upload deadline exceeded or request cancelled');
export function cancelUpload(request: Request): void {
  if (!request.body?.locked) void request.body?.cancel().catch(() => {});
}

/** Fixed buffer, real streamed byte accounting. The timer interrupts IO, not CPU work. */
export async function readUploadBytes(request: Request): Promise<Buffer> {
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^\d{1,12}$/.test(declared) || Number(declared) > LIMIT.requestBytes)
  ) {
    cancelUpload(request);
    throw tooLarge();
  }
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const buffer = Buffer.alloc(LIMIT.requestBytes);
  let used = 0;
  const deadline = Date.now() + LIMIT.deadlineMs;
  let stopped: UploadError | undefined;
  const abort = () => {
    stopped = timeout();
    // Web stream cancellation resolves pending reads even if source cleanup stalls.
    // Do not accumulate Promise.race handlers on one pending promise per chunk.
    void reader.cancel().catch(() => {});
  };
  const timer = setTimeout(abort, LIMIT.deadlineMs);
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    if (request.signal.aborted) throw timeout();
    while (true) {
      const { value, done } = await reader.read();
      if (stopped) throw stopped;
      if (Date.now() >= deadline || request.signal.aborted) throw timeout();
      if (done) break;
      if (!(value instanceof Uint8Array) || !value.length) throw invalid();
      if (value.byteLength > LIMIT.requestBytes - used) throw tooLarge();
      buffer.set(value, used);
      used += value.byteLength;
    }
    if (!used) throw invalid();
    // Length is only a consistency check; it never grants an allocation or bypass.
    if (declared !== null && Number(declared) !== used) throw invalid();
    return buffer.subarray(0, used);
  } catch (error) {
    // A hostile/blocked source's cancel promise must not delay the rejection.
    void reader.cancel().catch(() => {});
    throw error instanceof UploadError ? error : invalid();
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

type Part = { filename?: string; bytes: Buffer };
function utf8(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw invalid();
  }
}
function boundaryFor(request: Request): string {
  if (request.headers.has('content-encoding'))
    throw new UploadError(415, 'Encoded request bodies are not supported');
  const type = request.headers.get('content-type') ?? '';
  if (type.length > 200) throw invalid();
  // Deliberately narrow browser FormData profile; no nested multipart or extensions.
  const match =
    /^multipart\/form-data;\s*boundary=(?:"([a-zA-Z0-9'()+_,.\/:=?-]{1,70})"|([a-zA-Z0-9'()+_,.\/:=?-]{1,70}))$/i.exec(
      type,
    );
  if (!match)
    throw new UploadError(
      415,
      'Expected multipart/form-data with a valid boundary',
    );
  return match[1] ?? match[2];
}

/** Bounded narrow multipart grammar. Never calls Request.formData or extracts files. */
function partsFrom(bytes: Buffer, boundary: string): Map<string, Part> {
  const marker = Buffer.from(`--${boundary}`);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  if (!bytes.subarray(0, marker.length).equals(marker)) throw invalid();
  let offset = marker.length;
  const parts = new Map<string, Part>();
  const fields: Record<string, number> = {
    title: 800,
    category: 400,
    description: 8000,
    access_tier: 16,
    file: LIMIT.fileBytes,
  };
  while (true) {
    if (bytes.subarray(offset, offset + 2).toString() === '--') {
      const tail = bytes.subarray(offset + 2);
      if (tail.length && !tail.equals(Buffer.from('\r\n'))) throw invalid();
      break;
    }
    if (parts.size >= LIMIT.parts) throw tooLarge();
    if (bytes.subarray(offset, offset + 2).toString() !== '\r\n')
      throw invalid();
    offset += 2;
    const headerEnd = bytes.indexOf('\r\n\r\n', offset);
    if (headerEnd < 0 || headerEnd - offset > LIMIT.headerBytes)
      throw invalid();
    const header = bytes.subarray(offset, headerEnd).toString('latin1');
    if (/[^\x20-\x7e\r\n]/.test(header)) throw invalid();
    const headers = new Map<string, string>();
    for (const line of header.split('\r\n')) {
      const match = /^(Content-Disposition|Content-Type):[ \t]*(.+)$/i.exec(
        line,
      );
      if (!match || headers.has(match[1].toLowerCase())) throw invalid();
      headers.set(match[1].toLowerCase(), match[2]);
    }
    const disposition =
      /^form-data;\s*name="([a-z_]+)"(?:;\s*filename="([^"\\/:\x00-\x1f]{1,120})")?$/i.exec(
        headers.get('content-disposition') ?? '',
      );
    if (!disposition) throw invalid();
    const [, name, filename] = disposition;
    if (
      !Object.hasOwn(fields, name) ||
      parts.has(name) ||
      (name === 'file') !== Boolean(filename)
    )
      throw invalid();
    const end = bytes.indexOf(delimiter, headerEnd + 4);
    if (end < 0) throw invalid();
    const body = bytes.subarray(headerEnd + 4, end);
    if (body.length > fields[name]) throw tooLarge();
    parts.set(name, { filename, bytes: body });
    offset = end + delimiter.length;
  }
  if (
    !parts.has('title') ||
    !parts.has('file') ||
    !parts.get('file')!.bytes.length
  )
    throw invalid();
  return parts;
}

function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k))) throw invalid();
}
function properties(v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (!record(v) || Object.keys(v).length > 32) throw invalid();
  for (const [key, value] of Object.entries(v)) {
    if (
      !key.length ||
      key.length > 64 ||
      ['__proto__', 'constructor', 'prototype'].includes(key) ||
      /[\x00-\x1f\x7f]/.test(key)
    )
      throw invalid();
    if (!(
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' &&
        value.length <= 512 &&
        !/[\x00\x7f]/.test(value))
    ))
      throw invalid();
  }
  if (Buffer.byteLength(JSON.stringify(v)) > LIMIT.propertyBytes)
    throw tooLarge();
  return v;
}

export function validateUploadGeoJSON(
  value: unknown,
): {
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
}[] {
  if (!record(value)) throw invalid();
  // RFC 7946: WGS84 longitude/latitude only. Reject legacy CRS declarations rather than guessing axes.
  keys(value, ['type', 'features']);
  if (
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features) ||
    !value.features.length
  )
    throw invalid();
  if (value.features.length > LIMIT.features) throw tooLarge();
  let total = 0;
  return value.features.map((f) => {
    if (!record(f)) throw invalid();
    keys(f, ['type', 'geometry', 'properties', 'id']);
    if (f.type !== 'Feature' || !record(f.geometry)) throw invalid();
    if (
      f.id !== undefined &&
      !(
        (typeof f.id === 'string' && f.id.length <= 128) ||
        (typeof f.id === 'number' && Number.isSafeInteger(f.id))
      )
    )
      throw invalid();
    const g = f.geometry;
    keys(g, ['type', 'coordinates']);
    const depths: Record<string, number> = {
      Point: 0,
      MultiPoint: 1,
      LineString: 1,
      MultiLineString: 2,
      Polygon: 2,
      MultiPolygon: 3,
    };
    if (typeof g.type !== 'string' || !Object.hasOwn(depths, g.type))
      throw invalid();
    let count = 0;
    const walk = (v: unknown, depth: number) => {
      if (!Array.isArray(v) || !v.length) throw invalid();
      if (depth) {
        if (v.length > LIMIT.featureVertices) throw tooLarge();
        for (const child of v) walk(child, depth - 1);
      } else {
        if (
          v.length !== 2 ||
          !v.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
          Math.abs(v[0]) > 180 ||
          Math.abs(v[1]) > 90
        )
          throw invalid();
        if (++count > LIMIT.featureVertices || ++total > LIMIT.vertices)
          throw tooLarge();
      }
    };
    walk(g.coordinates, depths[g.type]);
    // Refuse implicit ring closure before reusing the editor's topology validation.
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polygons = (
        g.type === 'Polygon' ? [g.coordinates] : g.coordinates
      ) as number[][][][];
      for (const polygon of polygons)
        for (const ring of polygon) {
          if (
            ring.length < 4 ||
            ring[0][0] !== ring.at(-1)![0] ||
            ring[0][1] !== ring.at(-1)![1]
          )
            throw invalid();
        }
    }
    try {
      if (g.type === 'MultiPoint')
        for (const point of g.coordinates as number[][])
          sketchGeometry({ type: 'Point', coordinates: point });
      else sketchGeometry(g);
    } catch {
      throw invalid();
    }
    // Validation does not simplify, repair, reproject or substitute returned geometry.
    return { geometry: g, properties: properties(f.properties) };
  });
}

export async function parseProjectUpload(
  request: Request,
): Promise<{ project: NewProject; layers: NewVectorLayer[] }> {
  const boundary = boundaryFor(request);
  const parts = partsFrom(await readUploadBytes(request), boundary);
  const field = (name: string, max: number): string | null => {
    const part = parts.get(name);
    if (!part) return null;
    const value = utf8(part.bytes).trim();
    if (value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
      throw invalid();
    return value || null;
  };
  const title = field('title', 200);
  if (!title) throw invalid();
  const tier = parts.has('access_tier') ? field('access_tier', 16) : 'public';
  if (tier !== 'public' && tier !== 'restricted') throw invalid();
  const file = parts.get('file')!;
  if (
    !/\.(geojson|json)$/i.test(file.filename!) ||
    file.bytes.subarray(0, 2).equals(Buffer.from('PK')) ||
    (file.bytes[0] === 0x1f && file.bytes[1] === 0x8b)
  ) {
    throw new UploadError(
      415,
      'Only uncompressed GeoJSON is supported; ZIP Shapefile upload is disabled',
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(utf8(file.bytes)) as unknown;
  } catch {
    throw invalid();
  }
  const features = validateUploadGeoJSON(value);
  return {
    project: {
      title,
      category: field('category', 100),
      description: field('description', 2000),
      accessTier: tier,
    },
    layers: features.map((f) => ({
      layerName: (
        (typeof f.properties.nama_wilayah === 'string' &&
          f.properties.nama_wilayah) ||
        (typeof f.properties.name === 'string' && f.properties.name) ||
        title
      ).slice(0, 200),
      geometry: f.geometry,
      properties: f.properties,
      fileSizeBytes: Math.floor(file.bytes.length / features.length),
    })),
  };
}
