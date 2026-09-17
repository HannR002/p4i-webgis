import { describe, expect, it } from 'vitest';
import { canReadProjectLayers, resolveProjectLayerAccess } from '../lib/server/projectAccess';
import type { DatabaseRepositories } from '../lib/server/database/contracts';

const publicProject = { id: 'public-project', accessTier: 'public' as const };
const restrictedProject = { id: 'restricted-project', accessTier: 'restricted' as const };

describe('project layer authorization', () => {
  it('keeps public project layers public', () => {
    expect(canReadProjectLayers(publicProject, null, false)).toBe(true);
  });

  it('requires an entitlement for a B2B client to read restricted layers', () => {
    const client = { id: 'client-1', role: 'b2b_client' as const };
    expect(canReadProjectLayers(restrictedProject, client, false)).toBe(false);
    expect(canReadProjectLayers(restrictedProject, client, true)).toBe(true);
  });

  it('allows admin roles but rejects anonymous restricted access', () => {
    expect(canReadProjectLayers(restrictedProject, null, false)).toBe(false);
    expect(canReadProjectLayers(
      restrictedProject,
      { id: 'admin-1', role: 'super_admin' },
      false,
    )).toBe(true);
    expect(canReadProjectLayers(
      restrictedProject,
      { id: 'analyst-1', role: 'managerial_analyst' },
      false,
    )).toBe(true);
  });

  it('uses repository contracts to resolve the restricted entitlement decision', async () => {
    const entitledProject = { id: 'restricted-project', accessTier: 'restricted' as const };
    const otherProject = { id: 'other-restricted-project', accessTier: 'restricted' as const };
    const projects = {
      findAccess: async (id: string) => id === otherProject.id ? otherProject : entitledProject,
    } as Pick<DatabaseRepositories['projects'], 'findAccess'> as DatabaseRepositories['projects'];
    const entitlements = {
      has: async (userId: string, projectId: string) =>
        userId === 'client-1' && projectId === entitledProject.id,
    } as Pick<DatabaseRepositories['entitlements'], 'has'> as DatabaseRepositories['entitlements'];
    const repositories = { projects, entitlements };

    await expect(resolveProjectLayerAccess(
      repositories,
      entitledProject.id,
      { id: 'client-1', role: 'b2b_client' },
    )).resolves.toEqual({ allowed: true, project: entitledProject });
    await expect(resolveProjectLayerAccess(
      repositories,
      otherProject.id,
      { id: 'client-1', role: 'b2b_client' },
    )).resolves.toEqual({ allowed: false, reason: 'forbidden' });
  });
});
