import {
  parseVectorAnalysisResult,
  type VectorAnalysisResult,
  type VectorAnalysisProposal,
} from '../lib/gis/vectorAnalysis';
import { create } from 'zustand';
import type { VectorLayerDocument } from '../lib/gis/vectorPersistence';
import {
  editVertex,
  type LonLat,
  type SketchGeometry,
} from '../lib/gis/vectorEditing';
import type { SnapSettings, SnapTarget } from '../lib/gis/vectorSnapping';
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
  vectorMode: 'off' | 'select' | 'point' | 'line' | 'polygon' | 'edit';
  vectorEdit: {
    layerId: string;
    featureId: string;
    original: SketchGeometry;
    preview: SketchGeometry;
    path: number[];
    index: number;
  } | null;
  vectorEpoch: number;
  snapSettings: SnapSettings;
  snapTarget: SnapTarget | null;
  vectorCursor: LonLat | null;
  vectorTableOpen: boolean;
  vectorLayerId: string;
  selectedVectorIds: string[];
  vectorVertices: [number, number][];
  vectorError: string | null;
}
interface WorkspaceState extends VectorEditorState {
  // Monotonic even across Undo/Redo; transient work never travels with a recipe.
  mapEpoch: number;
  vectorAnalysisResult: VectorAnalysisResult | null;
  vectorAnalysisProposal: VectorAnalysisProposal | null;
  setVectorAnalysisResult: (result: VectorAnalysisResult | null) => void;
  setVectorAnalysisProposal: (proposal: VectorAnalysisProposal | null) => void;
  vectorProjectBinding: VectorLayerDocument | null;
  setVectorProjectBinding: (binding: VectorLayerDocument | null) => void;
  setVectorEditor: (value: Partial<VectorEditorState>) => void;
  beginVertexDrag: (
    layerId: string,
    featureId: string,
    path: number[],
    index: number,
  ) => void;
  previewVertexDrag: (coordinate: LonLat) => void;
  commitVertexDrag: () => void;
  cancelVectorEdit: () => void;
  finishVectorDrawing: () => void;
  recipe: MapRecipe;
  catalog: Dataset[];
  mode: 'loading' | 'demo' | 'unavailable';
  context: GisContext;
  error: string | null;
  past: RecipeHistoryEntry[];
  future: RecipeHistoryEntry[];
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
  replace: (
    recipe: unknown,
    label: string,
    expectedRecipe?: MapRecipe,
    lifecycle?: 'replace-map' | 'edit',
  ) => void;
  undo: () => void;
  redo: () => void;
  setSamples: (samples: PixelSample[]) => void;
  trackViewport: (center: [number, number], zoom: number) => void;
  openTemplate: (title: string, ids: readonly string[]) => void;
}
interface RecipeHistoryEntry {
  recipe: MapRecipe;
  replacesMap: boolean;
}

