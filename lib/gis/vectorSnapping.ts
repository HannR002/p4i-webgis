import { geometryPaths, type LonLat, type SketchLayer } from './vectorEditing';
export interface SnapSettings {
  enabled: boolean;
  vertices: boolean;
  segments: boolean;
  tolerance: number;
}
export interface ScreenPoint {
  x: number;
  y: number;
}
export interface SnapTarget {
  coordinate: LonLat;
  kind: 'vertex' | 'segment';
  featureId: string;
  distance: number;
}
/** Only validated, visible session sketch layers. Catalog/private provider geometry is never considered. */
export function snapCoordinate(
  coordinate: LonLat,
  layers: SketchLayer[],
  settings: SnapSettings,
  project: (p: LonLat) => ScreenPoint,
  unproject: (p: ScreenPoint) => LonLat,
  excludeFeatureId?: string,
): SnapTarget | null {
  if (
    !settings.enabled ||
    !Number.isFinite(settings.tolerance) ||
    settings.tolerance < 2 ||
    settings.tolerance > 30
  )
    return null;
  const cursor = project(coordinate);
  let best: SnapTarget | null = null;
  const offer = (
    p: ScreenPoint,
    kind: SnapTarget['kind'],
    featureId: string,
    exact?: LonLat,
  ) => {
    const distance = Math.hypot(p.x - cursor.x, p.y - cursor.y);
    if (
      distance <= settings.tolerance &&
      (!best ||
        (kind === 'vertex' && best.kind === 'segment') ||
        (kind === best.kind && distance < best.distance))
    )
      best = { coordinate: exact ?? unproject(p), kind, featureId, distance };
  };
  for (const layer of layers.filter((l) => l.visible && l.opacity > 0))
    for (const feature of layer.data.features) {
      if (feature.id === excludeFeatureId) continue;
      for (const path of geometryPaths(feature.geometry)) {
        const points = path.coordinates.map(project);
        if (settings.vertices)
          points.forEach((p, i) =>
            offer(p, 'vertex', feature.id, path.coordinates[i]),
          );
        if (settings.segments)
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
              b = points[i],
              dx = b.x - a.x,
              dy = b.y - a.y;
            const denominator = dx * dx + dy * dy;
            if (!denominator) continue;
            const t = Math.max(
              0,
              Math.min(
                1,
                ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / denominator,
              ),
            );
            offer({ x: a.x + t * dx, y: a.y + t * dy }, 'segment', feature.id);
          }
      }
    }
  return best;
}
