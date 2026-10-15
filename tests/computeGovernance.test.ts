import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  DevelopmentComputeService,
  type ComputeEnvironment,
} from '../lib/server/compute/service';
import { executeLocalCompute } from '../lib/server/compute/adapter';
import { validateComputeRequest } from '../lib/server/compute/policy';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { getRasterProvider } from '../lib/server/gis/rasterProvider';
import {
  defaultConfiguration,
  refreshConfigurationSources,
} from '../lib/gis/analysisConfiguration';
import { emptyRecipe, DEMO_AOIS } from '../lib/gis/catalog';
import {
  parseComputeTool,
  transition,
  draftComputeReport,
} from '../lib/gis/computeValidation';
import { applyComputeJob } from '../lib/gis/computeMap';
import {
  parseGISToolRequest,
  parseGISRunResponse,
} from '../lib/gis/copilotValidation';
import {
  executeGISPlan,
  planningInput,
  planWithProvider,
} from '../lib/server/ai/execution';
import { createControlledDemoProvider } from '../lib/server/ai/providers/controlledDemo';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { ComputeRequest } from '../lib/gis/computeContracts';
import type {
  GISAnalysisType,
  GISAnalysisConfiguration,
} from '../lib/gis/analysisContracts';
const gis = createDemoGisProvider(),
  catalog = gis.catalog(),
  raster = getRasterProvider(gis),
  recipe = emptyRecipe();
