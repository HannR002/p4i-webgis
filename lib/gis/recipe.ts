import type {
  Dataset,
  GisContext,
  MapAction,
  MapRecipe,
  MapLegend,
} from './contracts';
import { DEMO_AOIS, emptyRecipe } from './catalog';
import { bandRange, getBand } from './raster';
import { GisInputError, parseMapAction, parseRecipe } from './validation';

export class GisPermissionError extends Error {}
export function canAccessDataset(d: Dataset, context: GisContext): boolean {
  return (
    d.accessTier === 'public' ||
    context.role === 'super_admin' ||
    context.role === 'managerial_analyst' ||
    (context.role === 'b2b_client' &&
      !!d.projectId &&
      context.entitledProjectIds.includes(d.projectId))
  );
}
export function assertRecipeAccess(
  recipe: MapRecipe,
  catalog: readonly Dataset[],
  context: GisContext,
): void {
  for (const l of recipe.layers) {
    const d = catalog.find((d) => d.id === l.datasetId);
    if (!d || !canAccessDataset(d, context))
      throw new GisPermissionError('Akses dataset ditolak');
  }
}
export function legendFor(
  recipe: MapRecipe,
  catalog: readonly Dataset[],
): MapLegend[] {
  return recipe.layers
    .filter((l) => l.visible)
    .map((l) => {
      const d = catalog.find((d) => d.id === l.datasetId);
      if (!d) throw new GisInputError('Dataset tidak dikenal');
      const entries =
        l.type === 'raster' && 'palette' in l.style
          ? (d.raster?.classes?.map((c, i) => ({
              label: c.label,
              color:
                'palette' in l.style
                  ? l.style.palette[i % l.style.palette.length]
                  : c.color,
            })) ??
            l.style.palette.map((color, i, a) => ({
              color,
              label: `${(l.style && 'min' in l.style ? l.style.min + ((l.style.max - l.style.min) * i) / (a.length - 1) : 0).toFixed(1)} ${d.raster ? getBand(d.raster, 'band' in l.style ? l.style.band : undefined).unit : ''}`,
            })))
          : [
              {
                label: d.title,
                color: 'color' in l.style ? l.style.color : '#0f766e',
              },
            ];
      return { datasetId: d.id, title: d.title, entries };
    });
}
export function applyMapAction(
  input: MapRecipe,
  rawAction: unknown,
  catalog: readonly Dataset[],
  context: GisContext,
): MapRecipe {
  let recipe = parseRecipe(input, catalog);
  assertRecipeAccess(recipe, catalog, context);
  const action = parseMapAction(rawAction);
  if (action.tool === 'createMap')
    recipe = { ...emptyRecipe(), title: action.title };
  else if (action.tool === 'setMapTitle') recipe.title = action.title;
  else if (action.tool === 'setBasemap') recipe.basemap = action.basemap;
  else if (action.tool === 'setViewport')
    recipe.viewport = { center: action.center, zoom: action.zoom };
  else if (action.tool === 'addLayer') {
    const d = catalog.find((d) => d.id === action.datasetId);
    if (!d || d.status === 'unavailable')
      throw new GisInputError('Dataset belum tersedia');
    if (!canAccessDataset(d, context))
      throw new GisPermissionError('Akses dataset ditolak');
    if (!recipe.layers.some((l) => l.datasetId === d.id))
      recipe.layers.push({
        id: `layer-${d.id}`,
        datasetId: d.id,
        type: d.type,
        visible: true,
        opacity: d.type === 'raster' ? 0.6 : 0.8,
        style:
          d.type === 'vector'
            ? { color: '#0f766e', fillColor: '#5eead4', weight: 2 }
            : {
                palette: d.raster?.classes?.map((c) => c.color) ?? [
                  '#eff6ff',
                  '#3b82f6',
                  '#1e3a8a',
                ],
                band: d.raster?.bands[0].id,
                min: d.raster ? bandRange(d.raster)[0] : 0,
                max: d.raster ? bandRange(d.raster)[1] : 100,
              },
      });
  } else if (action.tool === 'generateLegend')
    recipe.legend = legendFor(recipe, catalog);
  else if (action.tool === 'selectAOI') {
    // Fixture IDs are identities, never browser-supplied geometry.
    const aoi = DEMO_AOIS.find((known) => known.id === action.aoiId);
    if (
      !aoi ||
      !catalog.some((d) => d.id === 'demo-boundaries' && d.status === 'demo')
    )
      throw new GisInputError('AOI tidak dikenal atau belum tersedia');
    recipe.aoi = { ...aoi };
    recipe.viewport = {
      center: [-1.6, action.aoiId.endsWith('west') ? 103.57 : 103.67],
      zoom: 13,
    };
  } else {
    const index = recipe.layers.findIndex((l) => l.id === action.layerId);
    if (index < 0) throw new GisInputError('Layer tidak dikenal');
    const layer = recipe.layers[index];
    switch (action.tool) {
      case 'removeLayer':
        recipe.layers.splice(index, 1);
        break;
      case 'toggleLayer':
        layer.visible = action.visible;
        break;
      case 'setLayerOpacity':
        layer.opacity = action.opacity;
        break;
      case 'reorderLayer': {
        const [l] = recipe.layers.splice(index, 1);
        recipe.layers.splice(
          Math.min(action.index, recipe.layers.length),
          0,
          l,
        );
        break;
      }
      case 'styleVectorLayer':
        if (layer.type !== 'vector')
          throw new GisInputError('Layer bukan vektor');
        layer.style = action.style;
        break;
      case 'styleRasterLayer':
        if (layer.type !== 'raster')
          throw new GisInputError('Layer bukan raster');
        layer.style = action.style;
        break;
      case 'zoomToLayer': {
        const d = catalog.find((d) => d.id === layer.datasetId);
        if (!d) throw new GisInputError('Dataset tidak dikenal');
        const [w, s, e, n] = d.bounds;
        recipe.viewport = { center: [(s + n) / 2, (w + e) / 2], zoom: 12 };
        break;
      }
    }
  }
  recipe.legend = legendFor(recipe, catalog);
  return parseRecipe(recipe, catalog);
}
export function executeMapPlan(
  recipe: MapRecipe,
  actions: readonly MapAction[],
  catalog: readonly Dataset[],
  context: GisContext,
): MapRecipe {
  if (actions.length > 30) throw new GisInputError('Terlalu banyak tindakan');
  // Atomic: a failed action cannot leave half a plan applied.
  return actions.reduce(
    (r, a) => applyMapAction(r, a, catalog, context),
    recipe,
  );
}
