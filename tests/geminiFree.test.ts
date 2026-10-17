import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
vi.mock('server-only', () => ({}));
import {
  createGeminiFreeProvider,
  verifyFreePolicy,
  publicSyntheticInput,
  freeAiStatus,
} from '../lib/server/ai/providers/geminiFree';
import { GEMINI_FREE_MODEL, SYNTHETIC_GEMINI_PROMPT } from '../lib/gis/freeAi';
import { emptyRecipe } from '../lib/gis/catalog';
import { getAIProvider } from '../lib/server/ai';
import { planWithProvider } from '../lib/server/ai/execution';
const now = Date.now(),
  key = 'synthetic-key-never-valid';
const env = () => ({
  NODE_ENV: 'development',
  AI_PROVIDER: 'gemini-free',
  GEMINI_FREE_ENABLED: 'true',
  GEMINI_MODEL: GEMINI_FREE_MODEL,
  GEMINI_BILLING_STATUS: 'verified-free',
  GEMINI_PUBLIC_SYNTHETIC_APPROVED: 'true',
  GEMINI_PROJECT_ID: 'synthetic-local-test',
  GEMINI_OPERATOR_REFERENCE: 'LOCAL-MOCK-ONLY',
  GEMINI_VERIFIED_AT: new Date(now).toISOString(),
  GEMINI_API_KEY: key,
  GEMINI_VERIFIED_KEY_SHA256: createHash('sha256').update(key).digest('hex'),
});
const input = () => ({
  prompt: SYNTHETIC_GEMINI_PROMPT,
  recipe: emptyRecipe(),
  catalog: [],
  configurations: [],
  aois: [],
});
const response = (
  actions: unknown[] = [{ tool: 'createMap', title: 'Latihan Publik' }],
) =>
  Response.json({
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            {
              text: JSON.stringify({
                resolution: 'ready',
                message: 'Synthetic test',
                actions,
              }),
            },
          ],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
  });
