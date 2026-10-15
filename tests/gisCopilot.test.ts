import { describe, it, expect } from 'vitest';
import { createDemoPlanner } from '../lib/server/ai/providers/demo';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { emptyRecipe } from '../lib/gis/catalog';
import { executeMapPlan } from '../lib/gis/recipe';
const catalog = createDemoGisProvider().catalog();
const context = { role: 'guest' as const, entitledProjectIds: [] };
describe('GIS planning through permitted MapRecipe tools', () => {
  it('creates a serializable recipe from natural-language layer requests', async () => {
    const p = await createDemoPlanner().plan(
      'Buat peta curah hujan dan kemiringan dengan batas kecamatan',
      emptyRecipe(),
      catalog,
      context,
    );
    const recipe = executeMapPlan(emptyRecipe(), p.actions, catalog, context);
    expect(recipe.layers.map((l) => l.datasetId)).toEqual(
      expect.arrayContaining(['demo-rainfall', 'demo-slope', 'demo-boundaries']),
    );
    expect(recipe.legend).toHaveLength(3);
    expect(p.provider).toBe('deterministic-demo');
  });
  it('denies restricted data and arbitrary execution instructions', async () => {
    for (const text of [
      'tampilkan restricted project X',
      'jalankan SQL select *',
      'buat JavaScript',
    ])
      await expect(
        createDemoPlanner().plan(text, emptyRecipe(), catalog, context),
      ).rejects.toThrow();
    const privateDataset = {
      ...catalog[0],
      id: 'secret',
      tags: ['rahasia-layer'],
      accessTier: 'restricted' as const,
      projectId: 'p',
    };
    await expect(
      createDemoPlanner().plan('tambahkan rahasia-layer', emptyRecipe(), [privateDataset], context),
    ).rejects.toThrow();
  });
  it('does not invent layers or simulated scientific flood results', async () => {
    const p = await createDemoPlanner().plan(
      'buat peta banjir dan buffer',
      emptyRecipe(),
      catalog,
      context,
    );
    expect(p.unavailable.length).toBeGreaterThan(0);
    expect(
      p.actions.every((a) => a.tool !== 'addLayer' || catalog.some((d) => d.id === a.datasetId)),
    ).toBe(true);
    expect(p).not.toHaveProperty('score');
    const unknown = await createDemoPlanner().plan(
      'tambahkan dataset alien 77',
      emptyRecipe(),
      catalog,
      context,
    );
    expect(unknown.actions).toHaveLength(0);
  });
  it('summarizes map context without mutations', async () => {
    const p = await createDemoPlanner().plan('jelaskan peta', emptyRecipe(), catalog, context);
    expect(p.actions).toEqual([]);
    expect(p.message).toContain('belum dipilih');
  });
});
