import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  createStructuredAIProvider,
  type ApprovedPlannerBinding,
} from '../lib/server/ai/providers/structured';
import { emptyRecipe } from '../lib/gis/catalog';
import { executeGISPlan, planningInput } from '../lib/server/ai/execution';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { getRasterProvider } from '../lib/server/gis/rasterProvider';
const gis = createDemoGisProvider(),
  env = {
    catalog: gis.catalog(),
    context: { role: 'guest' as const, entitledProjectIds: [] },
    mode: 'demo' as const,
    configurations: [],
    raster: getRasterProvider(gis),
    signal: new AbortController().signal,
  };
const input = () => planningInput('Peta uji', emptyRecipe(), env);
const plan = () => ({
  schemaVersion: 1,
  id: 'real-test-plan',
  provider: { id: 'test-transport', mode: 'real' },
  intent: 'modify-map',
  resolution: 'ready',
  message: 'Prepared by test transport',
  steps: [{ id: 's1', action: { tool: 'setMapTitle', title: 'Test' } }],
  limitations: [],
});
function binding(): ApprovedPlannerBinding {
  return {
    providerId: 'test-transport',
    model: 'test-model',
    authorizationReference: 'LOCAL-TRANSPORT-TEST-ONLY',
    dataProcessingApproved: true,
    transport: {
      complete: vi.fn(async () => ({
        plan: plan(),
        usage: { inputTokens: 12, outputTokens: 8 },
      })),
    },
    recordUsage: vi.fn(async () => {}),
  };
}
describe('structured real-provider integration seam (no external HTTP)', () => {
  it('validates plan and executes through existing controlled registry with usage explicitly unpriced', async () => {
    const b = binding();
    const result = await createStructuredAIProvider(b).plan(input());
    const output = await executeGISPlan(
      result as Parameters<typeof executeGISPlan>[0],
      emptyRecipe(),
      env,
    );
    expect(output.recipe.title).toBe('Test');
    expect(output.changed).toBe(true);
    expect(b.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'succeeded',
        inputTokens: 12,
        outputTokens: 8,
        cost: 'UNKNOWN',
      }),
    );
    expect(
      JSON.stringify((b.recordUsage as ReturnType<typeof vi.fn>).mock.calls),
    ).not.toContain('Peta uji');
  });
  it('requires a trusted approved binding before transport use', () => {
    const b = binding();
    expect(() =>
      createStructuredAIProvider({
        ...b,
        dataProcessingApproved: false,
      } as unknown as ApprovedPlannerBinding),
    ).toThrow();
    expect(() =>
      createStructuredAIProvider({ ...b, authorizationReference: '' }),
    ).toThrow();
    expect(b.transport.complete).not.toHaveBeenCalled();
  });
  it('fails closed on transport failure, unknown tools, oversized output and invalid token usage', async () => {
    for (const response of [
      new Error('PRIVATE_PROVIDER_SECRET'),
      {
        plan: {
          ...plan(),
          steps: [{ id: 's1', action: { tool: 'approveDeliverable' } }],
        },
        usage: null,
      },
      { plan: { ...plan(), message: 'x'.repeat(300000) }, usage: null },
      { plan: plan(), usage: { inputTokens: -1, outputTokens: 2 } },
    ]) {
      const b = binding();
      b.transport.complete = vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      });
      await expect(createStructuredAIProvider(b).plan(input())).rejects.toThrow(
        'no fallback',
      );
      expect(b.transport.complete).toHaveBeenCalledTimes(1);
      expect(b.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed' }),
      );
    }
  });
  it('returns no plan when usage recording fails or a request was already cancelled', async () => {
    const b = binding();
    b.recordUsage = vi.fn(async () => {
      throw new Error('ledger unavailable');
    });
    await expect(createStructuredAIProvider(b).plan(input())).rejects.toThrow(
      'no fallback',
    );
    const c = binding(),
      abort = new AbortController();
    abort.abort();
    await expect(
      createStructuredAIProvider(c).plan(input(), abort.signal),
    ).rejects.toThrow();
    expect(c.transport.complete).not.toHaveBeenCalled();
  });
  it('cannot turn provider output into cross-dataset access or publication authorization', async () => {
    const b = binding();
    b.transport.complete = vi.fn(async () => ({
      plan: {
        ...plan(),
        steps: [
          {
            id: 's1',
            action: { tool: 'addLayer', datasetId: 'invented-private-id' },
          },
        ],
      },
      usage: null,
    }));
    const proposed = await createStructuredAIProvider(b).plan(input());
    await expect(
      executeGISPlan(
        proposed as Parameters<typeof executeGISPlan>[0],
        emptyRecipe(),
        env,
      ),
    ).rejects.toThrow();
  });
});
