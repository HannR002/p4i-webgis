import type { AppRole } from '../../authRoles';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface RequestIdentity {
  user: AuthenticatedUser;
  role: AppRole;
}

export interface AuthProvider {
  verifyAccessToken(accessToken: string): Promise<AuthenticatedUser | null>;
}
