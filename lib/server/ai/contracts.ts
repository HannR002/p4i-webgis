import type { Dataset, GisContext, GisPlan, MapRecipe } from '../../gis/contracts';
export interface GisPlanner {
  plan(
    prompt: string,
    recipe: MapRecipe,
    catalog: readonly Dataset[],
    context: GisContext,
  ): Promise<GisPlan>;
}
