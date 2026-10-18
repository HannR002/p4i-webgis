import type { AppRole } from '../../authRoles';
import type {
  FloodAnalysisResult,
  FloodCriteriaBreakdown,
} from '../../../types/flood';
import type {
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
} from '../../../types/geojson';

export interface ViewerIdentity {
  id: string;
  role: AppRole;
}

export interface ProjectSummary {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  access_tier: 'public' | 'restricted';
  created_at?: string;
}

export interface ProjectAccessDescriptor {
  id: string;
  accessTier: 'public' | 'restricted';
}

export interface NewProject {
  title: string;
  category: string | null;
  description: string | null;
  accessTier: 'public' | 'restricted';
}

export interface NewVectorLayer {
  layerName: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  fileSizeBytes: number;
}

export interface ProjectLayerGeoJson {
  id: string;
  geojson: unknown;
}

export interface UserProfile {
  id: string;
  email: string | null;
  role: AppRole;
  is_disabled: boolean;
  has_completed_onboarding?: boolean;
}

export interface UserProfileUpdate {
  role?: AppRole;
  is_disabled?: boolean;
}

export interface DownloadRecord {
  id: string;
  project_id: string;
  file_type: 'pdf_report' | 'geojson_export' | 'image_export';
  downloaded_at: string;
  spatial_projects: { title: string } | null;
}

export interface AuditLogRecord {
  id: string;
  action_type: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  created_at: string;
  ip_address: string | null;
  user_profiles: { email?: string | null; role?: string | null } | null;
}

export interface DashboardMetrics {
  activeClients: number;
  projects: { public: number; restricted: number; total: number };
  storageBytes: number;
}

export interface BoundaryViewport {
  west: number;
  south: number;
  east: number;
  north: number;
  level: 'provinsi' | 'kota' | 'kecamatan';
  tolerance: number;
}

export interface BoundaryViewportRow {
  id: string;
  kode_wilayah: string;
  level: 'provinsi' | 'kota' | 'kecamatan';
  parent_id: string | null;
  nama: string;
  source: string;
  source_version: string;
  geojson: unknown;
}

export interface AnalysisBoundary {
  id: string;
  nama: string;
  level: string;
  source: string;
  source_version: string;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon | string;
}

export interface CachedFloodResult {
  criteria_breakdown: FloodCriteriaBreakdown;
  score: number | string;
  classification: FloodAnalysisResult['classification'];
  computed_at: string;
  expires_at: string;
}

export interface FloodResultWrite {
  cacheKey: string;
  kecamatanId: string;
  modelVersion: string;
  datasetVersion: string;
  periodStart: string;
  periodEnd: string;
  criteriaWeights: Record<string, number>;
  criteriaBreakdown: FloodCriteriaBreakdown;
  score: number;
  classification: FloodAnalysisResult['classification'];
  computedBy: string;
  computedAt: string;
  expiresAt: string;
}

export interface ProjectRepository {
  createWithLayers(
    project: NewProject,
    layers: NewVectorLayer[],
  ): Promise<string>;
  deleteById(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  findAccess(id: string): Promise<ProjectAccessDescriptor | null>;
  listForViewer(viewer: ViewerIdentity | null): Promise<ProjectSummary[]>;
  listLayerGeoJson(projectId: string): Promise<ProjectLayerGeoJson[]>;
}

export interface UserRepository {
  findAuthProfile(
    id: string,
  ): Promise<Pick<UserProfile, 'role' | 'is_disabled'> | null>;
  list(): Promise<UserProfile[]>;
  existsB2bClient(id: string): Promise<boolean>;
  update(id: string, updates: UserProfileUpdate): Promise<boolean>;
  getOnboardingStatus(id: string): Promise<boolean>;
  completeOnboarding(id: string): Promise<void>;
}

export interface EntitlementRepository {
  has(userId: string, projectId: string): Promise<boolean>;
  grant(userId: string, projectId: string, grantedBy: string): Promise<void>;
  revoke(userId: string, projectId: string): Promise<boolean>;
}

export interface DownloadRepository {
  listForUser(userId: string): Promise<DownloadRecord[]>;
  record(
    userId: string,
    projectId: string,
    fileType: DownloadRecord['file_type'],
  ): Promise<void>;
}

export interface LeadRepository {
  create(input: {
    name: string;
    institution: string;
    email: string;
    whatsapp: string | null;
    requestedProjectId: string | null;
  }): Promise<void>;
}

export interface AuditRepository {
  latest(limit: number): Promise<AuditLogRecord[]>;
}

export interface DashboardRepository {
  metrics(): Promise<DashboardMetrics>;
}

export interface BoundaryRepository {
  findAnalysisBoundary(id: string): Promise<AnalysisBoundary | null>;
  listInViewport(viewport: BoundaryViewport): Promise<BoundaryViewportRow[]>;
}

export interface FloodRepository {
  findValidCached(
    cacheKey: string,
    nowIso: string,
  ): Promise<CachedFloodResult | null>;
  upsert(result: FloodResultWrite): Promise<void>;
}

export interface DatabaseRepositories {
  projects: ProjectRepository;
  users: UserRepository;
  entitlements: EntitlementRepository;
  downloads: DownloadRepository;
  leads: LeadRepository;
  audits: AuditRepository;
  dashboard: DashboardRepository;
  boundaries: BoundaryRepository;
  flood: FloodRepository;
}

/** Editable vector documents share existing spatial_projects IDs; independent of vendor SDKs. */
export interface VectorRepository {
  listProjects(): Promise<
    import('../../gis/vectorPersistence').VectorProject[]
  >;
  listLayers(
    projectId: string,
  ): Promise<import('../../gis/vectorPersistence').VectorLayerSummary[]>;
  readLayer(
    projectId: string,
    layerId: string,
  ): Promise<import('../../gis/vectorPersistence').VectorLayerDocument>;
  saveLayer(
    input: import('../../gis/vectorPersistence').SaveVectorLayer,
  ): Promise<import('../../gis/vectorPersistence').VectorLayerDocument>;
  revisions(
    projectId: string,
    layerId: string,
  ): Promise<{ revision: number; actorId: string; createdAt: string }[]>;
}
