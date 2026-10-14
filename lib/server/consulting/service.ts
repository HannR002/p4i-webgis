import { parseReviewChecklist } from '../../consulting/validation';
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type {
  ConsultingRepository,
  WorkflowActor,
  ConsultingCapability,
  ClientDeliverable,
  DeliverableContent,
  DeliverableRevision,
  DeliverableStatus,
  DeliverableReview,
  ReviewChecklist,
  ReviewerDecision,
  AnalysisRun,
  AnalysisResult,
  PublishedClientDeliverable,
} from '../../consulting/contracts';
import { GisInputError, text } from '../../gis/validation';
import { GisPermissionError } from '../../gis/recipe';
const now = () => new Date().toISOString();
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
export function revisionHash(
  revision: Omit<DeliverableRevision, 'contentHash'>,
): string {
  return createHash('sha256').update(stable(revision)).digest('hex');
}
export function verifyRevision(r: DeliverableRevision) {
  const { contentHash, ...value } = r;
  if (revisionHash(value) !== contentHash)
    throw new GisInputError('Bukti revisi tidak cocok');
}
export function requireCapability(
  actor: WorkflowActor,
  projectId: string,
  capability: ConsultingCapability,
) {
  if (!actor.grants[projectId]?.includes(capability))
    throw new GisPermissionError('Kapabilitas proyek tidak diberikan');
  if (actor.kind === 'ai' && capability !== 'author')
    throw new GisPermissionError(
      'AI hanya dapat menyiapkan draft; review/rilis memerlukan manusia berwenang',
    );
}
export const DELIVERABLE_TRANSITIONS: Record<
  DeliverableStatus,
  readonly DeliverableStatus[]
