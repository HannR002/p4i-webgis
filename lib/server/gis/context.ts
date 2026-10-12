import 'server-only';
import type { Dataset, GisContext } from '../../gis/contracts';
import { getRequestIdentity } from '../auth';
import { getDatabaseRepositories } from '../database';
import { resolveProjectLayerAccess } from '../projectAccess';
export async function getGisContext(
  request: Request,
  catalog: readonly Dataset[],
): Promise<GisContext> {
  const identity = await getRequestIdentity(request);
  if (!identity) return { role: 'guest', entitledProjectIds: [] };
  const ids: string[] = [];
  for (const id of new Set(
    catalog.filter((d) => d.accessTier === 'restricted' && d.projectId).map((d) => d.projectId!),
  )) {
    const access = await resolveProjectLayerAccess(getDatabaseRepositories(), id, {
      id: identity.user.id,
      role: identity.role,
    });
    if (access.allowed) ids.push(id);
  }
  return { role: identity.role, entitledProjectIds: ids };
}
