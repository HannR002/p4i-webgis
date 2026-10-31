import { academicRequested, academicStatus, academicApiAllowed, academicProvider } from './lib/academicPreview';
import { hostingerAccessAllowed, hostingerRequestHostAllowed } from './lib/server/hostingerPreviewAccess';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_ROLES, hasRequiredRole } from './lib/authRoles';
import { getIdentityFromAccessToken } from './lib/server/auth';

function redirectToLogin(request: NextRequest, reason?: string) {
  const url = new URL('/login', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  if (reason) url.searchParams.set('error', reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete('sb-access-token');
  return response;
}

export async function proxy(request: NextRequest) {
  if (academicRequested(process.env)) {
    const path = request.nextUrl.pathname;
    const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
    if (academicStatus(process.env) !== 'active')
      return NextResponse.json({ error: 'Konfigurasi preview akademik tidak valid.' }, { status: 503, headers });
    // Keep Vercel's original asset bypass/cache behavior; Hostinger authenticates every path.
    if (academicProvider(process.env) === 'vercel' && /^\/(?:_next\/(?:static|image)|favicon\.ico)/.test(path))
      return NextResponse.next();
    if (academicProvider(process.env) === 'hostinger') {
      headers['Referrer-Policy'] = 'no-referrer';
      headers['X-Frame-Options'] = 'DENY';
      if (!hostingerRequestHostAllowed(request.headers.get('host'), process.env))
        return NextResponse.json({ error: 'Host preview akademik tidak diizinkan.' }, { status: 503, headers });
      if (!hostingerAccessAllowed(request.headers.get('authorization'), process.env))
        return new NextResponse('Akses preview memerlukan autentikasi.', { status: 401, headers: {
          ...headers, 'WWW-Authenticate': 'Basic realm="P4I Academic Preview", charset="UTF-8"',
        } });
    }
    if (path.startsWith('/api/')) {
      if (!academicApiAllowed(path, request.method))
        return NextResponse.json({ error: 'Backend ini tidak tersedia dalam preview akademik.' }, { status: 503, headers });
    } else if (path === '/' || path === '/spatial') {
      return NextResponse.redirect(new URL('/spatial/home', request.url));
    } else if (!['/spatial/home', '/spatial/webmap', '/spatial/data', '/spatial/viewer', '/spatial/analysis', '/spatial/ai', '/spatial/help', '/academic-unavailable'].includes(path) && !path.startsWith('/_next/') && !/\.(png|svg|ico|woff2?)$/.test(path)) {
      return NextResponse.redirect(new URL('/academic-unavailable', request.url));
    }
    const response = NextResponse.next();
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }
  if (!['/admin', '/portal'].some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/')))
    return NextResponse.next();

  const token = request.cookies.get('sb-access-token')?.value;
  if (!token) return redirectToLogin(request);

  try {
    const identity = await getIdentityFromAccessToken(token);
    if (!identity) return redirectToLogin(request, 'session');
    if (request.nextUrl.pathname.startsWith('/admin') && !hasRequiredRole(identity.role, ADMIN_ROLES)) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }

    return NextResponse.next();
  } catch {
    return redirectToLogin(request, 'session');
  }
}

export const config = {
  // Hostinger has no external protection boundary: authenticate assets as well.
  matcher: ['/:path*'],
};
