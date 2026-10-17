import { freeAiStatus } from '../../../../lib/server/ai/providers/geminiFree';
import { SafeProviderError } from '../../../../lib/server/ai/providerError';
import {
  RequestBudgetExceeded,
  requestBudgets,
} from '../../../../lib/server/requestBudget';
import { COMPUTE_TOOLS } from '../../../../lib/gis/computeContracts';
import {
  computeEnvironment,
  requireHumanOrigin,
} from '../../../../lib/server/compute/access';
import { NextResponse } from 'next/server';
import { getAIProvider } from '../../../../lib/server/ai';
import { getGisProvider } from '../../../../lib/server/gis';
import { getGisContext } from '../../../../lib/server/gis/context';
import { getRasterProvider } from '../../../../lib/server/gis/rasterProvider';
import {
  record,
  parseRecipe,
  GisInputError,
  text,
} from '../../../../lib/gis/validation';
import { parseAnalysisConfiguration } from '../../../../lib/gis/analysisConfiguration';
import {
  exact,
  parseGISRunResponse,
  parseGISExecutionPlan,
} from '../../../../lib/gis/copilotValidation';
import {
  COPILOT_LIMITS,
  type GISExecutionContext,
} from '../../../../lib/gis/copilotContracts';
import {
  assertRecipeAccess,
  GisPermissionError,
} from '../../../../lib/gis/recipe';
import { gisError, readGisBody } from '../../../../lib/server/gis/http';
import {
  planningInput,
  planWithProvider,
  executeGISPlan,
  bounded,
  AIProviderError,
} from '../../../../lib/server/ai/execution';
export const runtime = 'nodejs';
export const maxDuration = 20;
export async function GET() {
  return NextResponse.json(freeAiStatus(process.env), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    release = requestBudgets.copilot.acquire();
    const body = await readGisBody(request);
    if (
      !record(body) ||
      (body.plan === undefined &&
        (!text(body.prompt, 2000) ||
          !(
            body.execution === undefined ||
            ['auto', 'preview'].includes(String(body.execution))
          )))
    )
      throw new GisInputError('Instruksi/mode Copilot tidak valid');
    exact(
      body,
      body.plan === undefined
        ? [
            'prompt',
            'recipe',
            'configurations',
            'execution',
            'requestId',
            'selectedVectorIds',
          ]
        : ['plan', 'recipe', 'configurations', 'requestId'],
    );
    const gis = getGisProvider(),
      catalog = gis.catalog(),
      context = await getGisContext(request, catalog);
    const recipe = parseRecipe(body.recipe, catalog);
    assertRecipeAccess(recipe, catalog, context);
    if (
      body.configurations !== undefined &&
      (!Array.isArray(body.configurations) ||
        body.configurations.length > COPILOT_LIMITS.configurations)
    )
      throw new GisInputError('Konteks konfigurasi tidak valid');
    const configurations = (
      Array.isArray(body.configurations) ? body.configurations : []
    ).map((c) => parseAnalysisConfiguration(c, catalog));
    const env: GISExecutionContext = {
      catalog,
      context,
      mode: gis.mode,
      configurations,
    };
    const input = planningInput(
      typeof body.prompt === 'string'
        ? body.prompt
        : 'Terapkan rencana yang ditinjau',
      recipe,
      env,
    );
    if (body.selectedVectorIds !== undefined) {
      if (
        !Array.isArray(body.selectedVectorIds) ||
        body.selectedVectorIds.length > 100 ||
        new Set(body.selectedVectorIds).size !==
          body.selectedVectorIds.length ||
        !body.selectedVectorIds.every(
          (id) =>
            typeof id === 'string' &&
            recipe.sketchLayers?.some((l) =>
              l.data.features.some((f) => f.id === id),
            ),
        )
      )
        throw new GisInputError('Pilihan objek tidak valid');
      input.selectedVectorIds = body.selectedVectorIds as string[];
    }
    const provider = getAIProvider();
    if (!provider)
      return NextResponse.json(
        {
          status: 'unavailable',
          error:
            'Provider AI nyata belum dikonfigurasi; planner DEMO hanya dalam development.',
        },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    const plan =
      body.plan === undefined
        ? await planWithProvider(provider, input, request.signal)
        : parseGISExecutionPlan(body.plan, provider);
    const isCompute = plan.steps.some((s) =>
      (COMPUTE_TOOLS as readonly string[]).includes(s.action.tool),
    );
    if (isCompute) requireHumanOrigin(request);
    const computeSession = isCompute ? await computeEnvironment(request) : null;
    if (body.requestId !== undefined && !text(body.requestId, 100))
      throw new GisInputError('ID permintaan tidak valid');
    const compute = computeSession
      ? {
          env: computeSession.env,
          requestKey:
            typeof body.requestId === 'string' ? body.requestId : plan.id,
        }
      : undefined;
    const response = await bounded(
      (signal) =>
        executeGISPlan(
          plan,
          recipe,
          { ...env, raster: getRasterProvider(gis), signal, compute },
          body.execution === 'preview' ? 'preview' : 'auto',
        ),
      COPILOT_LIMITS.executionMs,
      request.signal,
    );
    // Same response parser protects client and server; the selected provider is currently DEMO.
    const output = NextResponse.json(
      parseGISRunResponse(response, env, provider),
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
    return computeSession ? computeSession.attach(output) : output;
  } catch (error) {
    if (error instanceof SafeProviderError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status:
            error.code === 'QUOTA_EXHAUSTED'
              ? 429
              : error.code === 'PRIVATE_CONTEXT_BLOCKED'
                ? 403
                : 503,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    if (error instanceof RequestBudgetExceeded)
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: {
            'Retry-After': String(error.retryAfter),
            'Cache-Control': 'private, no-store',
          },
        },
      );
    if (error instanceof AIProviderError)
      return NextResponse.json(
        {
          error:
            'Copilot gagal atau output tidak valid. Tidak ada perubahan sesi diterapkan.',
        },
        { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
      );
    if (error instanceof GisPermissionError)
      return NextResponse.json(
        { error: error.message },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
      );
    return gisError(error);
  } finally {
    release?.();
  }
}
