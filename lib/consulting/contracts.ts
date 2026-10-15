import type { GISDatasetInfo } from '../gis/copilotContracts';
import type { ProjectSummary } from '../server/database/contracts';
import type { MapRecipe } from '../gis/contracts';
import type { ComputeResult, ComputeState } from '../gis/computeContracts';
export type DeliverableStatus =
  | 'DRAFT'
  | 'ANALYSIS_RUNNING'
  | 'READY_FOR_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED';
export type ConsultingCapability = 'author' | 'review' | 'publish' | 'client';
/** Extension of the existing spatial project identity, never a second production project table. */
export interface ConsultingProject extends ProjectSummary {
  clientLabel: string;
  demo: boolean;
}
export interface WorkflowActor {
  id: string;
  kind: 'human' | 'ai';
  grants: Record<string, ConsultingCapability[]>;
}
export interface AnalysisRun {
  jobId: string;
  projectId: string | null;
  state: ComputeState;
  requestHash: string;
  configurationId: string | null;
  configurationVersion: number | null;
}
export interface AnalysisResult {
  jobId: string;
  result: ComputeResult;
}
export interface DeliverableContent {
  title: string;
  summary: string;
  analystNotes: string;
  assumptions: string;
  limitations: string;
  recipe: MapRecipe;
  datasetSources?: GISDatasetInfo[];
  mapOutline?: {
    datasetId: string;
    version: string;
    provenance: string;
    rings: [number, number][][];
  };
}
export interface DeliverableRevision {
  number: number;
  content: DeliverableContent;
  contentHash: string;
  createdAt: string;
  createdBy: string;
  origin: 'human' | 'ai';
  analysisRun: AnalysisRun | null;
  analysisResult: AnalysisResult | null;
}
export type ReviewerDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
export interface ReviewChecklist {
  completeness: boolean;
  interpretation: boolean;
  authorizedRelease: boolean;
  professionalQuality: boolean;
}
export interface DeliverableReview {
  id: string;
  revision: number;
  contentHash: string;
  decision: ReviewerDecision;
  reviewerId: string;
  comments: string;
  checklist: ReviewChecklist;
  createdAt: string;
}
export interface DeliverablePublication {
  id: string;
  revision: number;
  contentHash: string;
  reviewId: string;
  publishedBy: string;
  publishedAt: string;
  mode: 'DEVELOPMENT_SIMULATION';
  official: false;
}
export interface ClientDeliverable {
  id: string;
  projectId: string;
  status: DeliverableStatus;
  currentRevision: number;
  revisions: DeliverableRevision[];
  reviews: DeliverableReview[];
  publications: DeliverablePublication[];
  createdBy: string;
  createdAt: string;
  version: number;
}
export interface WorkflowAuditEvent {
  id: string;
  deliverableId: string;
  projectId: string;
  actorId: string;
  action: string;
  revision: number;
  at: string;
}
export interface ConsultingRepository {
  listProjects(): Promise<ConsultingProject[]>;
  listDeliverables(projectId: string): Promise<ClientDeliverable[]>;
  get(id: string): Promise<ClientDeliverable | null>;
  /** Compare-and-swap, including audit evidence, must be atomic in a future durable adapter. */
  commit(
    deliverable: ClientDeliverable,
    expectedVersion: number | null,
    audit: WorkflowAuditEvent,
  ): Promise<void>;
  audit(projectId: string): Promise<WorkflowAuditEvent[]>;
}
export interface PublishedClientDeliverable {
  id: string;
  projectId: string;
  status: 'PUBLISHED';
  releasedContentHash: string;
  publication: DeliverablePublication;
  revision: DeliverableRevision;
}