const access = {
  requesterId: 'user-a',
  catalog,
  context: { role: 'guest' as const, entitledProjectIds: [] },
  mode: 'demo' as const,
};
const environment = (): ComputeEnvironment => ({
  ...access,
  execute: (r, p, s) => executeLocalCompute(r, p, access, raster, s),
});
function configuration(
  type: GISAnalysisType = 'zonal-statistics',
  landcover = false,
) {
  let c = { ...defaultConfiguration(type, catalog), selectedAOI: DEMO_AOIS[0] };
  if (landcover)
    c = refreshConfigurationSources(
      {
        ...c,
        criteria: c.criteria.map((row) => ({
          ...row,
          datasetId: 'demo-landcover',
          band: catalog.find((d) => d.id === 'demo-landcover')!.raster!.bands[0]
            .id,
        })),
      },
      catalog,
    );
  return c;
}
function request(
  c: GISAnalysisConfiguration = configuration(),
): ComputeRequest {
  return {
    schemaVersion: 1,
    operation: { tool: 'runConfiguredAnalysis', configurationId: c.id },
    configuration: c,
    projectId: null,
    idempotencyKey: crypto.randomUUID(),
  };
}
afterEach(() => vi.useRealTimers());
describe('controlled compute governance', () => {
  it('runs each existing configured local raster operation and annotates actual point values', async () => {
    const service = new DevelopmentComputeService(),
      env = environment();
    for (const type of [
      'raster-reclassification',
      'raster-normalization',
      'raster-arithmetic',
      'clip',
      'mask',
    ] as const) {
      const j = service.submit(request(configuration(type)), recipe, env),
        done = await service.run(j.id, env);
      expect(done.state).toBe('COMPLETED');
      if (
        done.result?.raster?.status === 'ok' &&
        done.result.raster.data.kind === 'value'
      ) {
        expect(done.result.artifact.points).toHaveLength(1);
        expect(done.result.artifact.summary).toContain('Hasil titik DEMO');
      }
    }
  });
  it('rejects stale provider-result source versions before recording a computed result', async () => {
    const badProvider = {
      ...raster,
      execute: async (...args: Parameters<typeof raster.execute>) => {
        const result = await raster.execute(...args);
        if (result.status === 'ok' && result.data.kind === 'statistics')
          result.data.statistics.version = 'stale-version';
        return result;
      },
    };
    await expect(
      executeLocalCompute(
        request(),
        recipe,
        access,
        badProvider,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/metadata/);
  });

  it('runs native zonal statistics automatically and preserves NoData/provenance', async () => {
    const service = new DevelopmentComputeService(),
      env = environment();
    const job = service.submit(request(), recipe, env);
    expect(job.state).toBe('QUEUED');
    const done = await service.run(job.id, env);
    expect(done.history.map((h) => h.state)).toEqual([
      'DRAFT',
      'ESTIMATING',
      'QUEUED',
      'RUNNING',
      'COMPLETED',
    ]);
    expect(done.result?.raster).toMatchObject({
      status: 'ok',
      demo: true,
      data: { kind: 'statistics', statistics: { count: 7, noDataCount: 1 } },
    });
    expect(done.usage[0]).toMatchObject({
      adapterCalls: 1,
      outcome: 'COMPLETED',
    });
    expect(draftComputeReport(done)).toContain('EKSPERIMENTAL');
    expect(draftComputeReport(done)).toContain('NoData');
  });
  it('requires human approval above automatic grid limit, with no AI bypass tool', async () => {
    const service = new DevelopmentComputeService(),
      env = environment(),
      job = service.submit(
        request(configuration('zonal-statistics', true)),
        recipe,
        env,
      );
    expect(job.state).toBe('AWAITING_APPROVAL');
    expect(job.estimate.ceiling.cells).toBe(1600);
    await expect(service.run(job.id, env)).rejects.toThrow(/diizinkan/);
    expect(() =>
      parseGISToolRequest({ tool: 'approveCompute', jobId: job.id }),
    ).toThrow();
    expect(() =>
      service.approve(
        job.id,
        job.requestHash,
        { ...job.estimate.ceiling, cells: 1601 },
        env,
      ),
    ).toThrow();
    expect(() =>
      service.approve(job.id, '0'.repeat(64), job.estimate.ceiling, env),
    ).toThrow();
    service.approve(job.id, job.requestHash, job.estimate.ceiling, env);
    const done = await service.run(job.id, env);
    expect(done.state).toBe('COMPLETED');
    expect(done.result?.raster).toMatchObject({
      data: {
        kind: 'statistics',
        statistics: { kind: 'categorical', mean: null },
      },
    });
    expect(() =>
      service.approve(job.id, job.requestHash, job.estimate.ceiling, env),
    ).toThrow();
  });
  it('never treats unknown external cost as free and cannot activate missing flood adapter', async () => {
    const service = new DevelopmentComputeService(),
      env = environment(),
      job = service.submit(
        request(configuration('flood-susceptibility')),
        recipe,
        env,
      );
    expect(job.estimate).toMatchObject({
      monetaryCost: 'UNKNOWN',
      costClass: 'APPROVAL_REQUIRED_ANALYSIS',
      adapterAvailable: false,
    });
    expect(() =>
      service.approve(job.id, job.requestHash, job.estimate.ceiling, env),
    ).toThrow(/belum tersedia/);
    await expect(service.run(job.id, env)).rejects.toThrow();
    expect(service.get(job.id, env).result).toBeNull();
  });
  it('rejects malformed weights, invented inputs, AOI and unsupported operations', () => {
    const env = environment();
    const c = configuration('wlc');
    for (const bad of [
      { ...c, weights: { bencana: 1, kesuburan: 1, kepadatan: 1 } },
      { ...c, inputDatasetIds: ['invented'] },
      {
        ...c,
        selectedAOI: { id: 'kecamatan-x', kind: 'administrative', name: 'X' },
      },
    ])
      expect(() =>
        validateComputeRequest(
          request(bad as GISAnalysisConfiguration),
          env,
          recipe,
        ),
      ).toThrow();
    expect(() =>
      parseComputeTool({
        tool: 'calculateDistance',
        points: [
          [181, 0],
          [0, 0],
        ],
      }),
    ).toThrow();
    expect(() =>
      parseComputeTool({ tool: 'calculateArea', aoiId: 'x', approved: true }),
    ).toThrow();
    expect(() =>
      parseComputeTool({ tool: 'createBuffer', radius: 50 }),
    ).toThrow();
  });
  it('revalidates entitlement at execution and binds actor/project without exposing approval', async () => {
    const restricted = catalog.map((d) =>
      d.id === 'demo-landcover'
        ? { ...d, accessTier: 'restricted' as const, projectId: 'p' }
        : d,
    );
    const env = {
      ...environment(),
      catalog: restricted,
      context: { role: 'b2b_client' as const, entitledProjectIds: ['p', 'q'] },
    };
    const c = refreshConfigurationSources(
        configuration('zonal-statistics', true),
        restricted,
      ),
      req = { ...request(c), projectId: 'p' };
    const service = new DevelopmentComputeService(),
      job = service.submit(req, recipe, env);
    expect(() =>
      service.get(job.id, { ...env, requesterId: 'other' }),
    ).toThrow();
    expect(() =>
      service.approve(job.id, job.requestHash, job.estimate.ceiling, {
        ...env,
        requesterId: 'other',
      }),
    ).toThrow();
    expect(() =>
      service.submit({ ...req, projectId: 'q' }, recipe, env),
    ).toThrow();
    service.approve(job.id, job.requestHash, job.estimate.ceiling, env);
    await expect(
      service.run(job.id, {
        ...env,
        context: { role: 'b2b_client', entitledProjectIds: [] },
      }),
    ).rejects.toThrow();
    expect(JSON.stringify(job)).not.toContain('requesterId');
  });
  it('deduplicates exact requests and rejects changed arguments under the same key', async () => {
    const service = new DevelopmentComputeService(),
      env = environment(),
      req = request(),
      job = service.submit(req, recipe, env);
    expect(service.submit(req, recipe, env).id).toBe(job.id);
    expect(() =>
      service.submit(
        { ...req, configuration: { ...req.configuration!, name: 'Changed' } },
        recipe,
        env,
      ),
    ).toThrow(/Idempotency/);
    const execute = vi.fn(env.execute);
    const e = { ...env, execute };
    const first = service.run(job.id, e);
    const concurrent = await service.run(job.id, e);
    expect(concurrent.state).toBe('RUNNING');
    await first;
    await service.run(job.id, e);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('limits full native grids, job count, concurrent work and input complexity', async () => {
    const large = catalog.map((d) =>
      d.id === 'demo-rainfall'
        ? {
            ...d,
            raster: {
              ...d.raster!,
              grid: { ...d.raster!.grid, width: 10000, height: 10000 },
            },
          }
        : d,
    );
    expect(() =>
      validateComputeRequest(
        request(refreshConfigurationSources(configuration(), large)),
        { ...access, catalog: large },
        recipe,
      ),
    ).toThrow();
    const service = new DevelopmentComputeService(),
      env = environment();
    for (let i = 0; i < 32; i++)
      service.submit(request(configuration('ahp-smce')), recipe, env);
    expect(() => service.submit(request(), recipe, env)).toThrow(/Batas job/);
  });
  it('enforces legal state transitions and terminal rejection', () => {
    const service = new DevelopmentComputeService(),
      env = environment(),
      job = service.submit(request(), recipe, env);
    expect(() => transition(job, 'COMPLETED')).toThrow();
    const rejected = service.reject(job.id, env);
    expect(rejected.state).toBe('REJECTED');
    expect(() => service.retry(job.id, env)).toThrow();
  });
  it('expires approvals and requires fresh approval after cancellation/retry', async () => {
    let now = 1000;
    const service = new DevelopmentComputeService(() => now),
      env = environment(),
      job = service.submit(
        request(configuration('zonal-statistics', true)),
        recipe,
        env,
      );
    service.approve(job.id, job.requestHash, job.estimate.ceiling, env);
    now += 300001;
    await expect(service.run(job.id, env)).rejects.toThrow(/kedaluwarsa/);
    service.cancel(job.id, env);
    expect(service.retry(job.id, env).state).toBe('AWAITING_APPROVAL');
    await expect(service.run(job.id, env)).rejects.toThrow();
  });
  it('discards late provider results after cancellation and allows bounded retry', async () => {
    const service = new DevelopmentComputeService(),
      env = environment(),
      job = service.submit(request(), recipe, env);
    let resolve!: () => void;
    const blocked = {
      ...env,
      execute: async (...args: Parameters<typeof env.execute>) => {
        await new Promise<void>((r) => (resolve = r));
        return env.execute(...args);
      },
    };
    const running = service.run(job.id, blocked);
    service.cancel(job.id, env);
    resolve();
    const cancelled = await running;
    expect(cancelled.state).toBe('CANCELLED');
    expect(cancelled.result).toBeNull();
    expect(service.retry(job.id, env).attempt).toBe(2);
    expect((await service.run(job.id, env)).state).toBe('COMPLETED');
  });
  it('records masked failure and retries at most three attempts', async () => {
    const service = new DevelopmentComputeService(),
      env = {
        ...environment(),
        execute: async () => {
          throw Error('secret backend detail');
        },
      },
      job = service.submit(request(), recipe, env);
    for (let i = 0; i < 3; i++) {
      const failed = await service.run(job.id, env);
      expect(failed.state).toBe('FAILED');
      expect(JSON.stringify(failed)).not.toContain('secret backend');
      if (i < 2) service.retry(job.id, env);
    }
    expect(() => service.retry(job.id, env)).toThrow();
  });
  it('fails a stalled adapter at the deadline without fabricating results', async () => {
    vi.useFakeTimers();
    const service = new DevelopmentComputeService(),
      env = { ...environment(), execute: () => new Promise<never>(() => {}) },
      job = service.submit(request(), recipe, env);
    const pending = service.run(job.id, env);
    await vi.advanceTimersByTimeAsync(5001);
    expect((await pending).state).toBe('FAILED');
    expect(service.get(job.id, env).result).toBeNull();
  });
  it('preserves AHP and WLC math including missing scores', async () => {
    const service = new DevelopmentComputeService(),
      env = environment();
    for (const type of ['ahp-smce', 'wlc'] as const) {
      const c = configuration(type),
        j = service.submit(request(c), recipe, env),
        done = await service.run(j.id, env);
      expect(done.state).toBe('COMPLETED');
      if (type === 'wlc') expect(done.result?.values.score).toBeNull();
      else expect(done.result?.values.consistencyRatio).toBeTypeOf('number');
    }
    const c = configuration('wlc');
    if (c.analysisType !== 'wlc') throw Error();
    c.parameters.scores = { bencana: 1, kesuburan: 5, kepadatan: 5 };
    const j = service.submit(request(c), recipe, env);
    expect((await service.run(j.id, env)).result?.values.score).toBeCloseTo(5);
  });
  it('integrates natural language, recipe, undo/redo and report without a second map engine', async () => {
    const env = environment(),
      original = emptyRecipe(),
      toolEnv = {
        ...access,
        configurations: [],
        raster,
        signal: new AbortController().signal,
        compute: { env, requestKey: crypto.randomUUID() },
      };
    const provider = createControlledDemoProvider();
    const plan = await planWithProvider(
      provider,
      planningInput('Hitung luas area contoh Barat', original, toolEnv),
    );
    const response = await executeGISPlan(plan, original, toolEnv);
    expect(response.changed).toBe(true);
    expect(response.recipe.analysisResults).toHaveLength(1);
    parseGISRunResponse(response, toolEnv);
    useWorkspaceStore.setState({ recipe: original, past: [], future: [] });
    useWorkspaceStore
      .getState()
      .configure([...catalog], 'demo', access.context);
    useWorkspaceStore.getState().replace(response.recipe, 'Compute');
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().recipe.analysisResults).toBeUndefined();
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().recipe.analysisResults).toHaveLength(1);
    const result = response.results[0].data;
    if (result.kind !== 'compute') throw Error();
    expect(
      applyComputeJob(
        response.recipe,
        result.job,
        catalog,
        access.context,
        'demo',
      ).analysisResults,
    ).toHaveLength(1);
  });
  it('does not invent a real Kecamatan X flood result, and rejects multi-operation compute batches', async () => {
    const env = {
      ...access,
      configurations: [],
      raster,
      signal: new AbortController().signal,
    };
    const provider = createControlledDemoProvider();
    const p = await planWithProvider(
      provider,
      planningInput(
        'Analisis kerawanan banjir Kecamatan X menggunakan konfigurasi yang tersedia dan tampilkan hasilnya',
        recipe,
        env,
      ),
    );
    expect(p.resolution).toBe('unsupported');
    expect(p.steps).toEqual([]);
    const valid = await planWithProvider(
      provider,
      planningInput('Hitung luas area contoh Barat', recipe, env),
    );
    await expect(
      executeGISPlan(
        {
          ...valid,
          steps: [
            ...valid.steps,
            { id: 'extra', action: { tool: 'listAvailableLayers' } },
          ],
        },
        recipe,
        env,
      ),
    ).rejects.toThrow(/Satu job/);
  });
});
