import { beforeEach, describe, it, expect } from 'vitest';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { emptyRecipe } from '../lib/gis/catalog';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { parseRecipe } from '../lib/gis/validation';
describe('map session history', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      recipe: emptyRecipe(),
      past: [],
      future: [],
      log: [],
      samples: [],
    });
    useWorkspaceStore
      .getState()
      .configure([...createDemoGisProvider().catalog()], 'demo', {
        role: 'guest',
        entitledProjectIds: [],
      });
  });
  it('undoes and redoes a layer mutation', () => {
    const s = useWorkspaceStore.getState();
    s.action({ tool: 'addLayer', datasetId: 'demo-rainfall' });
    expect(useWorkspaceStore.getState().recipe.layers).toHaveLength(1);
    s.undo();
    expect(useWorkspaceStore.getState().recipe.layers).toHaveLength(0);
    s.redo();
    expect(useWorkspaceStore.getState().recipe.layers).toHaveLength(1);
  });
  it('caps history and clears redo after a divergent edit', () => {
    const s = useWorkspaceStore.getState();
    for (let i = 0; i < 35; i++) s.action({ tool: 'setMapTitle', title: `Map ${i}` });
    expect(useWorkspaceStore.getState().past).toHaveLength(30);
    s.undo();
    s.action({ tool: 'setMapTitle', title: 'Other' });
    expect(useWorkspaceStore.getState().future).toHaveLength(0);
  });
  it('does not load invalid recipe or mutate session after a denied tool', () => {
    const s = useWorkspaceStore.getState();
    expect(() => s.replace({ title: 'invalid' }, 'load')).toThrow();
    expect(() => s.action({ tool: 'addLayer', datasetId: 'invented' })).toThrow();
    expect(useWorkspaceStore.getState().past).toHaveLength(0);
    expect(useWorkspaceStore.getState().recipe).toEqual(emptyRecipe());
  });
  it('does not overwrite edits made while a Copilot request was pending', () => {
    const s = useWorkspaceStore.getState();
    const requested = s.recipe;
    s.action({ tool: 'setMapTitle', title: 'My newer edit' });
    expect(() => s.replace({ ...requested, title: 'Late AI response' }, 'AI', requested)).toThrow(/Peta berubah/);
    expect(useWorkspaceStore.getState().recipe.title).toBe('My newer edit');
    expect(useWorkspaceStore.getState().past).toHaveLength(1);
  });
  it('applies a response against an unchanged session as one undoable change', () => {
    const s = useWorkspaceStore.getState();
    s.replace({ ...s.recipe, title: 'AI response' }, 'AI', s.recipe);
    expect(useWorkspaceStore.getState().recipe.title).toBe('AI response');
    s.undo();
    expect(useWorkspaceStore.getState().recipe.title).toBe('Peta kerja baru');
  });
  it('normalizes wrapped world coordinates and zoom without corrupting later edits', () => {
    const s = useWorkspaceStore.getState();
    s.trackViewport([90, 550], 1);
    expect(useWorkspaceStore.getState().recipe.viewport).toEqual({ center: [85, -170], zoom: 2 });
    s.action({ tool: 'addLayer', datasetId: 'demo-rainfall' });
    const recipe = useWorkspaceStore.getState().recipe;
    expect(parseRecipe(recipe, s.catalog)).toEqual(recipe);
    s.trackViewport([NaN, 0], 3);
    expect(useWorkspaceStore.getState().recipe).toBe(recipe);
  });
  it('rejects importing a restricted recipe without entitlement', () => {
    const s = useWorkspaceStore.getState();
    s.action({ tool: 'addLayer', datasetId: 'demo-rainfall' });
    const recipe = useWorkspaceStore.getState().recipe;
    s.configure(s.catalog.map(d => ({ ...d, accessTier: 'restricted', projectId: 'secret-project' })), 'demo', s.context);
    expect(() => s.replace(recipe, 'import')).toThrow(/Akses dataset ditolak/);
    expect(useWorkspaceStore.getState().recipe).toBe(recipe);
  });
  it('rebuilds imported legends from layer styles and trusted dataset metadata', () => {
    const s = useWorkspaceStore.getState();
    s.action({ tool: 'addLayer', datasetId: 'demo-rainfall' });
    const recipe = useWorkspaceStore.getState().recipe;
    s.replace({ ...recipe, legend: [{ ...recipe.legend[0], title: 'Invented scientific result' }] }, 'import');
    expect(useWorkspaceStore.getState().recipe.legend[0].title).toBe('Curah hujan tahunan');
  });
});
