import { NextResponse } from 'next/server';
import {
  consultingSession,
  PERSONAS,
  type Persona,
} from '../../../lib/server/consulting/development';
import { ConsultingWorkflow } from '../../../lib/server/consulting/service';
import {
  requireHumanOrigin,
  computeEnvironment,
} from '../../../lib/server/compute/access';
import { developmentCompute } from '../../../lib/server/compute/service';
import { getGisProvider } from '../../../lib/server/gis';
import { gisError, readGisBody } from '../../../lib/server/gis/http';
import { record, text, GisInputError } from '../../../lib/gis/validation';
import { exact } from '../../../lib/gis/copilotValidation';
import {
  parseDeliverableContent,
  parseReviewChecklist,
} from '../../../lib/consulting/validation';
import { applyComputeJob } from '../../../lib/gis/computeMap';
import type { ReviewerDecision } from '../../../lib/consulting/contracts';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const s = consultingSession(request),
      service = new ConsultingWorkflow(s.session.repo);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const detail = s.actor.grants[
        (await s.session.repo.get(id))?.projectId ?? ''
      ]?.includes('client')
        ? await service.clientView(id, s.actor)
        : await service.staffView(id, s.actor);
      return s.attach(
        NextResponse.json(
          { detail },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      );
    }
    const projects = (await s.session.repo.listProjects()).filter(
      (p) => s.actor.grants[p.id]?.length,
    );
    const deliverables = [];
    for (const p of projects)
      for (const d of await s.session.repo.listDeliverables(p.id)) {
        if (s.actor.grants[p.id].includes('client')) {
          if (d.publications.length) {
            const published = await service.clientView(d.id, s.actor);
            deliverables.push({
              id: d.id,
              projectId: p.id,
              title: published.revision.content.title,
              status: 'PUBLISHED',
              revision: published.revision.number,
            });
          }
        } else
          deliverables.push({
            id: d.id,
            projectId: p.id,
            title: d.revisions.at(-1)!.content.title,
            status: d.status,
            revision: d.currentRevision,
          });
      }
    return s.attach(
      NextResponse.json(
        {
          mode: 'DEVELOPMENT_SIMULATION',
          official: false,
          persona: s.session.persona,
          personas: PERSONAS,
          grants: s.actor.grants,
          projects,
          deliverables,
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      ),
    );
  } catch (e) {
    return gisError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireHumanOrigin(request);
    const body = await readGisBody(request);
    if (!record(body) || !text(body.action, 30))
      throw new GisInputError('Aksi tidak valid');
    const s = consultingSession(request),
      service = new ConsultingWorkflow(s.session.repo);
    if (body.action === 'persona') {
      exact(body, ['action', 'persona']);
      if (!PERSONAS.some((p) => p.id === body.persona))
        throw new GisInputError('Persona development tidak dikenal');
      s.session.persona = body.persona as Persona;
      return s.attach(NextResponse.json({ ok: true }));
    }
    const gis = getGisProvider(),
      catalog = gis.catalog(),
      context = {
        role: 'managerial_analyst' as const,
        entitledProjectIds: Object.keys(s.actor.grants),
      };
    const vectors = gis.vector('demo-boundaries');
    const source = catalog.find((d) => d.id === 'demo-boundaries');
    const mapOutline =
      vectors.status === 'ok' && source?.status === 'demo'
        ? {
            datasetId: source.id,
            version: source.version,
            provenance: source.provenance,
            rings: (
              vectors.data.features as {
                geometry: { type: string; coordinates: number[][][][] };
              }[]
            ).flatMap((f) =>
              f.geometry.type === 'MultiPolygon'
                ? f.geometry.coordinates.flatMap((p) =>
                    p.map((r) => r.map(([x, y]) => [x, y] as [number, number])),
                  )
                : [],
            ),
          }
        : undefined;
    let detail;
    if (body.action === 'create') {
      exact(body, ['action', 'projectId', 'content', 'origin']);
      if (
        !text(body.projectId, 100) ||
        !['human', 'ai'].includes(String(body.origin))
      )
        throw new GisInputError('Proyek/origin tidak valid');
      const content = parseDeliverableContent(
        body.content,
        catalog,
        context,
        body.projectId,
        mapOutline,
      );
      detail = await service.create(
        body.projectId,
        content,
        s.actor,
        body.origin as 'human' | 'ai',
      );
    } else {
      if (
        !text(body.id, 100) ||
        !Number.isInteger(body.version) ||
        Number(body.version) < 1
      )
        throw new GisInputError('Identitas/versi diperlukan');
      const id = body.id,
        version = Number(body.version);
      if (body.action === 'revise') {
        exact(body, ['action', 'id', 'version', 'content', 'origin']);
        if (!['human', 'ai'].includes(String(body.origin)))
          throw new GisInputError('Origin tidak valid');
        const current = await service.staffView(id, s.actor);
        detail = await service.revise(
          id,
          version,
          parseDeliverableContent(
            body.content,
            catalog,
            context,
            current.projectId,
            mapOutline,
          ),
          s.actor,
          body.origin as 'human' | 'ai',
        );
      } else if (body.action === 'submit') {
        exact(body, ['action', 'id', 'version']);
        detail = await service.submit(id, version, s.actor);
      } else if (body.action === 'review') {
        exact(body, [
          'action',
          'id',
          'version',
          'hash',
          'decision',
          'comments',
          'checklist',
        ]);
        if (
          !text(body.hash, 64) ||
          !text(body.comments, 3000) ||
          !['APPROVE', 'REQUEST_CHANGES', 'REJECT'].includes(
            String(body.decision),
          )
        )
          throw new GisInputError('Review tidak valid');
        detail = await service.review(
          id,
          version,
          body.hash,
          body.decision as ReviewerDecision,
          body.comments,
          parseReviewChecklist(body.checklist),
          s.actor,
        );
      } else if (body.action === 'publish') {
        exact(body, ['action', 'id', 'version', 'hash']);
        if (!text(body.hash, 64)) throw new GisInputError('Hash diperlukan');
        detail = await service.publish(id, version, body.hash, s.actor);
      } else if (body.action === 'attachAnalysis') {
        exact(body, ['action', 'id', 'version', 'jobId']);
        if (!text(body.jobId, 100))
          throw new GisInputError('Job ID diperlukan');
        const { env } = await computeEnvironment(request),
          job = developmentCompute.get(body.jobId, env);
        const current = await service.staffView(id, s.actor);
        if (
          job.request.projectId &&
          job.request.projectId !== current.projectId
        )
          throw new GisInputError('Job berasal dari proyek lain');
        const run = {
          jobId: job.id,
          projectId: job.request.projectId,
          state: job.state,
          requestHash: job.requestHash,
          configurationId: job.request.configuration?.id ?? null,
          configurationVersion: job.request.configuration?.version ?? null,
        };
        const recipe =
          job.state === 'COMPLETED'
            ? applyComputeJob(
                current.revisions.at(-1)!.content.recipe,
                job,
                catalog,
                context,
                gis.mode,
              )
            : undefined;
        detail = await service.attachAnalysis(
          id,
          version,
          run,
          job.result ? { jobId: job.id, result: job.result } : null,
          s.actor,
          recipe
            ? parseDeliverableContent(
                { ...current.revisions.at(-1)!.content, recipe },
                catalog,
                context,
                current.projectId,
                mapOutline,
              )
            : undefined,
        );
      } else throw new GisInputError('Aksi tidak didukung');
    }
    return s.attach(
      NextResponse.json(
        { detail },
        { headers: { 'Cache-Control': 'private, no-store' } },
      ),
    );
  } catch (e) {
    return gisError(e);
  }
}
