import type {
  Feature,
  Point,
  Polygon,
  LineString,
  MultiLineString,
  MultiPolygon,
} from 'geojson';
import type { MapRecipe } from './contracts';
import { GisInputError, record, text, finite, color } from './validation';

export type LonLat = [number, number];
export type SketchGeometry =
  Point | LineString | Polygon | MultiLineString | MultiPolygon;
export interface SketchStyle {
  color: string;
  fillColor: string;
  weight: number;
  fillOpacity: number;
  radius: number;
  strokeOpacity?: number;
  dash?: 'solid' | 'dash' | 'dot';
}
export interface SketchProperties {
  name: string;
  description: string;
  attributes: Record<string, string | number | boolean>;
  style?: SketchStyle;
}
export type SketchFeature = Feature<SketchGeometry, SketchProperties> & {
  id: string;
};
export interface SketchLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  style: SketchStyle;
  data: { type: 'FeatureCollection'; features: SketchFeature[] };
}
export const DEFAULT_SKETCH_STYLE: SketchStyle = {
  color: '#0f766e',
  fillColor: '#5eead4',
  weight: 2,
  fillOpacity: 0.6,
  radius: 7,
};
export const VECTOR_TOOLS = [
  'createFeature',
  'importVectorLayer',
  'editLayerField',
  'inspectVectorTable',
  'zoomVectorFeatures',
  'createVectorLayer',
  'updateVectorLayer',
  'createPoint',
  'createMultiplePoints',
  'createPolygon',
  'createPolygonFromSelectedPoints',
  'updateFeatureGeometry',
  'updateFeatureProperties',
  'styleFeature',
  'deleteFeature',
] as const;
export type VectorAction =
  | {
      tool: 'createFeature';
      layerId: string;
      name: string;
      geometry: SketchGeometry;
      style?: SketchStyle;
    }
  | {
      tool: 'importVectorLayer';
      name: string;
      collection: unknown;
      wgs84: true;
    }
  | {
      tool: 'editLayerField';
      layerId: string;
      field: string;
      value?: string | number | boolean;
      remove?: boolean;
    }
  | { tool: 'inspectVectorTable'; layerId: string }
  | { tool: 'zoomVectorFeatures'; layerId: string; featureIds: string[] }
  | { tool: 'createVectorLayer'; name: string }
  | {
      tool: 'updateVectorLayer';
      layerId: string;
      name?: string;
      visible?: boolean;
      opacity?: number;
      style?: SketchStyle;
      index?: number;
      remove?: boolean;
    }
  | {
      tool: 'createPoint';
      layerId: string;
      name: string;
      coordinates: LonLat;
      style?: SketchStyle;
    }
  | {
      tool: 'createMultiplePoints';
      layerId: string;
      points: { name: string; coordinates: LonLat; style?: SketchStyle }[];
    }
  | {
      tool: 'createPolygon';
      layerId: string;
      name: string;
      vertices: LonLat[];
      style?: SketchStyle;
    }
  | {
      tool: 'createPolygonFromSelectedPoints';
      layerId: string;
      name: string;
      pointIds: string[];
      style?: SketchStyle;
    }
  | {
      tool: 'updateFeatureGeometry';
      layerId: string;
      featureId: string;
      geometry: SketchGeometry;
    }
  | {
      tool: 'updateFeatureProperties';
      layerId: string;
      featureId: string;
      name: string;
      description: string;
      attributes: Record<string, string | number | boolean>;
    }
  | {
      tool: 'styleFeature';
      layerId: string;
      featureId: string;
      style: SketchStyle;
    }
  | { tool: 'deleteFeature'; layerId: string; featureId: string };
