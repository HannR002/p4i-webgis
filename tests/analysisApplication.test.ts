import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { getRasterProvider } from '../lib/server/gis/rasterProvider';
import { prepareConfigurationApplication } from '../lib/gis/analysisApplication';
import { defaultConfiguration } from '../lib/gis/analysisConfiguration';
import { handleAnalysisConfigurationTool } from '../lib/gis/analysisTools';
import { createAnalysisConfigurationRepository } from '../lib/gis/analysisRepository';
import { emptyRecipe, DEMO_AOIS } from '../lib/gis/catalog';
import { parseRecipe } from '../lib/gis/validation';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useMapStore } from '../store/useMapStore';
import { DEFAULT_PAIRWISE } from '../utils/analysisPreferences';
const catalog = createDemoGisProvider().catalog(),
  guest = { role: 'guest' as const, entitledProjectIds: [] };
const date = '2026-01-01T00:00:00.000Z';
describe('configuration engine integration and AI contracts', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      recipe: emptyRecipe(),
      past: [],
      future: [],
      analysisDraft: null,
    });
    useWorkspaceStore.getState().configure([...catalog], 'demo', guest);
    useMapStore.getState().setAHPPreferences(DEFAULT_PAIRWISE);
  });
  it('loads accepted rounded legacy weights without altering the old recipe or losing preferences on raster apply', () => {
    const legacy = {
      ...emptyRecipe(),
      analysis: {
        method: 'ahp-wlc' as const,
        weights: { bencana: 0.333, kesuburan: 0.333, kepadatan: 0.333 },
        cr: 0,
        provisional: true as const,
      },
    };
    useWorkspaceStore.getState().replace(legacy, 'Legacy import');
    expect(useWorkspaceStore.getState().recipe.analysis?.weights).toEqual(
      legacy.analysis.weights,
    );
    expect(useMapStore.getState().derivedWeights.bencana).toBeCloseTo(
      1 / 3,
      12,
    );
    useMapStore.getState().updatePairwise('bencanaVsKesuburan', 2);
    const preferences = { ...useMapStore.getState().pairwiseValues };
    const plan = prepareConfigurationApplication(
      defaultConfiguration('raster-reclassification', catalog, undefined, date),
      legacy,
      catalog,
      guest,
      'demo',
    );
    if (plan.kind !== 'raster') throw Error('raster unavailable');
    useWorkspaceStore.getState().replace(plan.recipe, 'Raster config');
    expect(useMapStore.getState().weightMethod).toBe('ahp');
    expect(useMapStore.getState().pairwiseValues).toEqual(preferences);
  });
  it('applies AHP/WLC to the existing recipe and restores preferences with history', () => {
    const ahp = defaultConfiguration('ahp-smce', catalog, undefined, date);
    const a = prepareConfigurationApplication(
      ahp,
      emptyRecipe(),
      catalog,
      guest,
      'demo',
    );
    if (a.kind !== 'preferences') throw Error('preferences unavailable');
    useWorkspaceStore.getState().replace(a.recipe, 'AHP config');
    expect(useMapStore.getState().weightMethod).toBe('ahp');
    const wlc = {
      ...defaultConfiguration('wlc', catalog, undefined, date),
      weights: { bencana: 0.2, kesuburan: 0.3, kepadatan: 0.5 },
    };
    const w = prepareConfigurationApplication(
      wlc,
      a.recipe,
      catalog,
      guest,
      'demo',
    );
    if (w.kind !== 'preferences') throw Error('preferences unavailable');
    useWorkspaceStore.getState().replace(w.recipe, 'WLC config');
    expect(useMapStore.getState().derivedWeights).toEqual(wlc.weights);
    expect(w.recipe.analysis?.weightMethod).toBe('manual-wlc');
    expect(
      parseRecipe(JSON.parse(JSON.stringify(w.recipe)), catalog)
        .analysisConfiguration,
    ).toEqual(wlc);
    expect(() =>
      parseRecipe(
        {
          ...w.recipe,
          analysis: {
            ...w.recipe.analysis!,
            weights: { bencana: 0.3, kesuburan: 0.3, kepadatan: 0.4 },
          },
        },
        catalog,
      ),
    ).toThrow(/konfigurasi/);
    expect(() =>
      parseRecipe(
        { ...a.recipe, analysis: { ...a.recipe.analysis!, cr: 2 } },
        catalog,
      ),
    ).toThrow(/CR/);
    useWorkspaceStore.getState().undo();
    expect(useMapStore.getState().weightMethod).toBe('ahp');
    useWorkspaceStore.getState().redo();
    expect(useMapStore.getState().derivedWeights).toEqual(wlc.weights);
    useMapStore.getState().updatePairwise('bencanaVsKesuburan', 2);
    expect(useMapStore.getState().weightMethod).toBe('ahp');
  });
  it('executes the existing native zonal/reclassification provider from configured parameters', async () => {
    const raster = getRasterProvider(createDemoGisProvider());
    for (const type of [
      'zonal-statistics',
      'raster-reclassification',
      'raster-normalization',
      'raster-arithmetic',
      'clip',
      'mask',
    ] as const) {
      const c = {
        ...defaultConfiguration(type, catalog, undefined, date),
        selectedAOI: DEMO_AOIS[0],
      };
      const plan = prepareConfigurationApplication(
        c,
        emptyRecipe(),
        catalog,
        guest,
        'demo',
      );
      if (plan.kind !== 'raster') throw Error('raster unavailable');
      expect(plan.recipe.analysisConfiguration).toEqual(c);
      const result = await raster.execute(plan.operation);
      expect(result.status).toBe('ok');
      if (
        type === 'zonal-statistics' &&
        result.status === 'ok' &&
        result.data.kind === 'statistics'
      )
        expect(result.data.statistics.count).toBe(7);
    }
  });
  it('returns honest missing-AOI, flood-adapter and production unavailable plans', () => {
    const zonal = defaultConfiguration(
      'zonal-statistics',
      catalog,
      undefined,
      date,
    );
    expect(
      prepareConfigurationApplication(
        zonal,
        emptyRecipe(),
        catalog,
        guest,
        'demo',
      ).kind,
    ).toBe('configuration-only');
    expect(
      prepareConfigurationApplication(
        { ...zonal, selectedAOI: DEMO_AOIS[0] },
        emptyRecipe(),
        catalog,
        guest,
        'unavailable',
      ).kind,
    ).toBe('configuration-only');
    const flood = defaultConfiguration(
      'flood-susceptibility',
      catalog,
      undefined,
      date,
    );
    expect(
      prepareConfigurationApplication(
        flood,
        emptyRecipe(),
        catalog,
        guest,
        'demo',
      ).kind,
    ).toBe('configuration-only');
  });
  it('checks every configuration input access, including recipes without its layers', () => {
    const restricted = catalog.map((d) =>
      d.id === 'demo-rainfall'
        ? { ...d, accessTier: 'restricted' as const, projectId: 'p' }
        : d,
    );
    const c = defaultConfiguration(
      'raster-reclassification',
      restricted,
      undefined,
      date,
    );
    expect(() =>
      prepareConfigurationApplication(
        c,
        emptyRecipe(),
        restricted,
        guest,
        'demo',
      ),
    ).toThrow(/Akses/);
    const client = { role: 'b2b_client' as const, entitledProjectIds: ['p'] };
    expect(
      prepareConfigurationApplication(
        c,
        emptyRecipe(),
        restricted,
        client,
        'demo',
      ).kind,
    ).toBe('raster');
    expect(() =>
      useWorkspaceStore
        .getState()
        .replace({ ...emptyRecipe(), analysisConfiguration: c }, 'bad'),
    ).not.toThrow();
    useWorkspaceStore.getState().configure([...restricted], 'demo', guest);
    expect(() =>
      useWorkspaceStore
        .getState()
        .replace({ ...emptyRecipe(), analysisConfiguration: c }, 'denied'),
    ).toThrow(/Akses/);
  });
  it('AI can list/select/propose/create/prepare through validated non-executing contracts', () => {
    const data = new Map<string, string>();
    const repo = createAnalysisConfigurationRepository(
      {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => {
          data.set(k, v);
        },
      },
      catalog,
    );
    const c = repo.save(defaultConfiguration('wlc', catalog, undefined, date));
    const call = (input: unknown) =>
      handleAnalysisConfigurationTool(
        input,
        repo,
        catalog,
        guest,
        emptyRecipe(),
        'demo',
      );
    expect(call({ tool: 'listAnalysisConfigurations' }).kind).toBe('list');
    expect(call({ tool: 'selectAnalysisConfiguration', id: c.id }).kind).toBe(
      'selection',
    );
    const proposed = call({
      tool: 'proposeAnalysisConfigurationChanges',
      id: c.id,
      changes: {
        name: 'AI proposal',
        weights: { bencana: 0.2, kesuburan: 0.3, kepadatan: 0.5 },
      },
    });
    expect(proposed.kind).toBe('proposal');
    expect(repo.get(c.id)?.name).toBe(c.name);
    expect(
      call({
        tool: 'createAnalysisConfigurationDraft',
        analysisType: 'zonal-statistics',
        name: 'AI draft',
      }).kind,
    ).toBe('draft');
    expect(repo.list()).toHaveLength(1);
    expect(
      call({ tool: 'prepareConfiguredAnalysis', configuration: c }).kind,
    ).toBe('preferences');
    expect(() =>
      call({
        tool: 'createAnalysisConfigurationDraft',
        analysisType: 'buffer',
      }),
    ).toThrow();
    expect(() =>
      call({
        tool: 'proposeAnalysisConfigurationChanges',
        id: c.id,
        changes: { experimental: false },
      }),
    ).toThrow();
    expect(() =>
      call({
        tool: 'proposeAnalysisConfigurationChanges',
        id: c.id,
        changes: {
          criteria: c.criteria.map((row) => ({
            ...row,
            datasetId: 'invented',
            band: 'bad',
          })),
        },
      }),
    ).toThrow();
    expect(() =>
      call({
        tool: 'prepareConfiguredAnalysis',
        configuration: {
          ...c,
          weights: { bencana: 1, kesuburan: 1, kepadatan: 1 },
        },
      }),
    ).toThrow();
    expect(() => call({ tool: 'runPaidAnalysis', configuration: c })).toThrow();
  });
});
