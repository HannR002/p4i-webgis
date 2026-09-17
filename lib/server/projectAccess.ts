import type {
  DatabaseRepositories,
  ProjectAccessDescriptor,
  ViewerIdentity,
} from './database/contracts';

export function canReadProjectLayers(
  project: ProjectAccessDescriptor,
  viewer: ViewerIdentity | null,
  hasEntitlement: boolean,
): boolean {
  if (project.accessTier === 'public') return true;
  if (!viewer) return false;
  if (viewer.role === 'super_admin' || viewer.role === 'managerial_analyst') return true;
  return viewer.role === 'b2b_client' && hasEntitlement;
}

export type ProjectLayerAccessDecision =
  | { allowed: true; project: ProjectAccessDescriptor }
  | { allowed: false; reason: 'not_found' | 'authentication_required' | 'forbidden' };

export async function resolveProjectLayerAccess(
  repositories: Pick<DatabaseRepositories, 'projects' | 'entitlements'>,
  projectId: string,
  viewer: ViewerIdentity | null,
): Promise<ProjectLayerAccessDecision> {
  const project = await repositories.projects.findAccess(projectId);
  if (!project) return { allowed: false, reason: 'not_found' };
  const entitled = viewer?.role === 'b2b_client'
    ? await repositories.entitlements.has(viewer.id, project.id)
    : false;
  if (canReadProjectLayers(project, viewer, entitled)) return { allowed: true, project };
  return { allowed: false, reason: viewer ? 'forbidden' : 'authentication_required' };
}
