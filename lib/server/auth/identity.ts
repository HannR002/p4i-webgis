import type { AppRole } from '../../authRoles';
import type { AuthProvider, RequestIdentity } from './contracts';

export type AuthProfileLookup = (
  userId: string,
) => Promise<{ role: AppRole; is_disabled: boolean } | null>;

export async function resolveIdentityWith(
  accessToken: string,
  provider: AuthProvider,
  findProfile: AuthProfileLookup,
): Promise<RequestIdentity | null> {
  if (!accessToken || accessToken.length > 8192) return null;
  const user = await provider.verifyAccessToken(accessToken);
  if (!user) return null;
  const profile = await findProfile(user.id);
  if (!profile || profile.is_disabled) return null;
  return { user, role: profile.role };
}
