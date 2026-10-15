import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { getRequestIdentity } from '../auth';
import { getGisContext } from '../gis/context';
import { getGisProvider } from '../gis';
import { getRasterProvider } from '../gis/rasterProvider';
import { executeLocalCompute } from './adapter';
import type { ComputeEnvironment } from './service';
import { GisPermissionError } from '../../gis/recipe';
const key = Symbol.for('p4i.compute.sessions.v1');
const globalStore = globalThis as typeof globalThis & {
  [key]?: Map<string, number>;
};
const sessions = (globalStore[key] ??= new Map<string, number>());
const cookieName = 'p4i-compute-session';
export function requireHumanOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Next may normalize request.url to its bind address. Browser Host is the public authority;
  // do not trust arbitrary x-forwarded-host or accept same-site sibling domains.
  let source: URL | null = null;
  try {
    if (origin) source = new URL(origin);
  } catch {}
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (
    !source ||
    !['http:', 'https:'].includes(source.protocol) ||
    source.origin !== origin ||
    source.host !== host ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new GisPermissionError(
      'Persetujuan/mutasi job harus berasal dari halaman aplikasi yang sama',
    );
}
export async function computeEnvironment(
  request: Request,
): Promise<{
  env: ComputeEnvironment;
  attach(response: NextResponse): NextResponse;
}> {
  if (process.env.NODE_ENV === 'production')
    throw new GisPermissionError(
      'Adapter komputasi ini hanya untuk development; worker produksi belum tersedia',
    );
  const identity = await getRequestIdentity(request),
    gis = getGisProvider(),
    catalog = gis.catalog();
  const context = await getGisContext(request, catalog);
  for (const [id, expiry] of sessions)
    if (expiry <= Date.now()) sessions.delete(id);
  let session = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  if (!session || !sessions.has(session)) {
    if (sessions.size >= 256)
      throw new GisPermissionError('Kapasitas sesi development tercapai');
    session = randomUUID();
    sessions.set(session, Date.now() + 30 * 60 * 1000);
  }
  const access = {
    requesterId: identity
      ? `user:${identity.user.id}`
      : `development:${session}`,
    catalog,
    context,
    mode: gis.mode,
  };
  const env: ComputeEnvironment = {
    ...access,
    execute: (r, recipe, signal) =>
      executeLocalCompute(r, recipe, access, getRasterProvider(gis), signal),
  };
  return {
    env,
    attach(response) {
      response.cookies.set(cookieName, session!, {
        httpOnly: true,
        sameSite: 'strict',
        secure: new URL(request.url).protocol === 'https:',
        path: '/',
        maxAge: 1800,
      });
      return response;
    },
  };
}
