export const APP_ROLES = ['super_admin', 'managerial_analyst', 'b2b_client'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ADMIN_ROLES: readonly AppRole[] = ['super_admin', 'managerial_analyst'];
export const SUPER_ADMIN_ROLES: readonly AppRole[] = ['super_admin'];
export const PROJECT_CREATE_ROLES: readonly AppRole[] = ['super_admin', 'managerial_analyst'];
export const PROJECT_DELETE_ROLES: readonly AppRole[] = ['super_admin'];
export const USER_ADMINISTRATION_ROLES: readonly AppRole[] = ['super_admin'];
export const ENTITLEMENT_ADMINISTRATION_ROLES: readonly AppRole[] = ['super_admin'];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

export function hasRequiredRole(
  role: AppRole,
  allowedRoles: readonly AppRole[],
): boolean {
  return allowedRoles.includes(role);
}
