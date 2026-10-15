import type {
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson';
import { GisInputError } from './validation';
const RADIUS = 6371008.8;
const radians = (degree: number) => (degree * Math.PI) / 180;
function validPoint(point: Position) {
  if (
    point.length < 2 ||
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1]) ||
    Math.abs(point[0]) > 180 ||
    Math.abs(point[1]) > 90
  )
    throw new GisInputError('Geometri geografis tidak valid');
}
export function sphericalDistance(a: Position, b: Position): number {
  validPoint(a);
  validPoint(b);
  const h =
    Math.sin(radians(b[1] - a[1]) / 2) ** 2 +
    Math.cos(radians(a[1])) *
      Math.cos(radians(b[1])) *
      Math.sin(radians(b[0] - a[0]) / 2) ** 2;
  return (
    2 *
    RADIUS *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function sphericalArea(geometry: Polygon | MultiPolygon): number {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const ringArea = (ring: Position[]) => {
    if (
      ring.length < 4 ||
      ring[0][0] !== ring.at(-1)![0] ||
      ring[0][1] !== ring.at(-1)![1]
    )
      throw new GisInputError('Ring polygon harus tertutup');
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      validPoint(ring[i]);
      validPoint(ring[i + 1]);
      let delta = radians(ring[i + 1][0] - ring[i][0]);
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      sum +=
        delta *
        (2 + Math.sin(radians(ring[i][1])) + Math.sin(radians(ring[i + 1][1])));
    }
    return (Math.abs(sum) * RADIUS ** 2) / 2;
  };
  return polygons.reduce(
    (total, rings) =>
      total +
      Math.max(
        0,
        ringArea(rings[0]) -
          rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0),
      ),
    0,
  );
}
function inRing(
  point: [number, number],
  ring: Position[],
): 'inside' | 'outside' | 'boundary' {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j],
      [x2, y2] = ring[i],
      [x, y] = point;
    const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
    if (
      Math.abs(cross) < 1e-12 &&
      x >= Math.min(x1, x2) - 1e-12 &&
      x <= Math.max(x1, x2) + 1e-12 &&
      y >= Math.min(y1, y2) - 1e-12 &&
      y <= Math.max(y1, y2) + 1e-12
    )
      return 'boundary';
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1)
      inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}
export function pointInPolygon(
  point: [number, number],
  geometry: Polygon | MultiPolygon,
): boolean {
  validPoint(point);
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    (rings) =>
      inRing(point, rings[0]) !== 'outside' &&
      !rings.slice(1).some((ring) => inRing(point, ring) !== 'outside'),
  );
}
export function selectVectorIds(
  point: [number, number],
  data: FeatureCollection<Polygon | MultiPolygon>,
): (string | number)[] {
  return data.features
    .filter(
      (feature) =>
        feature.id !== undefined && pointInPolygon(point, feature.geometry),
    )
    .map((feature) => feature.id!);
}