> = {
  DRAFT: ['DRAFT', 'ANALYSIS_RUNNING', 'READY_FOR_REVIEW'],
  ANALYSIS_RUNNING: ['DRAFT', 'ANALYSIS_RUNNING'],
  READY_FOR_REVIEW: ['APPROVED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['DRAFT'],
  APPROVED: ['DRAFT', 'PUBLISHED'],
  PUBLISHED: ['DRAFT'],
};
function move(d: ClientDeliverable, next: DeliverableStatus) {
  if (!DELIVERABLE_TRANSITIONS[d.status].includes(next))
    throw new GisInputError(`Transisi ${d.status} → ${next} ditolak`);
  d.status = next;
}
function revision(
  content: DeliverableContent,
  actor: WorkflowActor,
  number: number,
  origin: 'human' | 'ai',
  run: AnalysisRun | null,
  result: AnalysisResult | null,
): DeliverableRevision {
  const r = {
    number,
    content: structuredClone(content),
    createdAt: now(),
    createdBy: actor.id,
    origin,
    analysisRun: structuredClone(run),
    analysisResult: structuredClone(result),
  };
  return { ...r, contentHash: revisionHash(r) };
}
/** Service owns workflow decisions; adapters own transactional compare-and-swap. */
export class ConsultingWorkflow {
  constructor(private repo: ConsultingRepository) {}
  private async load(id: string, actor: WorkflowActor) {
    const d = await this.repo.get(id);
    if (!d || !actor.grants[d.projectId]?.length)
      throw new GisPermissionError('Deliverable tidak tersedia');
    return d;
  }
  private async commit(
    d: ClientDeliverable,
    expected: number | null,
    actor: WorkflowActor,
    action: string,
  ) {
    d.version = (expected ?? 0) + 1;
    await this.repo.commit(d, expected, {
      id: randomUUID(),
      deliverableId: d.id,
      projectId: d.projectId,
      actorId: actor.id,
      action,
      revision: d.currentRevision,
      at: now(),
    });
    return structuredClone(d);
  }
  async create(
    projectId: string,
    content: DeliverableContent,
    actor: WorkflowActor,
    origin: 'human' | 'ai' = 'human',
  ) {
    requireCapability(actor, projectId, 'author');
    if (!(await this.repo.listProjects()).some((p) => p.id === projectId))
      throw new GisInputError('Proyek tidak ditemukan');
    const r = revision(
      content,
      actor,
      1,
      actor.kind === 'ai' ? 'ai' : origin,
      null,
      null,
    );
    const d: ClientDeliverable = {
      id: randomUUID(),
      projectId,
      status: 'DRAFT',
      currentRevision: 1,
      revisions: [r],
      reviews: [],
      publications: [],
      createdBy: actor.id,
      createdAt: now(),
      version: 1,
    };
    return this.commit(d, null, actor, 'CREATE_DRAFT');
  }
  async revise(
    id: string,
    expected: number,
    content: DeliverableContent,
    actor: WorkflowActor,
    origin: 'human' | 'ai' = 'human',
  ) {
    const d = await this.load(id, actor);
    requireCapability(actor, d.projectId, 'author');
    if (
      !['DRAFT', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED'].includes(
        d.status,
      )
    )
      throw new GisInputError(
        'Revisi hanya dapat dibuat setelah review selesai atau pada draft',
      );
    if (d.revisions.length >= 20)
      throw new GisInputError('Batas 20 revisi development tercapai');
    const prior = d.revisions.at(-1)!;
    const sameAnalysis =
      stable({ recipe: content.recipe, sources: content.datasetSources }) ===
      stable({
        recipe: prior.content.recipe,
        sources: prior.content.datasetSources,
      });
    move(d, 'DRAFT');
    d.currentRevision++;
    d.revisions.push(
      revision(
        content,
        actor,
        d.currentRevision,
        actor.kind === 'ai' ? 'ai' : origin,
        sameAnalysis ? prior.analysisRun : null,
        sameAnalysis ? prior.analysisResult : null,
      ),
    );
    return this.commit(d, expected, actor, 'NEW_REVISION');
  }
  async attachAnalysis(
    id: string,
    expected: number,
    run: AnalysisRun,
    result: AnalysisResult | null,
    actor: WorkflowActor,
    analysisSnapshot?: Pick<
      DeliverableContent,
      'recipe' | 'datasetSources' | 'mapOutline'
    >,
  ) {
    const d = await this.load(id, actor);
    requireCapability(actor, d.projectId, 'author');
    if (
      !['DRAFT', 'ANALYSIS_RUNNING'].includes(d.status) ||
      (run.projectId && run.projectId !== d.projectId)
    )
      throw new GisInputError('Job/proyek atau status tidak sesuai');
    if (
      !['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(
        run.state,
      )
    )
      throw new GisInputError('Job belum diizinkan');
    if (
      (run.state === 'COMPLETED' && (!result || result.jobId !== run.jobId)) ||
      (run.state !== 'COMPLETED' && result)
    )
      throw new GisInputError('Hasil tidak sesuai status job');
    if (d.revisions.length >= 20)
      throw new GisInputError('Batas revisi tercapai');
    const prior = d.revisions.at(-1)!;
    d.currentRevision++;
    const content = structuredClone(prior.content);
    if (analysisSnapshot) {
      content.recipe = structuredClone(analysisSnapshot.recipe);
      content.datasetSources = structuredClone(analysisSnapshot.datasetSources);
      content.mapOutline = structuredClone(analysisSnapshot.mapOutline);
    }
    if (result) {
      content.summary = result.result.artifact.summary;
      content.recipe.analysisResults = [
        ...(content.recipe.analysisResults ?? []).filter(
          (r) => r.jobId !== run.jobId,
        ),
        result.result.artifact,
      ].slice(-8);
    }
    d.revisions.push(
      revision(content, actor, d.currentRevision, prior.origin, run, result),
    );
    move(
      d,
      ['QUEUED', 'RUNNING'].includes(run.state) ? 'ANALYSIS_RUNNING' : 'DRAFT',
    );
    return this.commit(d, expected, actor, 'ATTACH_ANALYSIS');
  }
  async submit(id: string, expected: number, actor: WorkflowActor) {
    const d = await this.load(id, actor);
    requireCapability(actor, d.projectId, 'author');
    if (actor.kind !== 'human')
      throw new GisPermissionError('Manusia harus meninjau dan mengirim draft');
    const r = d.revisions.at(-1)!;
    verifyRevision(r);
    if (
      !r.content.summary.trim() ||
      !r.content.assumptions.trim() ||
      !r.content.limitations.trim()
    )
      throw new GisInputError('Isi draft belum lengkap');
    move(d, 'READY_FOR_REVIEW');
    return this.commit(d, expected, actor, 'SUBMIT_REVIEW');
  }
  async review(
    id: string,
    expected: number,
    hash: string,
    decision: ReviewerDecision,
    comments: string,
    checklist: ReviewChecklist,
    actor: WorkflowActor,
  ) {
    const d = await this.load(id, actor);
    requireCapability(actor, d.projectId, 'review');
    const r = d.revisions.at(-1)!;
    verifyRevision(r);
    if (
      d.status !== 'READY_FOR_REVIEW' ||
      hash !== r.contentHash ||
      r.createdBy === actor.id
    )
      throw new GisPermissionError(
        'Review harus independen dan terikat revisi yang sedang diajukan',
      );
    if (
      !['APPROVE', 'REQUEST_CHANGES', 'REJECT'].includes(decision) ||
      !text(comments, 3000)
    )
      throw new GisInputError('Keputusan/komentar reviewer diperlukan');
    checklist = parseReviewChecklist(checklist);
    if (
      decision === 'APPROVE' &&
      !Object.values(checklist).every((v) => v === true)
    )
      throw new GisInputError(
        'Persetujuan memerlukan empat pemeriksaan profesional',
      );
    const review: DeliverableReview = {
      id: randomUUID(),
      revision: r.number,
      contentHash: r.contentHash,
      decision,
      reviewerId: actor.id,
      comments,
      checklist: structuredClone(checklist),
      createdAt: now(),
    };
    d.reviews.push(review);
    move(d, decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED');
    return this.commit(d, expected, actor, decision);
  }
  async publish(
    id: string,
    expected: number,
    hash: string,
    actor: WorkflowActor,
  ) {
    const d = await this.load(id, actor);
    requireCapability(actor, d.projectId, 'publish');
    const r = d.revisions.at(-1)!;
    verifyRevision(r);
    const review = d.reviews.at(-1);
    if (
      d.status !== 'APPROVED' ||
      hash !== r.contentHash ||
      review?.decision !== 'APPROVE' ||
      review.contentHash !== hash ||
      review.revision !== r.number
    )
      throw new GisPermissionError(
        'Revisi ini belum memiliki persetujuan rilis',
      );
    move(d, 'PUBLISHED');
    d.publications.push({
      id: randomUUID(),
      revision: r.number,
      contentHash: r.contentHash,
      reviewId: review.id,
      publishedBy: actor.id,
      publishedAt: now(),
      mode: 'DEVELOPMENT_SIMULATION',
      official: false,
    });
    return this.commit(d, expected, actor, 'SIMULATED_PUBLICATION');
  }
  async staffView(id: string, actor: WorkflowActor) {
    const d = await this.load(id, actor);
    if (
      !['author', 'review', 'publish'].some((c) =>
        actor.grants[d.projectId]?.includes(c as ConsultingCapability),
      )
    )
      throw new GisPermissionError('Draft tidak tersedia untuk klien');
    return d;
  }
  async clientView(
    id: string,
    actor: WorkflowActor,
  ): Promise<PublishedClientDeliverable> {
    const d = await this.load(id, actor);
    requireCapability(actor, d.projectId, 'client');
    const p = d.publications.at(-1);
    if (!p) throw new GisPermissionError('Deliverable tidak tersedia');
    const r = d.revisions.find((r) => r.number === p.revision)!;
    verifyRevision(r);
    if (p.contentHash !== r.contentHash)
      throw new GisInputError('Bukti publikasi tidak sesuai');
    // Internal analyst notes, revision history and review comments never enter client DTOs.
    const redacted = structuredClone(r);
    redacted.content.analystNotes = '';
    const { contentHash: reviewHash, ...releasedEvidence } = redacted;
    void reviewHash;
    return {
      id: d.id,
      projectId: d.projectId,
      status: 'PUBLISHED',
      releasedContentHash: revisionHash(releasedEvidence),
      publication: structuredClone(p),
      revision: redacted,
    };
  }
}
