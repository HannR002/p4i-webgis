import { NextResponse } from 'next/server';
import { getDatabaseRepositories } from '../../../lib/server/database';
import { apiErrorResponse, isUuid, readJsonBody } from '../../../lib/server/http';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await readJsonBody(request);
    if (!isRecord(body)) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    const allowed = new Set(['name', 'institution', 'email', 'whatsapp', 'requested_project_id']);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return NextResponse.json({ error: 'Request contains unsupported fields' }, { status: 400 });
    }

    const name = requiredText(body.name, 255);
    const institution = requiredText(body.institution, 255);
    const email = requiredText(body.email, 255);
    const whatsapp = body.whatsapp === undefined || body.whatsapp === ''
      ? null
      : requiredText(body.whatsapp, 50);
    const requestedProjectId = body.requested_project_id === null || body.requested_project_id === undefined
      ? null
      : body.requested_project_id;
    if (!name || !institution || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Nama, instansi, dan email valid wajib diisi' }, { status: 400 });
    }
    if ((body.whatsapp !== undefined && body.whatsapp !== '' && !whatsapp)
      || (requestedProjectId !== null && !isUuid(requestedProjectId))) {
      return NextResponse.json({ error: 'WhatsApp atau project ID tidak valid' }, { status: 400 });
    }

    const repositories = getDatabaseRepositories();
    if (requestedProjectId && !await repositories.projects.exists(requestedProjectId)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await repositories.leads.create({
      name,
      institution,
      email,
      whatsapp,
      requestedProjectId,
    });
    return NextResponse.json({ success: true, message: 'Proposal request sent' }, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'POST /api/leads');
  }
}
