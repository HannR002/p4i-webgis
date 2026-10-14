import type { DeliverableContent } from './contracts';
/** Report layout only: geographic coordinates from the saved provider outline/result, not a GIS computation. */
export function reportMapGeometry(
  content: Pick<DeliverableContent, 'recipe' | 'mapOutline'>,
) {
  const points = content.recipe.analysisResults?.flatMap((r) => r.points) ?? [],
    rings = content.mapOutline?.rings ?? [],
    all = [...points, ...rings.flat()];
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]),
    minX = Math.min(...xs),
    minY = Math.min(...ys),
    dx = Math.max(...xs) - minX || 1,
    dy = Math.max(...ys) - minY || 1;
  const project = ([x, y]: [number, number]): [number, number] => [
    (x - minX) / dx,
    1 - (y - minY) / dy,
  ];
  return {
    points: points.map(project),
    rings: rings.map((r) => r.map(project)),
  };
}
