import { NextResponse } from 'next/server';
import { APP_ROLES } from '../../../lib/authRoles';
import { requireRole } from '../../../lib/server/auth';
import { getDatabaseRepositories } from '../../../lib/server/database';
import { apiErrorResponse } from '../../../lib/server/http';

export async function GET(request: Request) {
  try {
    const identity = await requireRole(request, APP_ROLES);
    const hasCompleted = await getDatabaseRepositories().users.getOnboardingStatus(identity.user.id);
    return NextResponse.json({ hasCompleted });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'GET /api/onboarding');
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireRole(request, APP_ROLES);
    await getDatabaseRepositories().users.completeOnboarding(identity.user.id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'POST /api/onboarding');
  }
}
