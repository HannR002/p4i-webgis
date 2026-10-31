import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { hostingerHostname } from '../academicPreview';

type Environment = Record<string, string | undefined>;
/** This supplements the server configuration contract; headers never activate it. */
export function hostingerRequestHostAllowed(host: string | null, env: Environment): boolean {
  const expected = hostingerHostname(env);
  if (!host || !expected || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return false;
  try {
    const url = new URL(`http://${host}`);
    return url.hostname === expected && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** A high-entropy, owner-managed preview password is required; never a real user identity. */
export function hostingerAccessAllowed(authorization: string | null, env: Environment): boolean {
  if (!authorization || authorization.length > 2048 || !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorization)) return false;
  const encoded = authorization.slice(6);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) return false;
  const decoded = bytes.toString('utf8'), separator = decoded.indexOf(':');
  if (separator < 1) return false;
  const username = decoded.slice(0, separator), password = decoded.slice(separator + 1);
  const expectedHash = env.P4I_HOSTINGER_PASSWORD_SHA256 ?? '';
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !env.P4I_HOSTINGER_ACCESS_USER || password.length < 24) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const userMatches = timingSafeEqual(digest(username), digest(env.P4I_HOSTINGER_ACCESS_USER));
  const passwordMatches = timingSafeEqual(digest(password), Buffer.from(expectedHash, 'hex'));
  return userMatches && passwordMatches;
}
