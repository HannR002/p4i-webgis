import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore as store } from '../store/useWorkspaceStore';
import { emptyRecipe } from '../lib/gis/catalog';
import { executeMapPlan } from '../lib/gis/recipe';
import { parseVectorDocument } from '../lib/gis/vectorPersistence';
import { parseVectorAnalysisResult, parseVectorAnalysisProposal } from '../lib/gis/vectorAnalysis';
import fixture from './fixtures/vector-analysis-lifecycle.json';

const doc = parseVectorDocument(fixture.document);
const result = parseVectorAnalysisResult(fixture.result);
const proposal = parseVectorAnalysisProposal({
  tool: 'prepareVectorAnalysis', operation: 'buffer', layerId: doc.layer.id,
  featureIds: ['local-feature-1'], parameters: { distanceMetres: 500 },
});
const state = () => store.getState();
function seed() {
  store.setState(store.getInitialState(), true);
  store.setState({ recipe: { ...emptyRecipe(), sketchLayers: [doc.layer] } });
  state().setVectorProjectBinding(structuredClone(doc));
  state().setVectorAnalysisResult(result);
  state().setVectorAnalysisProposal(proposal);
  state().setVectorEditor({
    vectorMode: 'select', vectorLayerId: doc.layer.id,
    selectedVectorIds: ['local-feature-1'], vectorTableOpen: true,
    vectorVertices: [[103.61, -1.61]], vectorCursor: [103.61, -1.61],
  });
}
function expectInvalidated(epoch: number) {
  expect(state().mapEpoch).toBeGreaterThan(epoch);
  expect(state().vectorAnalysisResult).toBeNull();
  expect(state().vectorAnalysisProposal).toBeNull();
  expect(state().vectorProjectBinding).toBeNull();
  expect(state().selectedVectorIds).toEqual([]);
  expect(state().vectorLayerId).toBe('');
  expect(state().vectorVertices).toEqual([]);
  expect(state().vectorCursor).toBeNull();
  expect(state().vectorEdit).toBeNull();
  expect(state().snapTarget).toBeNull();
  expect(state().vectorMode).toBe('off');
  expect(state().vectorTableOpen).toBe(false);
}

beforeEach(seed);
afterEach(() => vi.unstubAllGlobals());

