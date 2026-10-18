import 'server-only';
import { record } from '../../../gis/validation';
import {
  parseVectorAnalysisRequest,
  parseVectorAnalysisResult,
  type VectorAnalysisRequest,
  type VectorAnalysisResult,
} from '../../../gis/vectorAnalysis';
import { localVectorRpc } from './local';
import { VectorStorageError } from './repository';
export interface VectorSpatialAnalysisRepository {
  execute(input: VectorAnalysisRequest): Promise<VectorAnalysisResult>;
}
export function createVectorSpatialAnalysis(
  rpc: (input: VectorAnalysisRequest) => Promise<unknown>,
): VectorSpatialAnalysisRepository {
  return {
    async execute(input) {
      const request = parseVectorAnalysisRequest(input);
      const result = parseVectorAnalysisResult(await rpc(request));
      // JSONB key order is irrelevant; compare parsed request values by canonical keys.
      const canonical = (v: unknown): string =>
        JSON.stringify(v, (_, x) =>
          x && typeof x === 'object' && !Array.isArray(x)
            ? Object.fromEntries(
                Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
              )
            : x,
        );
      if (canonical(result.request) !== canonical(request))
        throw new VectorStorageError(
          502,
          'Respons analisis tidak sesuai input',
        );
      return result;
    },
  };
}
export function getLocalVectorAnalysis(token: string | null) {
  if (!token)
    throw new VectorStorageError(401, 'Autentikasi diperlukan untuk analisis');
  const rpc = localVectorRpc(token, 'p4i_vector_analyze');
  return createVectorSpatialAnalysis((input) => rpc({ input }));
}

export async function estimateLocalVectorAnalysis(
  token: string | null,
  input: unknown,
) {
  if (!token) throw new VectorStorageError(401, 'Autentikasi diperlukan');
  const raw = await localVectorRpc(
    token,
    'p4i_vector_analyze',
  )({ input: parseVectorAnalysisRequest(input), preview: true });
  if (
    !record(raw) ||
    raw.costClass !== 'LOW_COST_ANALYSIS' ||
    !Number.isSafeInteger(raw.features) ||
    Number(raw.features) < 1 ||
    Number(raw.features) > 40 ||
    !Number.isSafeInteger(raw.vertices) ||
    Number(raw.vertices) < 1 ||
    Number(raw.vertices) > 2048 ||
    !Number.isSafeInteger(raw.pairTests) ||
    Number(raw.pairTests) < 0 ||
    Number(raw.pairTests) > 400
  )
    throw new VectorStorageError(502, 'Estimasi tidak valid');
  return raw as unknown as VectorAnalysisResult['estimate'];
}
