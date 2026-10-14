import { NextResponse } from 'next/server';
import { consultingSession } from '../../../../lib/server/consulting/development';
import { ConsultingWorkflow } from '../../../../lib/server/consulting/service';
import { generateDeliverablePdf } from '../../../../lib/server/consulting/report';
import { safeReportName } from '../../../../lib/consulting/validation';
import { gisError } from '../../../../lib/server/gis/http';
import { GisInputError, text } from '../../../../lib/gis/validation';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const s = consultingSession(request),
      url = new URL(request.url),
      id = url.searchParams.get('id'),
      format = url.searchParams.get('format') ?? 'pdf';
    if (
      !text(id, 100) ||
      !['pdf', 'json'].includes(format) ||
      [...url.searchParams.keys()].some(
        (k) => !['id', 'format', 'revision'].includes(k),
      )
    )
      throw new GisInputError('Unduhan tidak valid');
    const service = new ConsultingWorkflow(s.session.repo),
      record = await s.session.repo.get(id);
    const client = s.actor.grants[record?.projectId ?? '']?.includes('client');
    const doc = client
      ? await service.clientView(id, s.actor)
      : await service.staffView(id, s.actor);
    const requested = url.searchParams.get('revision');
    const revision =
      'revision' in doc
        ? doc.revision
        : requested
          ? doc.revisions.find((r) => r.number === Number(requested))
          : doc.revisions.at(-1);
    if (
      !revision ||
      (client && requested && Number(requested) !== revision.number)
    )
      throw new GisInputError('Revisi unduhan tidak tersedia');
    const project = (await s.session.repo.listProjects()).find(
      (p) => p.id === doc.projectId,
    )!;
    const bytes =
      format === 'pdf'
        ? generateDeliverablePdf(project, doc, revision)
        : new TextEncoder().encode(
            JSON.stringify({ project, document: doc }, null, 2),
          );
    return s.attach(
      new NextResponse(new Uint8Array(bytes).buffer, {
        headers: {
          'Content-Type':
            format === 'pdf'
              ? 'application/pdf'
              : 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeReportName(id, revision.number, format as 'pdf' | 'json')}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      }),
    );
  } catch (e) {
    return gisError(e);
  }
}
