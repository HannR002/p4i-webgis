import { describe, expect, it } from 'vitest';
import { emptyRecipe } from '../lib/gis/catalog';
import { parseRecipe, parseMapAction } from '../lib/gis/validation';
import {
  applyMapAction,
  executeMapPlan,
  canAccessDataset,
  GisPermissionError,
} from '../lib/gis/recipe';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import type { GisContext } from '../lib/gis/contracts';
const catalog = createDemoGisProvider().catalog();
const guest: GisContext = { role: 'guest', entitledProjectIds: [] };
describe('validated declarative map execution', () => {
  it('roundtrips a recipe with known fields and rejects invalid viewport', () => {
    expect(parseRecipe(JSON.parse(JSON.stringify(emptyRecipe())) as unknown, catalog)).toEqual(
      emptyRecipe(),
    );
    expect(() =>
      parseRecipe({ ...emptyRecipe(), viewport: { center: [Infinity, 0], zoom: 4 } }, catalog),
    ).toThrow();
    expect(() =>
      parseRecipe({ ...emptyRecipe(), basemap: 'javascript:alert(1)' }, catalog),
    ).toThrow();
  });
  it('rejects unknown datasets, mismatched types and duplicate layer IDs', () => {
    const r = applyMapAction(
      emptyRecipe(),
      { tool: 'addLayer', datasetId: 'demo-rainfall' },
      catalog,
      guest,
    );
    expect(() => parseRecipe({ ...r, layers: [...r.layers, ...r.layers] }, catalog)).toThrow();
    expect(() =>
      parseRecipe({ ...r, layers: [{ ...r.layers[0], type: 'vector' }] }, catalog),
    ).toThrow();
    expect(() =>
      applyMapAction(r, { tool: 'addLayer', datasetId: 'invented-layer' }, catalog, guest),
    ).toThrow();
  });
  it('validates tools and rejects injected parameters and code execution', () => {
    for (const action of [
      { tool: 'sql', query: 'select 1' },
      { tool: 'addLayer', datasetId: 'demo-rainfall', url: 'https://evil.example' },
      { tool: 'setLayerOpacity', layerId: 'x', opacity: Infinity },
      { tool: 'setViewport', center: [0, 0], zoom: 100 },
    ])
      expect(() => parseMapAction(action)).toThrow();
  });
  it('changes opacity, visibility, style, order and zoom without touching input', () => {
    const r = executeMapPlan(
      emptyRecipe(),
      [
        { tool: 'addLayer', datasetId: 'demo-rainfall' },
        { tool: 'addLayer', datasetId: 'demo-boundaries' },
      ],
      catalog,
      guest,
    );
    const next = executeMapPlan(
      r,
      [
        { tool: 'setLayerOpacity', layerId: 'layer-demo-rainfall', opacity: 0.25 },
        { tool: 'toggleLayer', layerId: 'layer-demo-boundaries', visible: false },
        { tool: 'reorderLayer', layerId: 'layer-demo-rainfall', index: 1 },
        {
          tool: 'styleRasterLayer',
          layerId: 'layer-demo-rainfall',
          style: { min: 1000, max: 3000, palette: ['#000000', '#ffffff'] },
        },
        { tool: 'zoomToLayer', layerId: 'layer-demo-rainfall' },
      ],
      catalog,
      guest,
    );
    expect(next.layers[1].opacity).toBe(0.25);
    expect(next.layers[0].visible).toBe(false);
    expect(next.legend).toHaveLength(1);
    expect(r.layers[0].opacity).toBe(0.6);
  });
  it('applies plans atomically and does not partially mutate on failure', () => {
    const r = emptyRecipe();
    expect(() =>
      executeMapPlan(
        r,
        [
          { tool: 'setMapTitle', title: 'changed' },
          { tool: 'addLayer', datasetId: 'unknown' },
        ],
        catalog,
        guest,
      ),
    ).toThrow();
    expect(r.title).toBe('Peta kerja baru');
  });
  it('enforces restricted project access using verified context', () => {
    const privateData = {
      ...catalog[0],
      id: 'private-dataset',
      accessTier: 'restricted' as const,
      projectId: 'private-project',
    };
    expect(canAccessDataset(privateData, guest)).toBe(false);
    expect(canAccessDataset(privateData, { role: 'b2b_client', entitledProjectIds: [] })).toBe(
      false,
    );
    expect(
      canAccessDataset(privateData, {
        role: 'b2b_client',
        entitledProjectIds: ['private-project'],
      }),
    ).toBe(true);
    expect(() =>
      applyMapAction(
        emptyRecipe(),
        { tool: 'addLayer', datasetId: privateData.id },
        [...catalog, privateData],
        guest,
      ),
    ).toThrow(GisPermissionError);
  });
  it('keeps categorical legend labels and does not normalize class codes', () => {
    const r = applyMapAction(
      emptyRecipe(),
      { tool: 'addLayer', datasetId: 'demo-landcover' },
      catalog,
      guest,
    );
    expect(r.legend[0].entries.map((e) => e.label)).toContain('Terbangun');
    expect(r.legend[0].entries).toHaveLength(4);
  });
  it('stores selected AOI identity and rejects invented AOIs', () => {
    const r = applyMapAction(
      emptyRecipe(),
      { tool: 'selectAOI', aoiId: 'demo-aoi-west' },
      catalog,
      guest,
    );
    expect(r.aoi?.id).toBe('demo-aoi-west');
    expect(r.aoi).not.toHaveProperty('geometry');
    expect(() =>
      applyMapAction(r, { tool: 'selectAOI', aoiId: 'made-up' }, catalog, guest),
    ).toThrow();
  });
  it('rejects imported fictional or relabeled AOIs, including demo data presented as official', () => {
    for (const aoi of [
      { id: 'invented', name: 'Area contoh Barat', kind: 'demo' },
      { id: 'demo-aoi-west', name: 'Official district', kind: 'administrative' },
      { id: 'demo-aoi-west', name: 'Invented district', kind: 'demo' },
    ]) expect(() => parseRecipe({ ...emptyRecipe(), aoi }, catalog)).toThrow(/AOI/);
  });
});
