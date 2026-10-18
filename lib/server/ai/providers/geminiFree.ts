import 'server-only';
import { createHash } from 'node:crypto';
import type {
  AIProvider,
  GISPlanningInput,
} from '../../../gis/copilotContracts';
import {
  GEMINI_FREE_MODEL,
  GEMINI_FREE_PROVIDER,
  SYNTHETIC_GEMINI_PROMPT,
  type FreeAiStatus,
} from '../../../gis/freeAi';
import { emptyRecipe } from '../../../gis/catalog';
import { parseMapAction, record } from '../../../gis/validation';
import { byteSize } from '../../../gis/copilotValidation';
import { SafeProviderError } from '../providerError';
import {
  createStructuredAIProvider,
  type StructuredPlanningTransport,
  type PlanningUsage,
} from './structured';

type Environment = Record<string, string | undefined>;
export function verifyFreePolicy(env: Environment, now = Date.now()): string {
  if (
    env.NODE_ENV === 'production' ||
    env.AI_PROVIDER !== 'gemini-free' ||
    env.GEMINI_FREE_ENABLED !== 'true' ||
    env.GEMINI_MODEL !== GEMINI_FREE_MODEL ||
    env.GEMINI_BILLING_STATUS !== 'verified-free' ||
    env.GEMINI_PUBLIC_SYNTHETIC_APPROVED !== 'true' ||
    !env.GEMINI_PROJECT_ID ||
    !env.GEMINI_OPERATOR_REFERENCE
  )
    throw new SafeProviderError('FREE_TIER_UNVERIFIED');
  const verified = Date.parse(env.GEMINI_VERIFIED_AT ?? '');
  if (!Number.isFinite(verified) || verified > now || now - verified > 3600000)
    throw new SafeProviderError('FREE_TIER_UNVERIFIED');
  if (!env.GEMINI_API_KEY) throw new SafeProviderError('API_KEY_MISSING');
  const digest = createHash('sha256').update(env.GEMINI_API_KEY).digest('hex');
  if (digest !== env.GEMINI_VERIFIED_KEY_SHA256)
    throw new SafeProviderError('FREE_TIER_UNVERIFIED');
  return env.GEMINI_API_KEY;
}
export function freeAiStatus(env: Environment): FreeAiStatus {
  if (
    (!env.AI_PROVIDER || env.AI_PROVIDER === 'demo') &&
    env.NODE_ENV !== 'production' &&
    env.GIS_DEMO_MODE === 'true'
  )
    return {
      provider: 'demo',
      liveStatus: 'LIVE_INTEGRATION_PENDING',
      externalEnabled: false,
      reason: 'Planner DEMO deterministik lokal. Gemini belum diuji live.',
    };
  if (env.AI_PROVIDER !== 'gemini-free')
    return {
      provider: 'unavailable',
      liveStatus: 'LIVE_INTEGRATION_PENDING',
      externalEnabled: false,
      reason: 'Provider tidak tersedia. Tidak ada fallback berbayar.',
    };
  try {
    verifyFreePolicy(env);
    return {
      provider: 'gemini-free',
      liveStatus: 'LIVE_INTEGRATION_PENDING',
      externalEnabled: true,
      reason:
        'Izin operator sementara; hanya sampel sintetik. Status billing tidak dapat dibuktikan aplikasi.',
    };
  } catch (e) {
    return {
      provider: 'gemini-free',
      liveStatus: 'LIVE_INTEGRATION_PENDING',
      externalEnabled: false,
      reason:
        e instanceof SafeProviderError ? e.message : 'Integrasi belum tersedia',
    };
  }
}
/** Discard the supplied object after exact allowlist matching. No arbitrary prompt or map metadata is transmitted. */
export function publicSyntheticInput(
  input: GISPlanningInput,
): GISPlanningInput {
  if (
    input.selectedVectorIds?.length ||
    input.prompt !== SYNTHETIC_GEMINI_PROMPT ||
    JSON.stringify(input.recipe) !== JSON.stringify(emptyRecipe()) ||
    input.configurations.length ||
    input.catalog.some(
      (d) => d.accessTier !== 'public' || d.status !== 'demo',
    ) ||
    input.aois.some((a) => a.kind !== 'demo')
  )
    throw new SafeProviderError('PRIVATE_CONTEXT_BLOCKED');
  return {
    prompt: SYNTHETIC_GEMINI_PROMPT,
    recipe: emptyRecipe(),
    catalog: [],
    configurations: [],
    aois: [],
  };
}
const coord = {
  type: 'array',
  items: { type: 'number' },
  minItems: 2,
  maxItems: 2,
};
const style = {
  type: 'object',
  properties: {
    color: { type: 'string' },
    fillColor: { type: 'string' },
    weight: { type: 'number' },
    fillOpacity: { type: 'number' },
    radius: { type: 'number' },
  },
  required: ['color', 'fillColor', 'weight', 'fillOpacity', 'radius'],
  additionalProperties: false,
};
const allowed = [
  'createMap',
  'setMapTitle',
  'setBasemap',
  'setViewport',
  'createVectorLayer',
  'updateVectorLayer',
  'createPoint',
  'createMultiplePoints',
  'createPolygon',
  'createPolygonFromSelectedPoints',
  'updateFeatureGeometry',
  'updateFeatureProperties',
  'styleFeature',
  'deleteFeature',
];
// JSON schema is an output aid, not a substitute for parseMapAction and reducer preflight.
export const GEMINI_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    resolution: {
      type: 'string',
      enum: ['ready', 'needs-input', 'unsupported'],
    },
    message: { type: 'string' },
    actions: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        properties: {
          tool: { type: 'string', enum: allowed },
          title: { type: 'string' },
          basemap: { type: 'string', enum: ['osm', 'none'] },
          center: coord,
          zoom: { type: 'number' },
          name: { type: 'string' },
          layerId: { type: 'string' },
          featureId: { type: 'string' },
          coordinates: coord,
          vertices: { type: 'array', items: coord, maxItems: 128 },
          pointIds: { type: 'array', items: { type: 'string' }, maxItems: 128 },
          points: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                coordinates: coord,
                style,
              },
              required: ['name', 'coordinates'],
              additionalProperties: false,
            },
          },
          style,
          visible: { type: 'boolean' },
          opacity: { type: 'number' },
          index: { type: 'integer' },
          remove: { type: 'boolean' },
          geometry: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['Point', 'Polygon'] },
              coordinates: {
                anyOf: [
                  coord,
                  { type: 'array', items: { type: 'array', items: coord } },
                ],
              },
            },
            required: ['type', 'coordinates'],
            additionalProperties: false,
          },
          description: { type: 'string' },
          attributes: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
        },
        required: ['tool'],
        additionalProperties: false,
      },
    },
  },
  required: ['resolution', 'message', 'actions'],
  additionalProperties: false,
};
async function boundedJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body) throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    buffer.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}
export function createGeminiFreeProvider(deps: {
  env: () => Environment;
  fetcher?: typeof fetch;
  now?: () => number;
  recordUsage?: (event: PlanningUsage) => Promise<void>;
}): AIProvider {
  const now = deps.now ?? Date.now;
  let used = 0,
    last: number | null = null;
  const transport: StructuredPlanningTransport = {
    async complete(request) {
      const env = deps.env(),
        key = verifyFreePolicy(env, now());
      const input = publicSyntheticInput(request.input);
      if (request.model !== GEMINI_FREE_MODEL)
        throw new SafeProviderError('MODEL_UNAVAILABLE');
      // Provider instance lifetime, no automatic reset/retry. Production is disabled until durable quota storage exists.
      if (used >= 5 || (last !== null && now() - last < 60000))
        throw new SafeProviderError('QUOTA_EXHAUSTED');
      const body = {
        systemInstruction: {
          parts: [
            {
              text:
                request.system +
                ' Return {resolution,message,actions}. Only local map editing. Session layer IDs are generated local-vector-1 etc and feature IDs local-feature-1 etc; refer to generated IDs, never assign IDs. No external tools. Coordinates are [longitude,latitude]; viewport center is [latitude,longitude].',
            },
          ],
        },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseJsonSchema: GEMINI_PLAN_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      if (byteSize(body) > 16384)
        throw new SafeProviderError('PRIVATE_CONTEXT_BLOCKED');
      used++;
      last = now();
      const response = await (deps.fetcher ?? fetch)(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify(body),
          signal: request.signal,
          redirect: 'error',
          cache: 'no-store',
        },
      );
      if (response.status === 429) {
        await response.body?.cancel();
        throw new SafeProviderError('QUOTA_EXHAUSTED');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new SafeProviderError('MODEL_UNAVAILABLE');
      }
      const raw = await boundedJson(response, request.signal);
      if (
        !record(raw) ||
        !Array.isArray(raw.candidates) ||
        raw.candidates.length !== 1
      )
        throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
      const candidate = raw.candidates[0];
      if (
        !record(candidate) ||
        candidate.finishReason !== 'STOP' ||
        !record(candidate.content) ||
        !Array.isArray(candidate.content.parts) ||
        candidate.content.parts.length !== 1 ||
        !record(candidate.content.parts[0]) ||
        typeof candidate.content.parts[0].text !== 'string'
      )
        throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
      const result: unknown = JSON.parse(candidate.content.parts[0].text);
      if (
        !record(result) ||
        Object.keys(result).some(
          (k) => !['resolution', 'message', 'actions'].includes(k),
        ) ||
        !Array.isArray(result.actions) ||
        result.actions.length > 16
      )
        throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
      const actions = result.actions.map((a) => {
        const action = parseMapAction(a);
        if (!allowed.includes(action.tool))
          throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
        return action;
      });
      // A live synthetic trial cannot invent coordinates outside the approved sample.
      const samples = new Set(['0,0', '0.01,0', '0.01,0.01']);
      const check = (p: number[]) => {
        if (!samples.has(p.join(',')))
          throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
      };
      for (const a of actions) {
        if (a.tool === 'createPoint') check(a.coordinates);
        if (a.tool === 'createMultiplePoints')
          a.points.forEach((p) => check(p.coordinates));
        if (a.tool === 'createPolygon') a.vertices.forEach(check);
        if (a.tool === 'updateFeatureGeometry') {
          if (a.geometry.type === 'Point') check(a.geometry.coordinates);
          else if (a.geometry.type === 'Polygon')
            a.geometry.coordinates.flat().forEach(check);
          else throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
        }
        if (
          a.tool === 'setViewport' &&
          (a.center[0] !== 0 || a.center[1] !== 0)
        )
          throw new SafeProviderError('INVALID_PROVIDER_OUTPUT');
      }
      const usage = record(raw.usageMetadata) ? raw.usageMetadata : null;
      return {
        plan: {
          schemaVersion: 1,
          id: `plan-${crypto.randomUUID()}`,
          provider: GEMINI_FREE_PROVIDER,
          intent: 'build-map',
          resolution: result.resolution,
          message: result.message,
          steps: actions.map((action, i) => ({ id: `step-${i + 1}`, action })),
          limitations: [
            'Sampel sintetik publik; bukan pengukuran nyata. Billing diverifikasi operator, bukan oleh aplikasi.',
          ],
        },
        usage: usage
          ? {
              inputTokens: Number(usage.promptTokenCount),
              outputTokens: Number(usage.candidatesTokenCount),
            }
          : null,
      };
    },
  };
  return createStructuredAIProvider({
    providerId: GEMINI_FREE_PROVIDER.id,
    model: GEMINI_FREE_MODEL,
    authorizationReference: 'operator-attestation-required-per-request',
    dataProcessingApproved: true,
    transport,
    recordUsage: deps.recordUsage ?? (async () => {}),
  });
}
// Bounded, metadata-only process audit. No prompt, key, coordinates or provider error bodies.
export const geminiUsage: PlanningUsage[] = [];
export const geminiFreeProvider = createGeminiFreeProvider({
  env: () => process.env,
  recordUsage: async (event) => {
    geminiUsage.push(event);
    if (geminiUsage.length > 50) geminiUsage.shift();
  },
});
