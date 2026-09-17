import 'server-only';

import { hasRequiredRole, type AppRole } from '../../authRoles';
import { getDatabaseRepositories } from '../database';
import { resolveAuthProvider } from '../providerConfig';
import type { AuthProvider, RequestIdentity } from './contracts';
import { resolveIdentityWith } from './identity';
import { createSupabaseAuthProvider } from './providers/supabase/supabaseAuthProvider';

export type { AuthenticatedUser, AuthProvider, RequestIdentity } from './contracts';
export type { AuthProviderName } from '../providerConfig';
export { resolveAuthProvider } from '../providerConfig';

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

let authProvider: AuthProvider | undefined;

function getAuthProvider(): AuthProvider {
  if (authProvider) return authProvider;
  switch (resolveAuthProvider(process.env.AUTH_PROVIDER)) {
    case 'supabase':
      authProvider = createSupabaseAuthProvider();
      return authProvider;
  }
}

function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function getRequestAccessToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim() || null;
  return readCookieValue(request.headers.get('cookie'), 'sb-access-token');
}

export function getIdentityFromAccessToken(accessToken: string): Promise<RequestIdentity | null> {
  return resolveIdentityWith(
    accessToken,
    getAuthProvider(),
    (userId) => getDatabaseRepositories().users.findAuthProfile(userId),
  );
}

export async function getRequestIdentity(request: Request): Promise<RequestIdentity | null> {
  const token = getRequestAccessToken(request);
  return token ? getIdentityFromAccessToken(token) : null;
}

export async function requireRole(
  request: Request,
  allowedRoles: readonly AppRole[],
): Promise<RequestIdentity> {
  const identity = await getRequestIdentity(request);
  if (!identity) throw new AuthorizationError('Authentication required', 401);
  if (!hasRequiredRole(identity.role, allowedRoles)) {
    throw new AuthorizationError('Insufficient permissions', 403);
  }
  return identity;
}