function fail(): never {
  throw new GisInputError(
    'Geometri/editor vektor tidak valid atau melebihi batas',
  );
}
function exact(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).some((k) => !keys.includes(k))) fail();
}
export function lonLat(v: unknown): LonLat {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !finite(v[0], -180, 180) ||
    !finite(v[1], -90, 90)
  )
    fail();
  return [v[0], v[1]];
}
export function sketchStyle(v: unknown): SketchStyle {
  if (
    !record(v) ||
    !color(v.color) ||
    !color(v.fillColor) ||
    !finite(v.weight, 0, 10) ||
    !finite(v.fillOpacity, 0, 1) ||
    !finite(v.radius, 2, 20)
  )
    fail();
  exact(v, [
    'color',
    'fillColor',
    'weight',
    'fillOpacity',
    'radius',
    'strokeOpacity',
    'dash',
  ]);
  if (
    (v.strokeOpacity !== undefined && !finite(v.strokeOpacity, 0, 1)) ||
    (v.dash !== undefined && !['solid', 'dash', 'dot'].includes(String(v.dash)))
  )
    fail();
  return { ...v } as unknown as SketchStyle;
}
const cross = (a: LonLat, b: LonLat, c: LonLat) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function touches(a: LonLat, b: LonLat, c: LonLat, d: LonLat) {
  const on = (p: LonLat, q: LonLat, r: LonLat) =>
    Math.abs(cross(p, q, r)) < 1e-12 &&
    r[0] >= Math.min(p[0], q[0]) - 1e-12 &&
    r[0] <= Math.max(p[0], q[0]) + 1e-12 &&
    r[1] >= Math.min(p[1], q[1]) - 1e-12 &&
    r[1] <= Math.max(p[1], q[1]) + 1e-12;
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function polygonGeometry(v: unknown): Polygon {
  if (!Array.isArray(v) || v.length < 3 || v.length > 129) fail();
  const ring = v.map(lonLat);
  if (JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1))) ring.pop();
  if (
    ring.length < 3 ||
    ring.length > 128 ||
    new Set(ring.map((p) => JSON.stringify(p))).size !== ring.length
  )
    fail();
  // Single small WGS84 exterior ring. Antimeridian/polar shapes require a future projected editor.
  if (
    ring.some((p, i) => Math.abs(p[0] - ring[(i + 1) % ring.length][0]) > 180)
  )
    fail();
  for (let i = 0; i < ring.length; i++) {
    const prev = ring[(i + ring.length - 1) % ring.length],
      next = ring[(i + 1) % ring.length];
    if (
      Math.abs(cross(prev, ring[i], next)) < 1e-12 &&
      (prev[0] - ring[i][0]) * (next[0] - ring[i][0]) +
        (prev[1] - ring[i][1]) * (next[1] - ring[i][1]) >=
        0
    )
      fail();
    for (let j = i + 1; j < ring.length; j++)
      if (
        j !== i + 1 &&
        !(i === 0 && j === ring.length - 1) &&
        touches(
          ring[i],
          ring[(i + 1) % ring.length],
          ring[j],
          ring[(j + 1) % ring.length],
        )
      )
        fail();
  }
  if (
    Math.abs(
      ring.reduce((sum, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0),
    ) < 1e-12
  )
    fail();
  return { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] };
}
function line(v: unknown): LonLat[] {
  if (!Array.isArray(v) || v.length < 2 || v.length > 128) fail();
  const points = v.map(lonLat);
  for (let i = 1; i < points.length; i++) {
    if (
      JSON.stringify(points[i]) === JSON.stringify(points[i - 1]) ||
      Math.abs(points[i][0] - points[i - 1][0]) > 180
    )
      fail();
  }
  return points;
}
function inside(p: LonLat, ring: number[][]): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function ringTouches(a: number[][], b: number[][]): boolean {
  return a
    .slice(1)
    .some((p, i) =>
      b
        .slice(1)
        .some((q, j) =>
          touches(lonLat(a[i]), lonLat(p), lonLat(b[j]), lonLat(q)),
        ),
    );
}
function rings(v: unknown): number[][][] {
  if (!Array.isArray(v) || !v.length || v.length > 8) fail();
  const result = v.map((r) => {
    if (
      !Array.isArray(r) ||
      r.length < 4 ||
      JSON.stringify(r[0]) !== JSON.stringify(r.at(-1))
    )
      fail();
    return polygonGeometry(r).coordinates[0];
  });
  for (let i = 1; i < result.length; i++) {
    if (
      !inside(lonLat(result[i][0]), result[0]) ||
      ringTouches(result[i], result[0])
    )
      fail();
    for (let j = 1; j < i; j++)
      if (
        ringTouches(result[i], result[j]) ||
        inside(lonLat(result[i][0]), result[j]) ||
        inside(lonLat(result[j][0]), result[i])
      )
        fail();
  }
  return result;
}
export function sketchGeometry(v: unknown): SketchGeometry {
  if (!record(v)) fail();
  exact(v, ['type', 'coordinates']);
  let g: SketchGeometry;
  if (v.type === 'Point')
    g = { type: 'Point', coordinates: lonLat(v.coordinates) };
  else if (v.type === 'LineString')
    g = { type: 'LineString', coordinates: line(v.coordinates) };
  // Legacy single-ring drafts accepted unclosed rings; normalization is retained only here.
  else if (v.type === 'Polygon') {
    if (Array.isArray(v.coordinates) && v.coordinates.length === 1)
      g = polygonGeometry(v.coordinates[0]);
    else g = { type: 'Polygon', coordinates: rings(v.coordinates) };
  } else if (
    (v.type === 'MultiLineString' || v.type === 'MultiPolygon') &&
    Array.isArray(v.coordinates) &&
    v.coordinates.length > 0 &&
    v.coordinates.length <= 8
  ) {
    if (v.type === 'MultiLineString')
      g = { type: 'MultiLineString', coordinates: v.coordinates.map(line) };
    else {
      const parts = v.coordinates.map(rings);
      // Conservative disjoint exteriors: nested/touching components are rejected, including islands in holes.
      for (let i = 0; i < parts.length; i++)
        for (let j = 0; j < i; j++)
          if (
            ringTouches(parts[i][0], parts[j][0]) ||
            inside(lonLat(parts[i][0][0]), parts[j][0]) ||
            inside(lonLat(parts[j][0][0]), parts[i][0])
          )
            fail();
      g = { type: 'MultiPolygon', coordinates: parts };
    }
  } else return fail();
  if (geometryPaths(g).reduce((n, p) => n + p.coordinates.length, 0) > 512)
    fail();
  return g;
}
export function geometryPaths(
  g: SketchGeometry,
): { path: number[]; coordinates: LonLat[]; closed: boolean }[] {
  const item = (path: number[], coordinates: number[][], closed: boolean) => ({
    path,
    coordinates: coordinates.map(lonLat),
    closed,
  });
  switch (g.type) {
    case 'Point':
      return [item([], [g.coordinates], false)];
    case 'LineString':
      return [item([], g.coordinates, false)];
    case 'Polygon':
      return g.coordinates.map((r, i) => item([i], r, true));
    case 'MultiLineString':
      return g.coordinates.map((r, i) => item([i], r, false));
    case 'MultiPolygon':
      return g.coordinates.flatMap((p, i) =>
        p.map((r, j) => item([i, j], r, true)),
      );
  }
}
export function editVertex(
  g: SketchGeometry,
  path: number[],
  index: number,
  operation: 'move' | 'insert' | 'remove',
  coordinate?: LonLat,
): SketchGeometry {
  const found = geometryPaths(g).find(
    (p) => JSON.stringify(p.path) === JSON.stringify(path),
  );
  if (
    !found ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= found.coordinates.length - (found.closed ? 1 : 0)
  )
    fail();
  const points = structuredClone(found.coordinates);
  if (found.closed) points.pop();
  if (g.type === 'Point' && operation !== 'move') fail();
  if (operation === 'remove') points.splice(index, 1);
  else if (operation === 'move') points[index] = lonLat(coordinate);
  else {
    const next = points[(index + 1) % points.length];
    if (!found.closed && index === points.length - 1) fail();
    points.splice(
      index + 1,
      0,
      coordinate
        ? lonLat(coordinate)
        : [(points[index][0] + next[0]) / 2, (points[index][1] + next[1]) / 2],
    );
  }
  if (found.closed && points.length) points.push([...points[0]]);
  const clone = structuredClone(g);
  if (clone.type === 'Point') clone.coordinates = points[0];
  else if (clone.type === 'LineString') clone.coordinates = points;
  else if (clone.type === 'Polygon' || clone.type === 'MultiLineString')
    clone.coordinates[path[0]] = points;
  else clone.coordinates[path[0]][path[1]] = points;
  return sketchGeometry(clone);
}
export function importGeoJSON(
  v: unknown,
  wgs84: unknown,
): { geometry: SketchGeometry; properties: SketchProperties }[] {
  if (
    wgs84 !== true ||
    !record(v) ||
    v.type !== 'FeatureCollection' ||
    !Array.isArray(v.features) ||
    !v.features.length ||
    v.features.length > 100 ||
    new TextEncoder().encode(JSON.stringify(v)).length > 65536
  )
    fail();
  exact(v, ['type', 'features']);
  const ids = new Set<string>();
  return v.features.map((f, i) => {
    if (!record(f) || f.type !== 'Feature' || !record(f.properties)) fail();
    exact(f, ['type', 'id', 'geometry', 'properties']);
    if (f.id !== undefined) {
      if (
        !(typeof f.id === 'number' && Number.isSafeInteger(f.id)) &&
        !(typeof f.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(f.id))
      )
        fail();
      const id = String(f.id);
      if (ids.has(id) || ['__proto__', 'prototype', 'constructor'].includes(id))
        fail();
      ids.add(id);
    }
    const geometry = sketchGeometry(f.geometry);
    // Imports must already have closed rings; only old draft loading has a closure compatibility exception.
    if (
      record(f.geometry) &&
      (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
    ) {
      const raw = f.geometry.coordinates;
      if (JSON.stringify(raw) !== JSON.stringify(geometry.coordinates)) fail();
    }
    const p = f.properties;
    const props =
      'attributes' in p
        ? properties(p)
        : properties({
            name: p.name ?? `Objek ${i + 1}`,
            description: p.description ?? '',
            attributes: Object.fromEntries(
              Object.entries(p).filter(
                ([k]) => !['name', 'description'].includes(k),
              ),
            ),
          });
    return { geometry, properties: props };
  });
}
function properties(v: unknown): SketchProperties {
  if (
    !record(v) ||
    !text(v.name, 80) ||
    typeof v.description !== 'string' ||
    v.description.length > 500 ||
    !record(v.attributes) ||
    Object.keys(v.attributes).length > 12
  )
    fail();
  exact(v, ['name', 'description', 'attributes', 'style']);
  for (const [k, val] of Object.entries(v.attributes))
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(k) ||
      ['constructor', 'prototype', '__proto__'].includes(k) ||
      !(
        typeof val === 'boolean' ||
        finite(val, -1e12, 1e12) ||
        (typeof val === 'string' && val.length <= 200)
      )
    )
      fail();
  return {
    name: v.name,
    description: v.description,
    attributes: { ...v.attributes } as SketchProperties['attributes'],
    ...(v.style === undefined ? {} : { style: sketchStyle(v.style) }),
  };
}
export function parseVectorAction(v: unknown): VectorAction {
  if (
    !record(v) ||
    !VECTOR_TOOLS.includes(v.tool as (typeof VECTOR_TOOLS)[number])
  )
    fail();
  if (v.tool === 'importVectorLayer') {
    exact(v, ['tool', 'name', 'collection', 'wgs84']);
    if (!text(v.name, 80)) fail();
    importGeoJSON(v.collection, v.wgs84);
    return structuredClone(v) as VectorAction;
  }
  if (v.tool === 'createVectorLayer') {
    exact(v, ['tool', 'name']);
    if (!text(v.name, 80)) fail();
    return { tool: v.tool, name: v.name };
  }
  if (!text(v.layerId, 100)) fail();
  if (v.tool === 'createFeature') {
    exact(v, ['tool', 'layerId', 'name', 'geometry', 'style']);
    if (!text(v.name, 80)) fail();
    sketchGeometry(v.geometry);
    if (v.style !== undefined) sketchStyle(v.style);
  } else if (v.tool === 'editLayerField') {
    exact(v, ['tool', 'layerId', 'field', 'value', 'remove']);
    if (
      typeof v.field !== 'string' ||
      (v.remove !== undefined && typeof v.remove !== 'boolean')
    )
      fail();
    properties({
      name: 'Field',
      description: '',
      attributes: { [v.field]: v.remove ? '' : v.value },
    });
  } else if (v.tool === 'inspectVectorTable') exact(v, ['tool', 'layerId']);
  else if (v.tool === 'zoomVectorFeatures') {
    exact(v, ['tool', 'layerId', 'featureIds']);
    if (
      !Array.isArray(v.featureIds) ||
      !v.featureIds.length ||
      v.featureIds.length > 100 ||
      !v.featureIds.every((id) => text(id, 100)) ||
      new Set(v.featureIds).size !== v.featureIds.length
    )
      fail();
  } else if (v.tool === 'updateVectorLayer') {
    exact(v, [
      'tool',
      'layerId',
      'name',
      'visible',
      'opacity',
      'style',
      'index',
      'remove',
    ]);
    if (
      (v.name !== undefined && !text(v.name, 80)) ||
      (v.visible !== undefined && typeof v.visible !== 'boolean') ||
      (v.opacity !== undefined && !finite(v.opacity, 0, 1)) ||
      (v.index !== undefined &&
        (!finite(v.index, 0, 7) || !Number.isInteger(v.index))) ||
      (v.remove !== undefined && typeof v.remove !== 'boolean')
    )
      fail();
    if (v.style !== undefined) sketchStyle(v.style);
  } else if (
    [
      'createPoint',
      'createMultiplePoints',
      'createPolygon',
      'createPolygonFromSelectedPoints',
    ].includes(String(v.tool))
  ) {
    if (v.tool === 'createMultiplePoints') {
      exact(v, ['tool', 'layerId', 'points']);
      if (!Array.isArray(v.points) || !v.points.length || v.points.length > 50)
        fail();
      for (const p of v.points) {
        if (!record(p)) fail();
        exact(p, ['name', 'coordinates', 'style']);
        parseVectorAction({ tool: 'createPoint', layerId: v.layerId, ...p });
      }
    } else {
      const key =
        v.tool === 'createPoint'
          ? 'coordinates'
          : v.tool === 'createPolygon'
            ? 'vertices'
            : 'pointIds';
      exact(v, ['tool', 'layerId', 'name', key, 'style']);
      if (!text(v.name, 80)) fail();
      if (v.tool === 'createPoint') lonLat(v.coordinates);
      else if (v.tool === 'createPolygon') polygonGeometry(v.vertices);
      else if (
        !Array.isArray(v.pointIds) ||
        v.pointIds.length < 3 ||
        v.pointIds.length > 128 ||
        !v.pointIds.every((id) => text(id, 100)) ||
        new Set(v.pointIds).size !== v.pointIds.length
      )
        fail();
      if (v.style !== undefined) sketchStyle(v.style);
    }
  } else {
    if (!text(v.featureId, 100)) fail();
    if (v.tool === 'updateFeatureGeometry') {
      exact(v, ['tool', 'layerId', 'featureId', 'geometry']);
      sketchGeometry(v.geometry);
    } else if (v.tool === 'updateFeatureProperties') {
      exact(v, [
        'tool',
        'layerId',
        'featureId',
        'name',
        'description',
        'attributes',
      ]);
      properties({
        name: v.name,
        description: v.description,
        attributes: v.attributes,
      });
    } else if (v.tool === 'styleFeature') {
      exact(v, ['tool', 'layerId', 'featureId', 'style']);
      sketchStyle(v.style);
    } else exact(v, ['tool', 'layerId', 'featureId']);
  }
  return structuredClone(v) as VectorAction;
}
export function parseSketchLayers(v: unknown): SketchLayer[] {
  if (
    !Array.isArray(v) ||
    v.length > 8 ||
    new TextEncoder().encode(JSON.stringify(v)).length > 65536
  )
    fail();
  const ids = new Set<string>();
  let count = 0;
  return v.map((l) => {
    if (
      !record(l) ||
      !text(l.id, 100) ||
      !/^local-vector-\d+$/.test(l.id) ||
      ids.has(l.id) ||
      !text(l.name, 80) ||
      typeof l.visible !== 'boolean' ||
      !finite(l.opacity, 0, 1) ||
      !record(l.data) ||
      l.data.type !== 'FeatureCollection' ||
      !Array.isArray(l.data.features)
    )
      fail();
    exact(l, ['id', 'name', 'visible', 'opacity', 'style', 'data']);
    exact(l.data, ['type', 'features']);
    ids.add(l.id);
    const features = l.data.features.map((f): SketchFeature => {
      if (
        ++count > 100 ||
        !record(f) ||
        f.type !== 'Feature' ||
        typeof f.id !== 'string' ||
        !/^local-feature-\d+$/.test(f.id) ||
        ids.has(f.id)
      )
        fail();
      exact(f, ['type', 'id', 'geometry', 'properties']);
      ids.add(f.id);
      return {
        type: 'Feature',
        id: f.id,
        geometry: sketchGeometry(f.geometry),
        properties: properties(f.properties),
      };
    });
    return {
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      style: sketchStyle(l.style),
      data: { type: 'FeatureCollection', features },
    };
  });
}
// Deterministic session-only IDs allow preflight/execution equality. They are never database identities.
function nextId(prefix: string, ids: string[]) {
  let n = 1;
  while (ids.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
export function applyVectorAction(
  recipe: MapRecipe,
  action: VectorAction,
): void {
  const layers = (recipe.sketchLayers ??= []);
  if (
    action.tool === 'createVectorLayer' ||
    action.tool === 'importVectorLayer'
  ) {
    layers.push({
      id: nextId(
        'local-vector-',
        layers.map((l) => l.id),
      ),
      name: action.name,
      visible: true,
      opacity: 1,
      style: { ...DEFAULT_SKETCH_STYLE },
      data: { type: 'FeatureCollection', features: [] },
    });
    if (action.tool === 'importVectorLayer') {
      const target = layers.at(-1)!;
      for (const item of importGeoJSON(action.collection, action.wgs84))
        target.data.features.push({
          type: 'Feature',
          id: nextId(
            'local-feature-',
            layers.flatMap((l) => l.data.features.map((f) => f.id)),
          ),
          ...item,
        });
    }
    return;
  }
  const layer = layers.find((l) => l.id === action.layerId);
  if (!layer) throw new GisInputError('Layer lokal tidak dikenal');
  if (action.tool === 'inspectVectorTable') return;
  if (action.tool === 'zoomVectorFeatures') {
    const points = action.featureIds.flatMap((id) => {
      const f = layer.data.features.find((f) => f.id === id);
      if (!f) fail();
      return geometryPaths(f.geometry).flatMap((p) => p.coordinates);
    });
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const span = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
    recipe.viewport = {
      center: [
        (Math.min(...ys) + Math.max(...ys)) / 2,
        (Math.min(...xs) + Math.max(...xs)) / 2,
      ],
      zoom: Math.max(
        2,
        Math.min(18, Math.floor(Math.log2(180 / Math.max(span, 0.001)))),
      ),
    };
    return;
  }
  if (action.tool === 'editLayerField') {
    for (const f of layer.data.features) {
      const attrs = f.properties.attributes;
      if (action.remove) delete attrs[action.field];
      else if (action.field in attrs) {
        if (typeof attrs[action.field] !== typeof action.value) fail();
      } else attrs[action.field] = action.value!;
    }
    return;
  }
  if (action.tool === 'updateVectorLayer') {
    if (action.remove) layers.splice(layers.indexOf(layer), 1);
    else {
      for (const k of ['name', 'visible', 'opacity', 'style'] as const)
        if (action[k] !== undefined) Object.assign(layer, { [k]: action[k] });
      if (action.index !== undefined) {
        layers.splice(layers.indexOf(layer), 1);
        layers.splice(action.index, 0, layer);
      }
    }
    return;
  }
  const add = (name: string, geometry: SketchGeometry, style?: SketchStyle) =>
    layer.data.features.push({
      type: 'Feature',
      id: nextId(
        'local-feature-',
        layers.flatMap((l) => l.data.features.map((f) => f.id)),
      ),
      geometry,
      properties: {
        name,
        description: '',
        attributes: {},
        ...(style ? { style } : {}),
      },
    });
  if (action.tool === 'createFeature')
    add(action.name, sketchGeometry(action.geometry), action.style);
  else if (action.tool === 'createPoint')
    add(
      action.name,
      { type: 'Point', coordinates: action.coordinates },
      action.style,
    );
  else if (action.tool === 'createMultiplePoints')
    action.points.forEach((p) =>
      add(p.name, { type: 'Point', coordinates: p.coordinates }, p.style),
    );
  else if (action.tool === 'createPolygon')
    add(action.name, polygonGeometry(action.vertices), action.style);
  else if (action.tool === 'createPolygonFromSelectedPoints') {
    const vertices = action.pointIds.map((id) => {
      const f = layers.flatMap((l) => l.data.features).find((f) => f.id === id);
      if (!f || f.geometry.type !== 'Point')
        throw new GisInputError('Titik pilihan tidak dikenal');
      return lonLat(f.geometry.coordinates);
    });
    add(action.name, polygonGeometry(vertices), action.style);
  } else {
    const f = layer.data.features.find((f) => f.id === action.featureId);
    if (!f) throw new GisInputError('Objek lokal tidak dikenal');
    if (action.tool === 'deleteFeature')
      layer.data.features.splice(layer.data.features.indexOf(f), 1);
    else if (action.tool === 'styleFeature') f.properties.style = action.style;
    else if (action.tool === 'updateFeatureProperties')
      f.properties = {
        ...f.properties,
        ...properties({
          name: action.name,
          description: action.description,
          attributes: action.attributes,
        }),
      };
    else {
      const g = sketchGeometry(action.geometry);
      if (g.type !== f.geometry.type) fail();
      f.geometry = g;
    }
  }
}
