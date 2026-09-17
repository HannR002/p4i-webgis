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
  matcher: ['/admin/:path*', '/portal/:path*'],
};
