import { NextResponse } from 'next/server';
import { getIdentityFromAccessToken, getRequestIdentity } from '../../../../lib/server/auth';
import { apiErrorResponse, readJsonBody } from '../../../../lib/server/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) return NextResponse.json({ authenticated: false });
    return NextResponse.json({
      authenticated: true,
      user: { id: identity.user.id, email: identity.user.email ?? null },
      role: identity.role,
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/auth/session');
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await readJsonBody(request);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (Object.keys(body).some((key) => key !== 'accessToken')) {
      return NextResponse.json({ error: 'Request contains unsupported fields' }, { status: 400 });
    }
    const accessToken = (body as Record<string, unknown>).accessToken;
    if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 400 });
    }

    const identity = await getIdentityFromAccessToken(accessToken);
    if (!identity) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const response = NextResponse.json({ authenticated: true, role: identity.role });
    response.cookies.set('sb-access-token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });
    return response;
  } catch (error: unknown) {
    return apiErrorResponse(error, 'POST /api/auth/session');
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete('sb-access-token');
  return response;
}
