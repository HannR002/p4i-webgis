import type {
  Dataset,
  GisContext,
  GisPlan,
  MapRecipe,
} from '../../gis/contracts';
export type { AnalysisConfigurationToolRequest } from '../../gis/analysisTools';
export {
  ANALYSIS_CONFIGURATION_TOOLS,
  handleAnalysisConfigurationTool,
} from '../../gis/analysisTools';
export interface AnalysisConfigurationPlannerContext {
  activeConfiguration: MapRecipe['analysisConfiguration'];
  configurations: readonly {
    id: string;
    name: string;
    analysisType: string;
    version: number;
    experimental: true;
  }[];
}
export interface GisPlanner {
  plan(
    prompt: string,
    recipe: MapRecipe,
    catalog: readonly Dataset[],
    context: GisContext,
  ): Promise<GisPlan>;
}
