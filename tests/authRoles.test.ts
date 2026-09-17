import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLES,
  ENTITLEMENT_ADMINISTRATION_ROLES,
  PROJECT_CREATE_ROLES,
  PROJECT_DELETE_ROLES,
  SUPER_ADMIN_ROLES,
  USER_ADMINISTRATION_ROLES,
  hasRequiredRole,
} from '../lib/authRoles';

describe('authorization role helpers', () => {
  it('allows both admin roles to create projects', () => {
    expect(hasRequiredRole('super_admin', ADMIN_ROLES)).toBe(true);
    expect(hasRequiredRole('managerial_analyst', ADMIN_ROLES)).toBe(true);
    expect(hasRequiredRole('b2b_client', ADMIN_ROLES)).toBe(false);
  });

  it('reserves destructive project operations for super admins', () => {
    expect(hasRequiredRole('super_admin', SUPER_ADMIN_ROLES)).toBe(true);
    expect(hasRequiredRole('managerial_analyst', SUPER_ADMIN_ROLES)).toBe(false);
  });

  it('separates analyst project creation from destructive administration', () => {
    expect(hasRequiredRole('managerial_analyst', PROJECT_CREATE_ROLES)).toBe(true);
    expect(hasRequiredRole('managerial_analyst', PROJECT_DELETE_ROLES)).toBe(false);
    expect(hasRequiredRole('managerial_analyst', USER_ADMINISTRATION_ROLES)).toBe(false);
    expect(hasRequiredRole('managerial_analyst', ENTITLEMENT_ADMINISTRATION_ROLES)).toBe(false);
    expect(hasRequiredRole('super_admin', PROJECT_DELETE_ROLES)).toBe(true);
  });
});