/** One policy for replacement, history traversal and map-scoped UI state. */
function recipeLifecycle(
  s: WorkspaceState,
  recipe: MapRecipe,
  replacesMap: boolean,
) {
  // Match the editor's first-layer fallback in the previous recipe. Resolve it
  // before replacement so reused feature IDs cannot select another layer.
  const previousLayer = s.recipe.sketchLayers?.find((l) => l.id === s.vectorLayerId)
    ?? s.recipe.sketchLayers?.[0];
  const layer = recipe.sketchLayers?.find((l) => l.id === previousLayer?.id);
  const proposal = s.vectorAnalysisProposal;
  const proposalLayer = recipe.sketchLayers?.find(
    (l) => l.id === proposal?.layerId,
  );
  return {
    vectorEpoch: s.vectorEpoch + 1,
    vectorEdit: null,
    vectorVertices: [],
    vectorCursor: null,
    snapTarget: null,
    vectorError: null,
    samples: [],
    selectedVectorIds: replacesMap
      ? []
      : s.selectedVectorIds.filter((id) =>
          layer?.data.features.some((f) => f.id === id),
        ),
    vectorLayerId: replacesMap || !layer ? '' : layer.id,
    ...(replacesMap
      ? {
          mapEpoch: s.mapEpoch + 1,
          vectorAnalysisResult: null,
          vectorAnalysisProposal: null,
          vectorProjectBinding: null,
          vectorMode: 'off' as const,
          vectorTableOpen: false,
        }
      : {
          vectorAnalysisProposal:
            proposal && proposal.featureIds.every((id) =>
              proposalLayer?.data.features.some((f) => f.id === id),
            ) ? proposal : null,
          vectorProjectBinding: recipe.sketchLayers?.some(
            (l) => l.id === s.vectorProjectBinding?.layer.id,
          ) ? s.vectorProjectBinding : null,
        }),
  };
}
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  mapEpoch: 0,
  vectorAnalysisResult: null,
  vectorAnalysisProposal: null,
  setVectorAnalysisResult: (result) =>
    set((s) => ({
      vectorAnalysisResult: result ? parseVectorAnalysisResult(result) : null,
      log: [
        ...s.log,
        result ? 'Pratinjau analisis PostGIS' : 'Buang pratinjau analisis',
      ].slice(-50),
    })),
  setVectorAnalysisProposal: (vectorAnalysisProposal) =>
    set({ vectorAnalysisProposal }),
  recipe: emptyRecipe(),
  vectorProjectBinding: null,
  setVectorProjectBinding: (vectorProjectBinding) =>
    set({ vectorProjectBinding }),
  vectorMode: 'off',
  vectorEdit: null,
  vectorEpoch: 0,
  snapSettings: {
    enabled: true,
    vertices: true,
    segments: true,
    tolerance: 12,
  },
  snapTarget: null,
  vectorCursor: null,
  vectorTableOpen: false,
  vectorLayerId: '',
  selectedVectorIds: [],
  vectorVertices: [],
  vectorError: null,
  setVectorEditor: (value) =>
    set((s) => ({
      ...value,
      ...(value.vectorMode !== undefined ||
      value.vectorLayerId !== undefined ||
      value.selectedVectorIds !== undefined
        ? { vectorEdit: null, snapTarget: null, vectorEpoch: s.vectorEpoch + 1 }
        : {}),
    })),
  beginVertexDrag: (layerId, featureId, path, index) => {
    const s = get(),
      layer = s.recipe.sketchLayers?.find((l) => l.id === layerId);
    const f = layer?.data.features.find((f) => f.id === featureId);
    if (!f || !layer?.visible || s.vectorMode !== 'edit')
      throw Error('Objek edit tidak tersedia');
    set({
      vectorEdit: {
        layerId,
        featureId,
        original: structuredClone(f.geometry),
        preview: structuredClone(f.geometry),
        path,
        index,
      },
      vectorEpoch: s.vectorEpoch + 1,
      vectorError: null,
    });
  },
  previewVertexDrag: (coordinate) => {
    const edit = get().vectorEdit;
    if (!edit) return;
    try {
      set({
        vectorEdit: {
          ...edit,
          preview: editVertex(
            edit.original,
            edit.path,
            edit.index,
            'move',
            coordinate,
          ),
        },
        vectorError: null,
      });
    } catch (e) {
      set({
        vectorError: e instanceof Error ? e.message : 'Vertex tidak valid',
      });
    }
  },
  commitVertexDrag: () => {
    const s = get(),
      edit = s.vectorEdit;
    if (!edit) return;
    const current = s.recipe.sketchLayers
      ?.find((l) => l.id === edit.layerId)
      ?.data.features.find((f) => f.id === edit.featureId);
    set({ vectorEdit: null, snapTarget: null, vectorEpoch: s.vectorEpoch + 1 });
    if (s.vectorError) return;
    if (JSON.stringify(current?.geometry) !== JSON.stringify(edit.original)) {
      set({ vectorError: 'Objek berubah; ulangi edit.' });
      return;
    }
    if (JSON.stringify(edit.original) === JSON.stringify(edit.preview)) return;
    get().action({
      tool: 'updateFeatureGeometry',
      layerId: edit.layerId,
      featureId: edit.featureId,
      geometry: edit.preview,
    });
  },
  cancelVectorEdit: () =>
    set((s) => ({
      vectorEdit: null,
      vectorVertices: [],
      vectorCursor: null,
      snapTarget: null,
      vectorError: null,
      vectorEpoch: s.vectorEpoch + 1,
    })),
  finishVectorDrawing: () => {
    const s = get(),
      layer = s.recipe.sketchLayers?.find((l) => l.id === s.vectorLayerId);
    if (!layer || !['line', 'polygon'].includes(s.vectorMode)) return;
    try {
      s.action(
        s.vectorMode === 'line'
          ? {
              tool: 'createFeature',
              layerId: layer.id,
              name: `Garis ${layer.data.features.length + 1}`,
              geometry: { type: 'LineString', coordinates: s.vectorVertices },
            }
          : {
              tool: 'createPolygon',
              layerId: layer.id,
              name: `Poligon ${layer.data.features.length + 1}`,
              vertices: s.vectorVertices,
            },
      );
      set({ vectorVertices: [], vectorError: null, snapTarget: null });
    } catch (e) {
      set({
        vectorError: e instanceof Error ? e.message : 'Geometri tidak valid',
      });
    }
  },
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
  replace: (input, label, expectedRecipe, lifecycle = 'replace-map') => {
    const s = get();
    if (s.vectorEdit)
      throw new Error('Selesaikan atau batalkan drag vertex dahulu.');
    if (expectedRecipe && s.recipe !== expectedRecipe)
      throw new Error(
        'Peta berubah saat permintaan diproses. Minta rencana baru.',
      );
    const recipe = parseRecipe(input, s.catalog);
    assertRecipeAccess(recipe, s.catalog, s.context);
    recipe.legend = legendFor(recipe, s.catalog);
    syncConfiguration(s.recipe, recipe);
    const replacesMap =
      lifecycle === 'replace-map' || recipe.id !== s.recipe.id;
    set({
      recipe,
      ...recipeLifecycle(s, recipe, replacesMap),
      past: [...s.past, { recipe: s.recipe, replacesMap }].slice(-30),
      future: [],
      log: [...s.log, label].slice(-50),
    });
  },
  action: (action) => {
    const s = get();
    get().replace(
      applyMapAction(s.recipe, action, s.catalog, s.context),
      'Perubahan sesi peta',
      undefined,
      typeof action === 'object' &&
        action !== null &&
        'tool' in action &&
        action.tool === 'createMap'
        ? 'replace-map'
        : 'edit',
    );
  },
  undo: () => {
    get().cancelVectorEdit();
    const s = get();
    const previous = s.past.at(-1);
    if (previous) {
      syncConfiguration(s.recipe, previous.recipe);
      set({
        recipe: previous.recipe,
        ...recipeLifecycle(s, previous.recipe, previous.replacesMap),
        past: s.past.slice(0, -1),
        future: [
          { recipe: s.recipe, replacesMap: previous.replacesMap },
          ...s.future,
        ].slice(0, 30),
        log: [...s.log, 'Undo'].slice(-50),
      });
    }
  },
  redo: () => {
    get().cancelVectorEdit();
    const s = get();
    const next = s.future[0];
    if (next) {
      syncConfiguration(s.recipe, next.recipe);
      set({
        recipe: next.recipe,
        ...recipeLifecycle(s, next.recipe, next.replacesMap),
        past: [
          ...s.past,
          { recipe: s.recipe, replacesMap: next.replacesMap },
        ].slice(-30),
        future: s.future.slice(1),
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