afterEach(() => vi.unstubAllEnvs());
describe('Gemini Free Tier is fail-closed; all HTTP calls here are mocks', () => {
  it.each([
    'GEMINI_FREE_ENABLED',
    'GEMINI_BILLING_STATUS',
    'GEMINI_PROJECT_ID',
    'GEMINI_OPERATOR_REFERENCE',
    'GEMINI_VERIFIED_AT',
    'GEMINI_VERIFIED_KEY_SHA256',
    'GEMINI_PUBLIC_SYNTHETIC_APPROVED',
  ])('refuses missing %s without external calls', async (field) => {
    const e: Record<string, string> = { ...env() };
    delete e[field];
    const fetcher = vi.fn();
    await expect(
      createGeminiFreeProvider({ env: () => e, fetcher, now: () => now }).plan(
        input(),
      ),
    ).rejects.toMatchObject({ code: 'FREE_TIER_UNVERIFIED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires a key, correct model and unexpired matching project/key attestation', () => {
    expect(() =>
      verifyFreePolicy({ ...env(), GEMINI_API_KEY: '' }, now),
    ).toThrow(/Kunci/);
    expect(() =>
      verifyFreePolicy({ ...env(), GEMINI_MODEL: 'paid-model' }, now),
    ).toThrow();
    expect(() => verifyFreePolicy(env(), now + 3600001)).toThrow();
    expect(() =>
      verifyFreePolicy({ ...env(), GEMINI_API_KEY: 'replaced' }, now),
    ).toThrow();
    expect(() =>
      verifyFreePolicy({ ...env(), GEMINI_BILLING_STATUS: 'paid' }, now),
    ).toThrow();
  });
  it('never allows production external calls and never selects a paid fallback', async () => {
    const fetcher = vi.fn();
    await expect(
      createGeminiFreeProvider({
        env: () => ({ ...env(), NODE_ENV: 'production' }),
        fetcher,
        now: () => now,
      }).plan(input()),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv('AI_PROVIDER', 'paid-provider');
    vi.stubEnv('GIS_DEMO_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getAIProvider()).toBeNull();
    expect(freeAiStatus({})).toMatchObject({
      externalEnabled: false,
      liveStatus: 'LIVE_INTEGRATION_PENDING',
    });
  });
  it('refuses arbitrary/private prompts, descriptions, precise coordinates and configuration context', async () => {
    const fetcher = vi.fn(),
      provider = createGeminiFreeProvider({ env, fetcher, now: () => now });
    for (const bad of [
      { ...input(), prompt: 'Rahasia klien' },
      {
        ...input(),
        recipe: { ...emptyRecipe(), description: 'private client' },
      },
      {
        ...input(),
        recipe: {
          ...emptyRecipe(),
          viewport: { center: [-1, 103] as [number, number], zoom: 12 },
        },
      },
      { ...input(), selectedVectorIds: ['local-feature-1'] },
    ])
      await expect(provider.plan(bad)).rejects.toMatchObject({
        code: 'PRIVATE_CONTEXT_BLOCKED',
      });
    expect(fetcher).not.toHaveBeenCalled();
    expect(publicSyntheticInput(input())).toEqual(input());
  });
  it('uses official structured REST with fixed model, bounded generation and no tools/retries/URLs from the caller', async () => {
    const fetcher = vi.fn(async () => response()),
      usage = vi.fn(async () => {});
    const provider = createGeminiFreeProvider({
      env,
      fetcher,
      now: () => now,
      recordUsage: usage,
    });
    const plan = await planWithProvider(provider, input());
    expect(plan.steps[0].action).toEqual({
      tool: 'createMap',
      title: 'Latihan Publik',
    });
    const args = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(args[0]).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent`,
    );
    const body = JSON.parse(args[1].body as string);
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(body.tools).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(key);
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 100,
        outputTokens: 50,
        cost: 'UNKNOWN',
      }),
    );
    expect(JSON.stringify(usage.mock.calls)).not.toContain(
      SYNTHETIC_GEMINI_PROMPT,
    );
  });
  it('caps requests per minute and provider instance lifetime, even after failed requests', async () => {
    let clock = now;
    const fetcher = vi.fn(async () => response()),
      provider = createGeminiFreeProvider({ env, fetcher, now: () => clock });
    await provider.plan(input());
    await expect(provider.plan(input())).rejects.toMatchObject({
      code: 'QUOTA_EXHAUSTED',
    });
    for (let i = 1; i < 5; i++) {
      clock += 60001;
      await provider.plan(input());
    }
    clock += 60001;
    await expect(provider.plan(input())).rejects.toMatchObject({
      code: 'QUOTA_EXHAUSTED',
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it.each([429, 403, 404, 500])(
    'redacts HTTP %i and does not switch model or provider',
    async (status) => {
      const fetcher = vi.fn(
        async () => new Response('provider-sensitive-text', { status }),
      );
      await expect(
        createGeminiFreeProvider({ env, fetcher, now: () => now }).plan(
          input(),
        ),
      ).rejects.toMatchObject({
        code: status === 429 ? 'QUOTA_EXHAUSTED' : 'MODEL_UNAVAILABLE',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects arbitrary code, trusted IDs and oversize responses', async () => {
    for (const actions of [
      [{ tool: 'runFloodAnalysis' }],
      [
        {
          tool: 'createPoint',
          layerId: 'local-vector-1',
          name: 'Invented',
          coordinates: [103, -1],
        },
      ],
      [{ tool: 'createVectorLayer', name: 'bad', id: 'trusted' }],
      [{ tool: 'executeSQL', sql: 'select' }],
    ]) {
      const fetcher = vi.fn(async () => response(actions));
      await expect(
        createGeminiFreeProvider({ env, fetcher, now: () => now }).plan(
          input(),
        ),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const fetcher = vi.fn(async () => new Response('x'.repeat(32769)));
    await expect(
      createGeminiFreeProvider({ env, fetcher, now: () => now }).plan(input()),
    ).rejects.toMatchObject({ code: 'INVALID_PROVIDER_OUTPUT' });
  });
  it('aborts timeout without retry or demo fallback', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(Error('secret timeout')),
            ),
          ),
      );
      const promise = createGeminiFreeProvider({
        env,
        fetcher,
        now: () => now,
      }).plan(input());
      const assertion = expect(promise).rejects.toThrow(/no fallback/);
      await vi.advanceTimersByTimeAsync(5001);
      await assertion;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
