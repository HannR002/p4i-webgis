import { inflateRawSync, crc32 } from 'node:zlib';
import proj4 from 'proj4';
import shp from 'shpjs';
export const IMPORT_LIMITS = Object.freeze({
  bytes: 32 * 1024 * 1024,
  expandedBytes: 64 * 1024 * 1024,
  features: 5000,
  coordinates: 250000,
  zipEntries: 100,
});

// Bounded central-directory reader: rejects ZIP64, encryption, split archives and
// decompression bombs. Never extracts paths or delegates unbounded ZIP inflate.
export function shapefileParts(bytes) {
  if (bytes.length > IMPORT_LIMITS.bytes)
    throw new Error('Input exceeds 32 MiB');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (
    end < 0 ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    throw new Error('Unsupported ZIP directory');
  const count = bytes.readUInt16LE(end + 10),
    directoryBytes = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16),
    total = 0;
  if (
    count < 1 ||
    count > IMPORT_LIMITS.zipEntries ||
    count !== bytes.readUInt16LE(end + 8) ||
    offset + directoryBytes !== end
  )
    throw new Error('ZIP entry/directory limits exceeded');
  const parts = new Map();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Invalid ZIP entry');
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10),
      checksum = bytes.readUInt32LE(offset + 16),
      compressed = bytes.readUInt32LE(offset + 20),
      expanded = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32),
      local = bytes.readUInt32LE(offset + 42);
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8')
      .toLowerCase();
    total += expanded;
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      total > IMPORT_LIMITS.expandedBytes ||
      expanded === 0xffffffff ||
      local + 30 > offset ||
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      /(^\/|\.\.|\\)/.test(name) ||
      parts.has(name)
    )
      throw new Error('Unsafe ZIP entry or expansion limit');
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    if (start + compressed > offset)
      throw new Error('ZIP member outside data region');
    const raw = bytes.subarray(start, start + compressed);
    const data =
      method === 8
        ? inflateRawSync(raw, {
            maxOutputLength: Math.max(
              1,
              Math.min(expanded, IMPORT_LIMITS.expandedBytes),
            ),
          })
        : raw;
    if (data.length !== expanded || crc32(data) !== checksum)
      throw new Error('ZIP size/checksum mismatch');
    parts.set(name, data);
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end) throw new Error('ZIP directory length mismatch');
  const shapes = [...parts.keys()].filter((name) => name.endsWith('.shp'));
  if (shapes.length !== 1)
    throw new Error('Exactly one SHP dataset per bounded batch is required');
  const base = shapes[0].slice(0, -4);
  const prj = parts.get(base + '.prj')?.toString('utf8');
  if (!prj?.trim() || prj.length > 16384 || !parts.has(base + '.dbf'))
    throw new Error('SHP requires matching .prj and .dbf');
  // shpjs otherwise silently ignores invalid projections. Validate before parsing.
  proj4(prj, 'EPSG:4326');
  return {
    shp: parts.get(base + '.shp'),
    dbf: parts.get(base + '.dbf'),
    prj,
    cpg: parts.get(base + '.cpg'),
  };
}

export async function parseBoundaryBytes(bytes, extension, sourceCrs) {
  if (bytes.length > IMPORT_LIMITS.bytes)
    throw new Error('Input exceeds 32 MiB; split offline');
  let collection, transform;
  if (extension === '.zip') {
    if (sourceCrs !== 'prj') throw new Error('SHP requires --source-crs=prj');
    collection = await shp(shapefileParts(bytes));
    transform = ([x, y]) => [x, y]; // shpjs has already transformed the verified PRJ to WGS84.
  } else if (['.json', '.geojson'].includes(extension)) {
    if (!['EPSG:4326', 'EPSG:3857'].includes(sourceCrs))
      throw new Error(
        'GeoJSON requires explicit EPSG:4326 or EPSG:3857; preconvert other CRS offline',
      );
    collection = JSON.parse(bytes.toString('utf8'));
    const declared = collection.crs?.properties?.name;
    if (collection.crs && declared !== sourceCrs)
      throw new Error(
        'Embedded GeoJSON CRS conflicts with declared source CRS',
      );
    const converter = proj4(sourceCrs, 'EPSG:4326');
    transform = (point) => converter.forward(point);
  } else
    throw new Error(
      'Input must be .geojson/.json or one zipped SHP with PRJ/DBF',
    );
  if (
    collection?.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    !collection.features.length ||
    collection.features.length > IMPORT_LIMITS.features
  )
    throw new Error('FeatureCollection requires 1–5000 features');
  let coordinateCount = 0;
  const features = collection.features.map((feature) => {
    if (
      feature?.type !== 'Feature' ||
      !feature.geometry ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
    )
      throw new Error('Only Polygon/MultiPolygon features accepted');
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    if (!Array.isArray(polygons) || !polygons.length)
      throw new Error('Empty polygons');
    const coordinates = polygons.map((polygon) => {
      if (!Array.isArray(polygon) || !polygon.length)
        throw new Error('Empty polygon rings');
      return polygon.map((ring) => {
        if (!Array.isArray(ring) || ring.length < 4)
          throw new Error('Ring requires at least four coordinates');
        const points = ring.map((point) => {
          if (++coordinateCount > IMPORT_LIMITS.coordinates)
            throw new Error(
              'Coordinate budget exceeded; split/simplify offline',
            );
          if (
            !Array.isArray(point) ||
            point.length !== 2 ||
            !point.every(Number.isFinite)
          )
            throw new Error('Coordinates must be finite 2D XY values');
          if (
            sourceCrs === 'EPSG:4326' &&
            (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)
          )
            throw new Error('Source coordinates outside EPSG:4326');
          if (
            sourceCrs === 'EPSG:3857' &&
            point.some((n) => Math.abs(n) > 20037508.342789244)
          )
            throw new Error('Source coordinates outside Web Mercator bounds');
          const [x, y] = transform(point);
          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            x < -180 ||
            x > 180 ||
            y < -90 ||
            y > 90
          )
            throw new Error('Transformed coordinates outside EPSG:4326');
          return [x, y];
        });
        if (
          points[0][0] !== points.at(-1)[0] ||
          points[0][1] !== points.at(-1)[1]
        )
          throw new Error('Polygon ring must be explicitly closed');
        const area = points
          .slice(1)
          .reduce(
            (a, p, i) => a + points[i][0] * p[1] - p[0] * points[i][1],
            0,
          );
        if (Math.abs(area) < 1e-14) throw new Error('Degenerate polygon ring');
        return points;
      });
    });
    if (
      feature.properties !== null &&
      (typeof feature.properties !== 'object' ||
        Array.isArray(feature.properties))
    )
      throw new Error('Invalid feature properties');
    return {
      type: 'Feature',
      properties: feature.properties ?? {},
      geometry: { type: 'MultiPolygon', coordinates },
    };
  });
  return {
    features,
    coordinateCount,
    sourceCrs,
    targetCrs: 'EPSG:4326',
    validation: 'STRUCTURAL_ONLY_POSTGIS_TOPOLOGY_REVIEW_REQUIRED',
  };
}
