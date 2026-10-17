import type { Feature, Point, Polygon } from 'geojson';
import type { MapRecipe } from './contracts';
import { GisInputError, record, text, finite, color } from './validation';

export type LonLat = [number, number];
export interface SketchStyle {
  color: string;
  fillColor: string;
  weight: number;
  fillOpacity: number;
  radius: number;
}
export interface SketchProperties {
  name: string;
  description: string;
  attributes: Record<string, string | number | boolean>;
  style?: SketchStyle;
}
export type SketchFeature = Feature<Point | Polygon, SketchProperties> & {
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
      geometry: Point | Polygon;
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
  exact(v, ['color', 'fillColor', 'weight', 'fillOpacity', 'radius']);
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
    if (
      Math.abs(
        cross(
          ring[(i + ring.length - 1) % ring.length],
          ring[i],
          ring[(i + 1) % ring.length],
        ),
      ) < 1e-12
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
  return { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] };
}
export function sketchGeometry(v: unknown): Point | Polygon {
  if (!record(v)) fail();
  exact(v, ['type', 'coordinates']);
  if (v.type === 'Point')
    return { type: 'Point', coordinates: lonLat(v.coordinates) };
  if (
    v.type === 'Polygon' &&
    Array.isArray(v.coordinates) &&
    v.coordinates.length === 1
  )
    return polygonGeometry(v.coordinates[0]);
  return fail();
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
  if (v.tool === 'createVectorLayer') {
    exact(v, ['tool', 'name']);
    if (!text(v.name, 80)) fail();
    return { tool: v.tool, name: v.name };
  }
  if (!text(v.layerId, 100)) fail();
  if (v.tool === 'updateVectorLayer') {
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
  if (action.tool === 'createVectorLayer') {
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
    return;
  }
  const layer = layers.find((l) => l.id === action.layerId);
  if (!layer) throw new GisInputError('Layer lokal tidak dikenal');
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
  const add = (name: string, geometry: Point | Polygon, style?: SketchStyle) =>
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
  if (action.tool === 'createPoint')
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
