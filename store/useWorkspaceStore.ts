import { create } from 'zustand';
import { emptyRecipe } from '../lib/gis/catalog';
import type {
  Dataset,
  GisContext,
  MapRecipe,
  PixelSample,
} from '../lib/gis/contracts';
import {
  applyMapAction,
  assertRecipeAccess,
  executeMapPlan,
  legendFor,
} from '../lib/gis/recipe';
import { parseRecipe } from '../lib/gis/validation';
import type { GISAnalysisConfiguration } from '../lib/gis/analysisContracts';
import { useMapStore } from './useMapStore';
import {
  DEFAULT_PAIRWISE,
  validatePreferenceWeights,
} from '../utils/analysisPreferences';
function syncConfiguration(previous: MapRecipe, next: MapRecipe) {
  const changedWeights =
    JSON.stringify(previous.analysis) !== JSON.stringify(next.analysis);
  if (
    JSON.stringify(previous.analysisConfiguration) ===
      JSON.stringify(next.analysisConfiguration) &&
    !changedWeights
  )
    return;
  const c = next.analysisConfiguration;
  if (c?.analysisType === 'ahp-smce')
    useMapStore.getState().setAHPPreferences(c.parameters.pairwise);
  else if (c?.analysisType === 'wlc')
    useMapStore.getState().setWLCWeights(validatePreferenceWeights(c.weights));
  else if (changedWeights) {
    if (next.analysis) {
      // Old schema-1 recipes may contain rounded weights and no recoverable matrix.
      // Preserve the recipe, normalize its accepted rounded sum only for the runtime store.
      const weights = next.analysis.weights;
      const total = weights.bencana + weights.kesuburan + weights.kepadatan;
      useMapStore.getState().setWLCWeights({
        bencana: weights.bencana / total,
        kesuburan: weights.kesuburan / total,
        kepadatan: weights.kepadatan / total,
      });
    } else useMapStore.getState().setAHPPreferences(DEFAULT_PAIRWISE);
  }
}

interface VectorEditorState {
  vectorMode: 'off' | 'select' | 'point' | 'polygon';
  vectorLayerId: string;
  selectedVectorIds: string[];
  vectorVertices: [number, number][];
  vectorError: string | null;
}
interface WorkspaceState extends VectorEditorState {
  setVectorEditor: (value: Partial<VectorEditorState>) => void;
  recipe: MapRecipe;
  catalog: Dataset[];
  mode: 'loading' | 'demo' | 'unavailable';
  context: GisContext;
  error: string | null;
  past: MapRecipe[];
  future: MapRecipe[];
  log: string[];
  samples: PixelSample[];
  analysisDraft: GISAnalysisConfiguration | null;
  setAnalysisDraft: (draft: GISAnalysisConfiguration | null) => void;
  configure: (
    catalog: Dataset[],
    mode: 'demo' | 'unavailable',
    context: GisContext,
  ) => void;
  action: (action: unknown) => void;
  replace: (recipe: unknown, label: string, expectedRecipe?: MapRecipe) => void;
  undo: () => void;
  redo: () => void;
  setSamples: (samples: PixelSample[]) => void;
  trackViewport: (center: [number, number], zoom: number) => void;
  openTemplate: (title: string, ids: readonly string[]) => void;
}
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  recipe: emptyRecipe(),
  vectorMode: 'off',
  vectorLayerId: '',
  selectedVectorIds: [],
  vectorVertices: [],
  vectorError: null,
  setVectorEditor: (value) => set(value),
  catalog: [],
  mode: 'loading',
  context: { role: 'guest', entitledProjectIds: [] },
  past: [],
  future: [],
  log: [],
  samples: [],
  analysisDraft: null,
  setAnalysisDraft: (analysisDraft) => set({ analysisDraft }),
  error: null,
  configure: (catalog, mode, context) => set({ catalog, mode, context }),
  replace: (input, label, expectedRecipe) => {
    const s = get();
    if (expectedRecipe && s.recipe !== expectedRecipe)
      throw new Error(
        'Peta berubah saat permintaan diproses. Minta rencana baru.',
      );
    const recipe = parseRecipe(input, s.catalog);
    assertRecipeAccess(recipe, s.catalog, s.context);
    recipe.legend = legendFor(recipe, s.catalog);
    syncConfiguration(s.recipe, recipe);
    set({
      recipe,
      past: [...s.past, s.recipe].slice(-30),
      future: [],
      log: [...s.log, label].slice(-50),
      samples: [],
    });
  },
  action: (action) => {
    const s = get();
    get().replace(
      applyMapAction(s.recipe, action, s.catalog, s.context),
      'Perubahan sesi peta',
    );
  },
  undo: () => {
    const s = get();
    const previous = s.past.at(-1);
    if (previous) {
      syncConfiguration(s.recipe, previous);
      set({
        recipe: previous,
        past: s.past.slice(0, -1),
        future: [s.recipe, ...s.future].slice(0, 30),
        samples: [],
        log: [...s.log, 'Undo'].slice(-50),
      });
    }
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (next) {
      syncConfiguration(s.recipe, next);
      set({
        recipe: next,
        past: [...s.past, s.recipe].slice(-30),
        future: s.future.slice(1),
        samples: [],
        log: [...s.log, 'Redo'].slice(-50),
      });
    }
  },
  setSamples: (samples) => set({ samples }),
  trackViewport: (center, zoom) => {
    if (![...center, zoom].every(Number.isFinite)) return;
    const latitude = Math.max(-85, Math.min(85, center[0]));
    const longitude = ((((center[1] + 180) % 360) + 360) % 360) - 180;
    set((s) => ({
      recipe: {
        ...s.recipe,
        viewport: {
          center: [latitude, longitude],
          zoom: Math.max(2, Math.min(18, zoom)),
        },
      },
    }));
  },
  openTemplate: (title, ids) => {
    const s = get();
    try {
      s.replace(
        executeMapPlan(
          emptyRecipe(),
          [
            { tool: 'createMap', title },
            ...ids.map((datasetId) => ({
              tool: 'addLayer' as const,
              datasetId,
            })),
            { tool: 'generateLegend' },
          ],
          s.catalog,
          s.context,
        ),
        'Membuka peta contoh',
      );
      set({ error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Template tidak valid' });
    }
  },
}));
