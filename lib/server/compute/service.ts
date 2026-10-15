import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { MapRecipe } from '../../gis/contracts';
import type {
  ComputeApproval,
  ComputeCeiling,
  ComputeJob,
  ComputeRequest,
  ComputeResult,
} from '../../gis/computeContracts';
import { COMPUTE_LIMITS } from '../../gis/computeContracts';
import { transition, parseComputeJob } from '../../gis/computeValidation';
import { GisInputError } from '../../gis/validation';
import { GisPermissionError } from '../../gis/recipe';
import { validateComputeRequest, type ComputeAccess } from './policy';
interface StoredJob {
  job: ComputeJob;
  owner: string;
  recipe: MapRecipe;
  expiresAt: number;
  approval: ComputeApproval | null;
  controller?: AbortController;
}
export interface ComputeEnvironment extends ComputeAccess {
  execute(
    request: ComputeRequest,
    recipe: MapRecipe,
    signal: AbortSignal,
  ): Promise<ComputeResult>;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function digest(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
/** Process-local, bounded, expiring development repository. NOT a durable queue. */
export class DevelopmentComputeService {
  private jobs = new Map<string, StoredJob>();
  constructor(private clock = () => Date.now()) {}
  private purge() {
    for (const [id, s] of this.jobs)
      if (s.expiresAt <= this.clock()) {
        s.controller?.abort();
        this.jobs.delete(id);
      }
  }
  private owned(id: string, env: ComputeAccess) {
    this.purge();
    const s = this.jobs.get(id);
    if (!s || s.owner !== env.requesterId)
      throw new GisPermissionError('Job tidak tersedia untuk pengguna ini');
    // Every read and mutation revalidates current entitlement, metadata and provider availability.
    const checked = validateComputeRequest(s.job.request, env, s.recipe);
    if (
      this.hash(checked.request, checked.estimate, s.recipe, env) !==
      s.job.requestHash
    )
      throw new GisPermissionError(
        'Izin, sumber atau estimasi berubah; buat job baru',
      );
    return s;
  }
  private hash(
    request: ComputeRequest,
    estimate: ComputeJob['estimate'],
    recipe: MapRecipe,
    env: ComputeAccess,
  ) {
    return digest({ request, estimate, recipe, requesterId: env.requesterId });
  }
  get(id: string, env: ComputeAccess): ComputeJob {
    return parseComputeJob(this.owned(id, env).job);
  }
  submit(
    raw: ComputeRequest,
    recipe: MapRecipe,
    env: ComputeAccess,
  ): ComputeJob {
    this.purge();
    const { request, estimate } = validateComputeRequest(raw, env, recipe);
    const hash = this.hash(request, estimate, recipe, env);
    const duplicate = [...this.jobs.values()].find(
      (s) =>
        s.owner === env.requesterId &&
        s.job.request.idempotencyKey === request.idempotencyKey,
    );
    if (duplicate) {
      if (duplicate.job.requestHash !== hash)
        throw new GisInputError(
          'Idempotency key sudah dipakai untuk argumen/proyek lain',
        );
      return this.get(duplicate.job.id, env);
    }
    if (
      this.jobs.size >= COMPUTE_LIMITS.jobs ||
      [...this.jobs.values()].filter((s) => s.owner === env.requesterId)
        .length >= COMPUTE_LIMITS.jobsPerUser
    )
      throw new GisInputError(
        'Batas job development tercapai; tunggu kedaluwarsa',
      );
    const job: ComputeJob = {
      id: `compute-${randomUUID()}`,
      request,
      requestHash: hash,
      state: 'DRAFT',
      history: [{ state: 'DRAFT', at: new Date().toISOString() }],
      estimate,
      attempt: 1,
      result: null,
      usage: [],
      error: null,
    };
    transition(job, 'ESTIMATING');
    transition(
      job,
      estimate.costClass === 'APPROVAL_REQUIRED_ANALYSIS'
        ? 'AWAITING_APPROVAL'
        : 'QUEUED',
    );
    this.jobs.set(job.id, {
      job,
      owner: env.requesterId,
      recipe: structuredClone(recipe),
      expiresAt: this.clock() + COMPUTE_LIMITS.ttlMs,
      approval: null,
    });
    return parseComputeJob(job);
  }
  /** Called only by the same-origin HUMAN endpoint; deliberately absent from AI tool registry. */
  approve(
    id: string,
    requestHash: string,
    ceiling: ComputeCeiling,
    env: ComputeAccess,
  ): ComputeJob {
    const s = this.owned(id, env),
      j = s.job;
    if (
      j.state !== 'AWAITING_APPROVAL' ||
      requestHash !== j.requestHash ||
      canonical(ceiling) !== canonical(j.estimate.ceiling)
    )
      throw new GisPermissionError(
        'Persetujuan tidak sesuai snapshot/batas atau sudah digunakan',
      );
    if (!j.estimate.adapterAvailable || j.estimate.monetaryCost === 'UNKNOWN')
      throw new GisInputError(
        'Adapter/harga eksternal belum tersedia; persetujuan tidak dapat mengaktifkannya',
      );
    s.approval = {
      requestHash,
      requesterId: env.requesterId,
      projectId: j.request.projectId,
      ceiling: structuredClone(ceiling),
      expiresAt: this.clock() + COMPUTE_LIMITS.approvalMs,
      consumed: false,
    };
    transition(j, 'QUEUED');
    return parseComputeJob(j);
  }
  cancel(id: string, env: ComputeAccess): ComputeJob {
    const s = this.owned(id, env);
    if (['AWAITING_APPROVAL', 'QUEUED', 'RUNNING'].includes(s.job.state)) {
      s.controller?.abort();
      s.approval = null;
      transition(s.job, 'CANCELLED');
    }
    return parseComputeJob(s.job);
  }
  reject(id: string, env: ComputeAccess): ComputeJob {
    const s = this.owned(id, env);
    transition(s.job, 'REJECTED');
    s.approval = null;
    return parseComputeJob(s.job);
  }
  retry(id: string, env: ComputeAccess): ComputeJob {
    const s = this.owned(id, env),
      j = s.job;
    if (
      s.controller ||
      !['FAILED', 'CANCELLED'].includes(j.state) ||
      j.attempt >= COMPUTE_LIMITS.attempts
    )
      throw new GisInputError(
        'Retry tidak tersedia; tunggu eksekusi sebelumnya selesai atau buat permintaan baru',
      );
    j.attempt++;
    j.error = null;
    j.result = null;
    s.approval = null;
    transition(j, 'ESTIMATING');
    transition(
      j,
      j.estimate.costClass === 'APPROVAL_REQUIRED_ANALYSIS'
        ? 'AWAITING_APPROVAL'
        : 'QUEUED',
    );
    return parseComputeJob(j);
  }
  async run(
    id: string,
    env: ComputeEnvironment,
    signal?: AbortSignal,
  ): Promise<ComputeJob> {
    const s = this.owned(id, env),
      j = s.job;
    if (['RUNNING', 'COMPLETED'].includes(j.state)) return parseComputeJob(j); // concurrent/replayed execute never invokes adapter twice
    if (j.state !== 'QUEUED' || !j.estimate.adapterAvailable)
      throw new GisPermissionError(
        'Job belum diizinkan/didukung untuk eksekusi',
      );
    if (
      [...this.jobs.values()].some(
        (other) =>
          other !== s &&
          other.owner === s.owner &&
          other.job.state === 'RUNNING',
      )
    )
      throw new GisInputError('Satu komputasi aktif per pengguna');
    if (j.estimate.costClass === 'APPROVAL_REQUIRED_ANALYSIS') {
      const a = s.approval;
      if (
        !a ||
        a.consumed ||
        a.expiresAt <= this.clock() ||
        a.requesterId !== env.requesterId ||
        a.requestHash !== j.requestHash ||
        a.projectId !== j.request.projectId ||
        canonical(a.ceiling) !== canonical(j.estimate.ceiling)
      )
        throw new GisPermissionError(
          'Persetujuan kedaluwarsa/tidak sesuai; batalkan dan retry',
        );
      a.consumed = true;
    }
    const controller = new AbortController();
    s.controller = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    transition(j, 'RUNNING');
    const started = this.clock(),
      startedAt = new Date().toISOString();
    let calls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        abortListener = () => reject(new Error('cancelled'));
        controller.signal.addEventListener('abort', abortListener, {
          once: true,
        });
        timer = setTimeout(() => {
          reject(new Error('deadline'));
          controller.abort();
        }, j.estimate.ceiling.durationMs);
      });
      controller.signal.throwIfAborted();
      calls = 1;
      const result = await Promise.race([
        env.execute(
          structuredClone(j.request),
          structuredClone(s.recipe),
          controller.signal,
        ),
        deadline,
      ]);
      controller.signal.throwIfAborted();
      if (this.clock() - started > j.estimate.ceiling.durationMs)
        throw new Error('deadline');
      // Validate before commit, and never accept provider-generated job identities.
      result.artifact.jobId = j.id;
      const completed = structuredClone(j);
      completed.result = result;
      transition(completed, 'COMPLETED');
      parseComputeJob(completed);
      j.result = structuredClone(result);
      transition(j, 'COMPLETED');
    } catch {
      if (String(j.state) === 'RUNNING')
        transition(
          j,
          controller.signal.aborted && signal?.aborted ? 'CANCELLED' : 'FAILED',
        );
      j.result = null;
      j.error =
        String(j.state) === 'CANCELLED'
          ? 'Komputasi dibatalkan; hasil terlambat dibuang.'
          : 'Komputasi/provider gagal atau batas waktu/output terlampaui. Tidak ada hasil diterapkan.';
    } finally {
      if (timer) clearTimeout(timer);
      if (abortListener)
        controller.signal.removeEventListener('abort', abortListener);
      signal?.removeEventListener('abort', cancel);
      delete s.controller;
      j.usage.push({
        attempt: j.attempt,
        startedAt,
        elapsedMs: Math.max(0, this.clock() - started),
        reserved: structuredClone(j.estimate.ceiling),
        adapterCalls: calls,
        outcome: j.state,
      });
    }
    return parseComputeJob(j);
  }
}
const key = Symbol.for('p4i.compute.development.v1');
const globalStore = globalThis as typeof globalThis & {
  [key]?: DevelopmentComputeService;
};
export const developmentCompute = (globalStore[key] ??=
  new DevelopmentComputeService());
