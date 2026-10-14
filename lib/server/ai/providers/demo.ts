import type { GisPlanner } from '../contracts';
import { createControlledDemoProvider, legacyActions } from './controlledDemo';
import {
  parseGISExecutionPlan,
  datasetInfo,
} from '../../../gis/copilotValidation';
import { canAccessDataset } from '../../../gis/recipe';
import { DEMO_AOIS } from '../../../gis/catalog';
export function createDemoPlanner(): GisPlanner {
  return {
    async plan(prompt, recipe, catalog, context) {
      const visible = catalog.filter((d) => canAccessDataset(d, context));
      const provider = createControlledDemoProvider();
      const plan = parseGISExecutionPlan(
        await provider.plan({
          prompt,
          recipe,
          catalog: visible.map(datasetInfo),
          configurations: [],
          aois: visible.some(
            (d) => d.id === 'demo-boundaries' && d.status === 'demo',
          )
            ? DEMO_AOIS
            : [],
        }),
        provider,
      );
      return {
        provider: 'deterministic-demo',
        intent: plan.intent,
        message: plan.steps.some((s) => s.action.tool === 'summarizeCurrentMap')
          ? `Peta “${recipe.title}” memiliki ${recipe.layers.length} layer. AOI: ${recipe.aoi?.name ?? 'belum dipilih'}. Data contoh bukan pengukuran nyata.`
          : plan.message,
        actions: legacyActions(plan),
        unavailable:
          plan.resolution === 'ready'
            ? plan.limitations
            : [plan.message, ...plan.limitations],
        sources: visible
          .filter((d) =>
            plan.steps.some(
              (s) => 'datasetId' in s.action && s.action.datasetId === d.id,
            ),
          )
          .map((d) => `${d.title} · ${d.source} · ${d.version}`),
      };
    },
  };
}
