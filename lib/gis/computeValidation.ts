import type {
  AnalysisMapResult,
  ComputeJob,
  ComputeState,
  ComputeToolRequest,
} from './computeContracts';
import { COMPUTE_LIMITS } from './computeContracts';
import { finite, record, text, GisInputError } from './validation';
import { parseProcessingResult } from './processingValidation';
export const COMPUTE_TRANSITIONS: Record<
  ComputeState,
  readonly ComputeState[]
> = {
  DRAFT: ['ESTIMATING'],
  ESTIMATING: ['AWAITING_APPROVAL', 'QUEUED', 'REJECTED'],
  AWAITING_APPROVAL: ['QUEUED', 'CANCELLED', 'REJECTED'],
  QUEUED: ['RUNNING', 'CANCELLED', 'REJECTED'],
  RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: ['ESTIMATING'],
  CANCELLED: ['ESTIMATING'],
  REJECTED: [],
};
export function transition(job: ComputeJob, next: ComputeState) {
  if (!COMPUTE_TRANSITIONS[job.state].includes(next))
    throw new GisInputError(`Transisi job ${job.state} → ${next} ditolak`);
  job.state = next;
  job.history.push({ state: next, at: new Date().toISOString() });
}
function exact(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).some((k) => !keys.includes(k)))
    throw new GisInputError('Parameter komputasi tidak diizinkan');
}
export function computePoint(v: unknown): [number, number] {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !finite(v[0], -180, 180) ||
    !finite(v[1], -90, 90)
  )
    throw new GisInputError('Koordinat harus [longitude, latitude] EPSG:4326');
  return [v[0], v[1]];
}
export function parseComputeTool(v: unknown): ComputeToolRequest {
  if (!record(v)) throw new GisInputError('Operasi tidak valid');
  if (v.tool === 'runConfiguredAnalysis' || v.tool === 'calculateArea') {
    const key =
      v.tool === 'runConfiguredAnalysis' ? 'configurationId' : 'aoiId';
    exact(v, ['tool', key]);
    if (!text(v[key], 100))
      throw new GisInputError('Identitas operasi diperlukan');
    return structuredClone(v) as unknown as ComputeToolRequest;
  }
  if (v.tool === 'calculateDistance') {
    exact(v, ['tool', 'points']);
    if (!Array.isArray(v.points) || v.points.length !== 2)
      throw new GisInputError('Dua titik diperlukan');
    return {
      tool: v.tool,
      points: [computePoint(v.points[0]), computePoint(v.points[1])],
    };
  }
  if (v.tool === 'spatialSelection') {
    exact(v, ['tool', 'point']);
    return { tool: v.tool, point: computePoint(v.point) };
  }
  throw new GisInputError('Operasi komputasi belum didukung');
}
export function parseAnalysisMapResults(v: unknown): AnalysisMapResult[] {
  if (!Array.isArray(v) || v.length > 8)
    throw new GisInputError('Hasil peta terlalu besar');
  return v.map((a) => {
    if (
      !record(a) ||
      !text(a.jobId, 100) ||
      !text(a.title, 200) ||
      !text(a.summary, 2000) ||
      !text(a.provenance, 2000) ||
      !text(a.createdAt, 40) ||
      !Number.isFinite(Date.parse(a.createdAt)) ||
      a.experimental !== true ||
      typeof a.demo !== 'boolean' ||
      !(
        a.configurationVersion === null ||
        (Number.isInteger(a.configurationVersion) &&
          finite(a.configurationVersion, 1, 1e6))
      ) ||
      !Array.isArray(a.datasetIds) ||
      a.datasetIds.length > 8 ||
      !a.datasetIds.every((id) => text(id, 100)) ||
      !Array.isArray(a.points) ||
      a.points.length > 2
    )
      throw new GisInputError('Hasil analisis peta tidak valid');
    exact(a, [
      'jobId',
      'title',
      'summary',
      'datasetIds',
      'configurationVersion',
      'experimental',
      'demo',
      'provenance',
      'createdAt',
      'points',
    ]);
    a.points = a.points.map(computePoint);
    return structuredClone(a) as unknown as AnalysisMapResult;
  });
}
export function parseComputeJob(v: unknown): ComputeJob {
  if (
    !record(v) ||
    JSON.stringify(v).length > 50000 ||
    !text(v.id, 100) ||
    !text(v.requestHash, 64) ||
    !/^[a-f0-9]{64}$/.test(v.requestHash) ||
    !Object.hasOwn(COMPUTE_TRANSITIONS, String(v.state)) ||
    !finite(v.attempt, 1, COMPUTE_LIMITS.attempts) ||
    !record(v.request) ||
    !record(v.estimate) ||
    !Array.isArray(v.history) ||
    v.history.length > 24 ||
    !Array.isArray(v.usage) ||
    v.usage.length > 3
  )
    throw new GisInputError('Job tidak valid');
  exact(v, [
    'id',
    'request',
    'requestHash',
    'state',
    'history',
    'estimate',
    'attempt',
    'result',
    'usage',
    'error',
  ]);
  exact(v.request, [
    'schemaVersion',
    'operation',
    'configuration',
    'projectId',
    'idempotencyKey',
  ]);
  if (
    v.request.schemaVersion !== 1 ||
    !text(v.request.idempotencyKey, 100) ||
    !(v.request.projectId === null || text(v.request.projectId, 100))
  )
    throw new GisInputError('Identitas job tidak valid');
  parseComputeTool(v.request.operation);
  const e = v.estimate;
  exact(e, [
    'costClass',
    'monetaryCost',
    'ceiling',
    'adapterAvailable',
    'reason',
  ]);
  if (
    !['LOW_COST_ANALYSIS', 'APPROVAL_REQUIRED_ANALYSIS'].includes(
      String(e.costClass),
    ) ||
    !['LOCAL_NO_EXTERNAL_CHARGE', 'UNKNOWN'].includes(String(e.monetaryCost)) ||
    typeof e.adapterAvailable !== 'boolean' ||
    !text(e.reason, 2000) ||
    !record(e.ceiling)
  )
    throw new GisInputError('Estimasi tidak valid');
  exact(e.ceiling, ['cells', 'providerCalls', 'durationMs', 'aoiSquareMetres']);
  for (const key of [
    'cells',
    'providerCalls',
    'durationMs',
    'aoiSquareMetres',
  ] as const)
    if (!finite(e.ceiling[key], 0, COMPUTE_LIMITS[key]))
      throw new GisInputError('Batas komputasi tidak valid');
  if (
    e.monetaryCost === 'UNKNOWN' &&
    (e.costClass !== 'APPROVAL_REQUIRED_ANALYSIS' || e.adapterAvailable)
  )
    throw new GisInputError('Biaya tidak diketahui tidak boleh otomatis');
  let previous: ComputeState | undefined;
  for (const h of v.history) {
    if (
      !record(h) ||
      !text(h.at, 40) ||
      !Object.hasOwn(COMPUTE_TRANSITIONS, String(h.state)) ||
      (previous
        ? !COMPUTE_TRANSITIONS[previous].includes(h.state as ComputeState)
        : h.state !== 'DRAFT')
    )
      throw new GisInputError('Riwayat job tidak valid');
    previous = h.state as ComputeState;
  }
  if (previous !== v.state || !(v.error === null || text(v.error, 2000)))
    throw new GisInputError('Status job tidak konsisten');
  for (const u of v.usage)
    if (
      !record(u) ||
      !finite(u.attempt, 1, 3) ||
      !text(u.startedAt, 40) ||
      !finite(u.elapsedMs, 0, 1e7) ||
      !finite(u.adapterCalls, 0, 1) ||
      !record(u.reserved) ||
      !Object.hasOwn(COMPUTE_TRANSITIONS, String(u.outcome))
    )
      throw new GisInputError('Catatan penggunaan tidak valid');
  if (v.result !== null) {
    if (
      v.state !== 'COMPLETED' ||
      !record(v.result) ||
      !record(v.result.values) ||
      Object.keys(v.result.values).length > 16 ||
      !Object.values(v.result.values).every(
        (n) =>
          n === null ||
          (typeof n === 'number' && Number.isFinite(n)) ||
          text(n, 2000),
      ) ||
      !Array.isArray(v.result.limitations) ||
      v.result.limitations.length > 8 ||
      !v.result.limitations.every((l) => text(l, 2000))
    )
      throw new GisInputError('Hasil job tidak valid');
    exact(v.result, ['artifact', 'raster', 'values', 'limitations']);
    const [a] = parseAnalysisMapResults([v.result.artifact]);
    if (a.jobId !== v.id) throw new GisInputError('Hasil bukan milik job');
    if (v.result.raster !== null) parseProcessingResult(v.result.raster);
  } else if (v.state === 'COMPLETED')
    throw new GisInputError('Hasil job hilang');
  return structuredClone(v) as unknown as ComputeJob;
}
export function draftComputeReport(job: ComputeJob): string {
  const j = parseComputeJob(job);
  if (!j.result) throw new GisInputError('Job belum memiliki hasil');
  return [
    '# P4I — Draft laporan analisis',
    '',
    '**EKSPERIMENTAL · ' +
      (j.result.artifact.demo ? 'DEMO' : 'INPUT PENGGUNA') +
      '**',
    '',
    j.result.artifact.title,
    j.result.artifact.summary,
    '',
    `Job: ${j.id}`,
    `Request SHA-256: ${j.requestHash}`,
    `Konfigurasi: ${j.request.configuration?.name ?? 'pengukuran geometri'} · v${j.request.configuration?.version ?? 1}`,
    '',
    '## Hasil',
    '```json',
    JSON.stringify(
      { values: j.result.values, raster: j.result.raster },
      null,
      2,
    ),
    '```',
    '',
    '## Parameter dan sumber',
    '```json',
    JSON.stringify(j.request, null, 2),
    '```',
    '',
    j.result.artifact.provenance,
    '',
    ...j.result.limitations.map((l) => `- ${l}`),
    '',
    'Draft ini tidak menyatakan validasi metodologi atau peringkat ilmiah.',
  ].join('\n');
}
