import 'server-only';

import { isAppRole } from '../../../../authRoles';
import type {
  AnalysisBoundary,
  AuditLogRecord,
  BoundaryViewport,
  BoundaryViewportRow,
  CachedFloodResult,
  DatabaseRepositories,
  DownloadRecord,
  FloodResultWrite,
  NewProject,
  NewVectorLayer,
  ProjectLayerGeoJson,
  ProjectSummary,
  UserProfile,
  UserProfileUpdate,
  ViewerIdentity,
} from '../../contracts';
import { createSupabaseServiceClient } from './client';

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

function throwIfError(error: unknown): void {
  if (error) throw error;
}

export function createSupabaseRepositories(
  client: ServiceClient = createSupabaseServiceClient(),
): DatabaseRepositories {
  return {
    projects: {
      async createWithLayers(project: NewProject, layers: NewVectorLayer[]) {
        const { data, error } = await client
          .from('spatial_projects')
          .insert({
            title: project.title,
            category: project.category,
            description: project.description,
            access_tier: project.accessTier,
          })
          .select('id')
          .single();
        throwIfError(error);
        if (!data?.id) throw new Error('Database did not return the created project ID');

        const rows = layers.map((layer) => ({
          project_id: data.id,
          layer_name: layer.layerName,
          geom: layer.geometry,
          properties: layer.properties,
          file_size_bytes: layer.fileSizeBytes,
        }));
        const { error: layerError } = await client.from('vector_layers').insert(rows);
        if (layerError) {
          await client.from('spatial_projects').delete().eq('id', data.id);
          throw layerError;
        }
        return String(data.id);
      },

      async deleteById(id: string) {
        const { data, error } = await client
          .from('spatial_projects')
          .delete()
          .eq('id', id)
          .select('id');
        throwIfError(error);
        return Boolean(data?.length);
      },

      async exists(id: string) {
        const { data, error } = await client
          .from('spatial_projects')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        throwIfError(error);
        return Boolean(data);
      },

      async findAccess(id: string) {
        const { data, error } = await client
          .from('spatial_projects')
          .select('id,access_tier')
          .eq('id', id)
          .maybeSingle();
        throwIfError(error);
        if (!data || (data.access_tier !== 'public' && data.access_tier !== 'restricted')) return null;
        return { id: String(data.id), accessTier: data.access_tier };
      },

      async listForViewer(viewer: ViewerIdentity | null) {
        let query = client.from('spatial_projects').select(
          'id,title,category,description,access_tier,created_at',
        );
        if (!viewer) {
          query = query.eq('access_tier', 'public');
        } else if (viewer.role === 'b2b_client') {
          const { data: grants, error: grantError } = await client
            .from('b2b_entitlements')
            .select('project_id')
            .eq('client_user_id', viewer.id);
          throwIfError(grantError);
          const ids = (grants ?? []).flatMap((row: { project_id?: unknown }) =>
            typeof row.project_id === 'string' ? [row.project_id] : [],
          );
          query = ids.length
            ? query.or(`access_tier.eq.public,id.in.(${ids.join(',')})`)
            : query.eq('access_tier', 'public');
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        throwIfError(error);
        return (data ?? []) as ProjectSummary[];
      },

      async listLayerGeoJson(projectId: string) {
        const { data, error } = await client.rpc('get_project_vector_layers_geojson', {
          p_project_id: projectId,
        });
        throwIfError(error);
        return (data ?? []) as ProjectLayerGeoJson[];
      },
    },

    users: {
      async findAuthProfile(id: string) {
        const { data, error } = await client
          .from('user_profiles')
          .select('role,is_disabled')
          .eq('id', id)
          .maybeSingle();
        throwIfError(error);
        if (!data || !isAppRole(data.role)) return null;
        return { role: data.role, is_disabled: data.is_disabled === true };
      },

      async list() {
        const { data, error } = await client.from('user_profiles').select('*').order('email');
        throwIfError(error);
        return (data ?? []) as UserProfile[];
      },

      async existsB2bClient(id: string) {
        const { data, error } = await client
          .from('user_profiles')
          .select('id')
          .eq('id', id)
          .eq('role', 'b2b_client')
          .maybeSingle();
        throwIfError(error);
        return Boolean(data);
      },

      async update(id: string, updates: UserProfileUpdate) {
        const { data, error } = await client
          .from('user_profiles')
          .update(updates)
          .eq('id', id)
          .select('id');
        throwIfError(error);
        return Boolean(data?.length);
      },

      async getOnboardingStatus(id: string) {
        const { data, error } = await client
          .from('user_profiles')
          .select('has_completed_onboarding')
          .eq('id', id)
          .single();
        throwIfError(error);
        return data?.has_completed_onboarding === true;
      },

      async completeOnboarding(id: string) {
        const { error } = await client
          .from('user_profiles')
          .update({ has_completed_onboarding: true })
          .eq('id', id);
        throwIfError(error);
      },
    },

    entitlements: {
      async has(userId: string, projectId: string) {
        const { data, error } = await client
          .from('b2b_entitlements')
          .select('id')
          .eq('client_user_id', userId)
          .eq('project_id', projectId)
          .maybeSingle();
        throwIfError(error);
        return Boolean(data);
      },

      async grant(userId: string, projectId: string, grantedBy: string) {
        const { error } = await client.from('b2b_entitlements').insert({
          client_user_id: userId,
          project_id: projectId,
          granted_by: grantedBy,
        });
        throwIfError(error);
      },

      async revoke(userId: string, projectId: string) {
        const { data, error } = await client
          .from('b2b_entitlements')
          .delete()
          .match({ client_user_id: userId, project_id: projectId })
          .select('id');
        throwIfError(error);
        return Boolean(data?.length);
      },
    },

    downloads: {
      async listForUser(userId: string) {
        const { data, error } = await client
          .from('download_history')
          .select('id,project_id,file_type,downloaded_at,spatial_projects(title)')
          .eq('client_user_id', userId)
          .order('downloaded_at', { ascending: false })
          .limit(20);
        throwIfError(error);
        return (data ?? []) as unknown as DownloadRecord[];
      },

      async record(userId: string, projectId: string, fileType: DownloadRecord['file_type']) {
        const { error } = await client.from('download_history').insert({
          client_user_id: userId,
          project_id: projectId,
          file_type: fileType,
        });
        throwIfError(error);
      },
    },

    leads: {
      async create(input) {
        const { error } = await client.from('sales_leads').insert({
          name: input.name,
          institution: input.institution,
          email: input.email,
          whatsapp: input.whatsapp,
          requested_project_id: input.requestedProjectId,
        });
        throwIfError(error);
      },
    },

    audits: {
      async latest(limit: number) {
        const { data, error } = await client
          .from('audit_logs')
          .select('id,action_type,table_name,created_at,ip_address,user_profiles(email,role)')
          .order('created_at', { ascending: false })
          .limit(limit);
        throwIfError(error);
        return (data ?? []) as unknown as AuditLogRecord[];
      },
    },

    dashboard: {
      async metrics() {
        const [clients, publicProjects, restrictedProjects, storage] = await Promise.all([
          client.from('user_profiles').select('id', { count: 'exact', head: true })
            .eq('role', 'b2b_client').eq('is_disabled', false),
          client.from('spatial_projects').select('id', { count: 'exact', head: true })
            .eq('access_tier', 'public'),
          client.from('spatial_projects').select('id', { count: 'exact', head: true })
            .eq('access_tier', 'restricted'),
          client.from('vector_layers').select('file_size_bytes'),
        ]);
        throwIfError(clients.error || publicProjects.error || restrictedProjects.error || storage.error);
        const storageBytes = (storage.data ?? []).reduce(
          (sum: number, row: { file_size_bytes?: unknown }) => sum + (Number(row.file_size_bytes) || 0),
          0,
        );
        const publicCount = publicProjects.count ?? 0;
        const restrictedCount = restrictedProjects.count ?? 0;
        return {
          activeClients: clients.count ?? 0,
          projects: { public: publicCount, restricted: restrictedCount, total: publicCount + restrictedCount },
          storageBytes,
        };
      },
    },

    boundaries: {
      async findAnalysisBoundary(id: string) {
        const { data, error } = await client
          .from('administrative_boundaries')
          .select('id,nama,level,source,source_version,geometry')
          .eq('id', id)
          .maybeSingle();
        throwIfError(error);
        return data ? data as AnalysisBoundary : null;
      },

      async listInViewport(viewport: BoundaryViewport) {
        const { data, error } = await client.rpc('get_boundaries_in_view', {
          p_west: viewport.west,
          p_south: viewport.south,
          p_east: viewport.east,
          p_north: viewport.north,
          p_level: viewport.level,
          p_tolerance: viewport.tolerance,
        });
        throwIfError(error);
        return (data ?? []) as BoundaryViewportRow[];
      },
    },

    flood: {
      async findValidCached(cacheKey: string, nowIso: string) {
        const { data, error } = await client
          .from('flood_analysis_results')
          .select('criteria_breakdown,score,classification,computed_at,expires_at')
          .eq('cache_key', cacheKey)
          .gt('expires_at', nowIso)
          .maybeSingle();
        throwIfError(error);
        return data ? data as CachedFloodResult : null;
      },

      async upsert(result: FloodResultWrite) {
        const { error } = await client.from('flood_analysis_results').upsert({
          cache_key: result.cacheKey,
          kecamatan_id: result.kecamatanId,
          model_version: result.modelVersion,
          dataset_version: result.datasetVersion,
          period_start: result.periodStart,
          period_end: result.periodEnd,
          criteria_weights: result.criteriaWeights,
          criteria_breakdown: result.criteriaBreakdown,
          score: result.score,
          classification: result.classification,
          computed_by: result.computedBy,
          computed_at: result.computedAt,
          expires_at: result.expiresAt,
        }, { onConflict: 'cache_key' });
        throwIfError(error);
      },
    },
  };
}