describe('map replacement invalidates transient analysis, never stored revisions', () => {
  it.each([
    ['manual createMap', () => state().action({ tool: 'createMap', title: 'New map' })],
    ['Copilot completed plan / reviewed preview', () => {
      const s = state();
      const next = executeMapPlan(s.recipe, [
        { tool: 'createMap', title: 'Copilot map' },
        { tool: 'createVectorLayer', name: 'New layer with reused local ID' },
      ], s.catalog, s.context);
      s.replace(next, 'Copilot DEMO', s.recipe, 'replace-map');
    }],
    ['catalog template', () => state().openTemplate('Catalog map', [])],
    ['MapRecipe import', () => state().replace(JSON.parse(JSON.stringify(state().recipe)), 'Impor resep tervalidasi')],
    ['local draft opening', () => state().replace(JSON.parse(JSON.stringify(state().recipe)), 'Memuat draft lokal')],
    ['direct recipe replacement with reused IDs', () => state().replace(structuredClone(state().recipe), 'Replace')],
    ['project layer opening', () => state().replace({ ...state().recipe, sketchLayers: [structuredClone(doc.layer)] }, 'Buka layer dari proyek')],
  ] as const)('%s clears previous context atomically', (_label, replace) => {
    const prior = state().recipe, epoch = state().mapEpoch;
    const notifications: boolean[] = [];
    const unsubscribe = store.subscribe((s) => {
      if (s.recipe !== prior) notifications.push(s.vectorAnalysisResult === null && s.vectorProjectBinding === null);
    });
    const fetcher = vi.fn(), save = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('localStorage', { setItem: save });
    const originalDocument = JSON.stringify(doc);
    replace();
    expectInvalidated(epoch);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every(Boolean)).toBe(true);
    expect(state().past).toHaveLength(1);
    expect(JSON.stringify(doc)).toBe(originalDocument);
    expect(fetcher).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('can attach the newly opened project snapshot, but history never restores stale binding or overlays', () => {
    const original = state().recipe;
    state().replace({ ...emptyRecipe(), title: 'Other project', sketchLayers: [doc.layer] }, 'Buka proyek');
    const opened = { ...structuredClone(doc), projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', revision: 8 };
    state().setVectorProjectBinding(opened);
    state().setVectorAnalysisResult(result);
    const epoch = state().mapEpoch;
    state().undo();
    expect(state().recipe).toBe(original);
    expectInvalidated(epoch);
    state().setVectorAnalysisResult(result);
    const undoEpoch = state().mapEpoch;
    state().redo();
    expect(state().recipe.title).toBe('Other project');
    expectInvalidated(undoEpoch);
    expect(opened.revision).toBe(8);
    expect(doc.revision).toBe(7);
  });

  it('replacing a byte-identical map invalidates pending work even after Undo', () => {
    const before = state();
    state().replace(structuredClone(before.recipe), 'New lifecycle');
    state().undo();
    expect(state().recipe).toBe(before.recipe);
    expect(state().mapEpoch).not.toBe(before.mapEpoch);
    expect(state().vectorEpoch).not.toBe(before.vectorEpoch);
    expect(state().vectorAnalysisResult).toBeNull();
  });

  it('rejects delayed recipe application and invalid imports without discarding valid current state', () => {
    const before = state();
    expect(() => before.replace({ title: 'invalid' }, 'Import')).toThrow();
    expect(state().vectorAnalysisResult).toBe(before.vectorAnalysisResult);
    before.action({ tool: 'createMap', title: 'Newer map' });
    expect(() => state().replace(before.recipe, 'Late AI', before.recipe)).toThrow(/Peta berubah/);
    expect(state().recipe.title).toBe('Newer map');
    expect(state().vectorAnalysisResult).toBeNull();
  });

  it('requires resolving an active drag before replacement and never commits its preview', () => {
    state().setVectorEditor({ vectorMode: 'edit', vectorVertices: [] });
    state().beginVertexDrag(doc.layer.id, 'local-feature-1', [], 0);
    expect(state().vectorEdit).not.toBeNull();
    const epoch = state().mapEpoch;
    expect(() => state().action({ tool: 'createMap', title: 'New map' })).toThrow(/drag/);
    state().cancelVectorEdit();
    state().action({ tool: 'createMap', title: 'New map' });
    expectInvalidated(epoch);
    expect(doc.layer.data.features[0].geometry).toEqual(fixture.document.layer.data.features[0].geometry);
  });
});

describe('same-map presentation edits retain valid analysis', () => {
  it('retains selection when editing the implicit first layer', () => {
    store.setState({ vectorLayerId: '' });
    state().action({ tool: 'updateFeatureProperties', layerId: doc.layer.id,
      featureId: 'local-feature-1', name: 'Renamed point', description: '', attributes: {} });
    expect(state().selectedVectorIds).toEqual(['local-feature-1']);
    expect(state().vectorLayerId).toBe(doc.layer.id);
    expect(state().vectorAnalysisResult).not.toBeNull();
  });

  it('never transfers selection to a different layer with reused feature IDs', () => {
    store.setState({ vectorLayerId: '' });
    state().replace({ ...state().recipe,
      sketchLayers: [{ ...structuredClone(doc.layer), id: 'local-vector-2' }] },
    'Replace source layer within map', undefined, 'edit');
    expect(state().selectedVectorIds).toEqual([]);
    expect(state().vectorAnalysisProposal).toBeNull();
    expect(state().vectorProjectBinding).toBeNull();
  });

  it('preserves result, proposal and persisted revision after style/visibility/pan/zoom and edit Undo/Redo', () => {
    const epoch = state().mapEpoch;
    const stored = state().vectorProjectBinding;
    const originalResult = state().vectorAnalysisResult;
    state().action({ tool: 'updateVectorLayer', layerId: doc.layer.id, style: { ...doc.layer.style, color: '#ff0000' } });
    state().action({ tool: 'updateVectorLayer', layerId: doc.layer.id, visible: false });
    state().trackViewport([-1.62, 103.62], 14);
    state().replace({ ...state().recipe, description: 'Presentation only' }, 'Edit', undefined, 'edit');
    state().undo();
    state().redo();
    expect(state().mapEpoch).toBe(epoch);
    expect(state().vectorAnalysisResult).toBe(originalResult);
    expect(state().vectorAnalysisProposal).toEqual(proposal);
    expect(state().vectorProjectBinding).toBe(stored);
    expect(stored?.revision).toBe(7);
  });

  it('clears selected/proposed references when their feature is deleted', () => {
    state().action({ tool: 'deleteFeature', layerId: doc.layer.id, featureId: 'local-feature-1' });
    expect(state().selectedVectorIds).toEqual([]);
    expect(state().vectorAnalysisProposal).toBeNull();
    // Result is a separate persisted-source snapshot, not an editable source layer.
    expect(state().vectorAnalysisResult).not.toBeNull();
  });
});
