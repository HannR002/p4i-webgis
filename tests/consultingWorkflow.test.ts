import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  ConsultingWorkflow,
  verifyRevision,
} from '../lib/server/consulting/service';
import {
  DevelopmentConsultingRepository,
  developmentActor,
  PROJECT_A,
  PROJECT_B,
} from '../lib/server/consulting/development';
import {
  parseDeliverableContent,
  parseReviewChecklist,
  safeReportName,
} from '../lib/consulting/validation';
import { generateDeliverablePdf } from '../lib/server/consulting/report';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { emptyRecipe } from '../lib/gis/catalog';
import { applyMapAction } from '../lib/gis/recipe';
import { defaultConfiguration } from '../lib/gis/analysisConfiguration';
import { prepareConfigurationApplication } from '../lib/gis/analysisApplication';
import { createControlledDemoProvider } from '../lib/server/ai/providers/controlledDemo';
import {
  executeGISPlan,
  planningInput,
  planWithProvider,
} from '../lib/server/ai/execution';
import { getRasterProvider } from '../lib/server/gis/rasterProvider';
import { parseGISToolRequest } from '../lib/gis/copilotValidation';
const gis = createDemoGisProvider(),
  catalog = gis.catalog(),
  context = {
    role: 'managerial_analyst' as const,
    entitledProjectIds: [PROJECT_A, PROJECT_B],
  },
  author = developmentActor('analyst'),
  reviewer = developmentActor('reviewer'),
  publisher = developmentActor('publisher'),
  client = developmentActor('client-a'),
  checklist = {
    completeness: true,
    interpretation: true,
    authorizedRelease: true,
    professionalQuality: true,
  };
function content() {
  return parseDeliverableContent(
    {
      title: 'DEMO client report',
      summary: 'Experimental analysis; no real measurements.',
      analystNotes: 'INTERNAL-NOTES-DO-NOT-RELEASE',
      assumptions: 'Synthetic fixture sources.',
      limitations: 'Not suitable for operational decisions.',
      recipe: emptyRecipe(),
    },
    catalog,
    context,
    PROJECT_A,
  );
}
async function setup() {
  const repo = new DevelopmentConsultingRepository(),
    service = new ConsultingWorkflow(repo),
    draft = await service.create(PROJECT_A, content(), author);
  return { repo, service, draft };
}
async function approved() {
  const s = await setup();
  const submitted = await s.service.submit(s.draft.id, 1, author);
  const approved = await s.service.review(
    submitted.id,
    submitted.version,
    submitted.revisions[0].contentHash,
    'APPROVE',
    'Complete for intended DEMO release.',
    checklist,
    reviewer,
  );
  return { ...s, approved };
}
describe('client deliverable workflow and isolation', () => {
  it('executes draft → review → approved → simulated publication with independent capability grants', async () => {
    const { service, repo, approved: d } = await approved();
    expect(d.status).toBe('APPROVED');
    const released = await service.publish(
      d.id,
      d.version,
      d.revisions[0].contentHash,
      publisher,
    );
    expect(released.status).toBe('PUBLISHED');
    expect(released.publications[0]).toMatchObject({
      official: false,
      mode: 'DEVELOPMENT_SIMULATION',
    });
    expect((await repo.audit(PROJECT_A)).map((e) => e.action)).toEqual([
      'CREATE_DRAFT',
      'SUBMIT_REVIEW',
      'APPROVE',
      'SIMULATED_PUBLICATION',
    ]);
  });
  it('rejects author/admin/client approval and publication without explicit project capability', async () => {
    const { service, draft } = await setup();
    const d = await service.submit(draft.id, 1, author),
      hash = d.revisions[0].contentHash;
    for (const actor of [author, client, developmentActor('admin')]) {
      await expect(
        service.review(
          d.id,
          d.version,
          hash,
          'APPROVE',
          'No implicit professional qualifications.',
          checklist,
          actor,
        ),
      ).rejects.toThrow();
      await expect(
        service.publish(d.id, d.version, hash, actor),
      ).rejects.toThrow();
    }
    await expect(
      service.publish(d.id, d.version, hash, publisher),
    ).rejects.toThrow(/belum/);
  });
  it('rejects AI self approval, publication and submission even with copied human grants', async () => {
    const { service, draft } = await setup(),
      ai = { ...reviewer, kind: 'ai' as const };
    const d = await service.submit(draft.id, 1, author);
    await expect(
      service.review(
        d.id,
        d.version,
        d.revisions[0].contentHash,
        'APPROVE',
        'AI cannot approve',
        checklist,
        ai,
      ),
    ).rejects.toThrow(/AI/);
    await expect(
      service.publish(d.id, d.version, d.revisions[0].contentHash, {
        ...publisher,
        kind: 'ai',
      }),
    ).rejects.toThrow(/AI/);
    const created = await service.create(PROJECT_A, content(), {
      ...author,
      kind: 'ai',
    });
    expect(created.status).toBe('DRAFT');
    expect(created.revisions[0].origin).toBe('ai');
    await expect(
      service.submit(created.id, 1, { ...author, kind: 'ai' }),
    ).rejects.toThrow(/Manusia/);
    expect(() =>
      parseGISToolRequest({ tool: 'approveDeliverable', id: created.id }),
    ).toThrow();
    expect(() =>
      parseGISToolRequest({ tool: 'publishDeliverable', id: created.id }),
    ).toThrow();
  });
  it('requires independent reviewer, exact revision hash and complete professional checklist', async () => {
    const { service, draft } = await setup(),
      d = await service.submit(draft.id, 1, author),
      hash = d.revisions[0].contentHash;
    await expect(
      service.review(
        d.id,
        d.version,
        'f'.repeat(64),
        'APPROVE',
        'Wrong snapshot',
        checklist,
        reviewer,
      ),
    ).rejects.toThrow();
    await expect(
      service.review(
        d.id,
        d.version,
        hash,
        'APPROVE',
        'Missing checks',
        { ...checklist, authorizedRelease: false },
        reviewer,
      ),
    ).rejects.toThrow();
    await expect(
      service.review(
        d.id,
        d.version,
        hash,
        'APPROVE',
        'Empty forged checklist',
        {} as typeof checklist,
        reviewer,
      ),
    ).rejects.toThrow();
    await expect(
      service.review(
        d.id,
        d.version,
        hash,
        'APPROVE',
        'Self review',
        checklist,
        { ...author, grants: { [PROJECT_A]: ['author', 'review'] } },
      ),
    ).rejects.toThrow(/indépendent|independen/);
  });
  it('hides unpublished deliverables and internal notes from entitled clients', async () => {
    const { service, draft } = await setup();
    await expect(service.clientView(draft.id, client)).rejects.toThrow();
    await expect(service.staffView(draft.id, client)).rejects.toThrow();
    let d = await service.submit(draft.id, 1, author);
    d = await service.review(
      d.id,
      d.version,
      d.revisions[0].contentHash,
      'APPROVE',
      'Ready',
      checklist,
      reviewer,
    );
    await service.publish(
      d.id,
      d.version,
      d.revisions[0].contentHash,
      publisher,
    );
    const dto = await service.clientView(d.id, client);
    expect(JSON.stringify(dto)).not.toContain('INTERNAL-NOTES-DO-NOT-RELEASE');
    expect(dto).not.toHaveProperty('reviews');
    expect(dto).not.toHaveProperty('revisions');
    await expect(
      service.clientView(d.id, developmentActor('client-b')),
    ).rejects.toThrow();
  });
  it('preserves previously published revision when the current report is revised', async () => {
    const { service, approved: d } = await approved();
    const released = await service.publish(
      d.id,
      d.version,
      d.revisions[0].contentHash,
      publisher,
    );
    const next = await service.revise(
      d.id,
      released.version,
      { ...content(), summary: 'NEW UNPUBLISHED CLIENT CONTENT' },
      author,
    );
    expect(next.status).toBe('DRAFT');
    expect(next.currentRevision).toBe(2);
    expect(next.revisions[0].contentHash).toBe(d.revisions[0].contentHash);
    const view = await service.clientView(d.id, client);
    expect(view.revision.number).toBe(1);
    expect(JSON.stringify(view)).not.toContain('NEW UNPUBLISHED');
    await expect(
      service.publish(
        d.id,
        next.version,
        next.revisions[1].contentHash,
        publisher,
      ),
    ).rejects.toThrow();
  });
  it('supports rejection/request changes and a fresh revision before resubmission', async () => {
    for (const decision of ['REQUEST_CHANGES', 'REJECT'] as const) {
      const { service, draft } = await setup();
      let d = await service.submit(draft.id, 1, author);
      d = await service.review(
        d.id,
        d.version,
        d.revisions[0].contentHash,
        decision,
        'Please clarify interpretation.',
        checklist,
        reviewer,
      );
      expect(d.status).toBe('CHANGES_REQUESTED');
      await expect(service.submit(d.id, d.version, author)).rejects.toThrow();
      d = await service.revise(
        d.id,
        d.version,
        { ...content(), summary: 'Clarified draft.' },
        author,
      );
      expect(d.currentRevision).toBe(2);
      expect((await service.submit(d.id, d.version, author)).status).toBe(
        'READY_FOR_REVIEW',
      );
    }
  });
  it('detects stale edits and preserves immutable approved revision/review/publication evidence', async () => {
    const { service, repo, approved: d } = await approved();
    await expect(service.revise(d.id, 1, content(), author)).rejects.toThrow(
      /Versi/,
    );
    const changed = structuredClone(d);
    changed.revisions[0].content.summary = 'tamper';
    expect(() => verifyRevision(changed.revisions[0])).toThrow();
    await expect(
      repo.commit(changed, d.version, {
        id: 'audit',
        deliverableId: d.id,
        projectId: d.projectId,
        actorId: author.id,
        action: 'tamper',
        revision: 1,
        at: new Date().toISOString(),
      }),
    ).rejects.toThrow(/immutable/);
  });
  it('isolates repositories and prevents cross-project source attachment even for staff', async () => {
    const { draft } = await setup();
    await expect(
      new ConsultingWorkflow(new DevelopmentConsultingRepository()).staffView(
        draft.id,
        author,
      ),
    ).rejects.toThrow();
    const restricted = catalog.map((d) =>
      d.id === 'demo-rainfall'
        ? { ...d, accessTier: 'restricted' as const, projectId: PROJECT_B }
        : d,
    );
    const recipe = applyMapAction(
      emptyRecipe(),
      { tool: 'addLayer', datasetId: 'demo-rainfall' },
      restricted,
      context,
    );
    expect(() =>
      parseDeliverableContent(
        { ...content(), recipe },
        restricted,
        context,
        PROJECT_A,
      ),
    ).toThrow(/Sumber/);
    expect(() =>
      parseDeliverableContent({ ...content(), title: '' }, catalog, context),
    ).toThrow();
    expect(() => parseReviewChecklist({ completeness: true })).toThrow();
  });
  it('tracks actual external job states without accepting mismatched results and blocks premature review', async () => {
    const { service, draft } = await setup(),
      run = {
        jobId: 'owned-job',
        projectId: PROJECT_A,
        state: 'RUNNING' as const,
        requestHash: 'a'.repeat(64),
        configurationId: null,
        configurationVersion: null,
      };
    const running = await service.attachAnalysis(
      draft.id,
      1,
      run,
      null,
      author,
    );
    expect(running.status).toBe('ANALYSIS_RUNNING');
    await expect(
      service.submit(draft.id, running.version, author),
    ).rejects.toThrow();
    await expect(
      service.attachAnalysis(
        draft.id,
        running.version,
        { ...run, projectId: PROJECT_B },
        null,
        author,
      ),
    ).rejects.toThrow();
    const failed = await service.attachAnalysis(
      draft.id,
      running.version,
      { ...run, state: 'FAILED' },
      null,
      author,
    );
    expect(failed.status).toBe('DRAFT');
    expect(failed.revisions.at(-1)!.analysisResult).toBeNull();
  });
  it('creates safe real PDF bytes with project identity, experimental status, configuration, sources and limitations', async () => {
    const { service, repo, draft } = await setup();
    const config = defaultConfiguration('wlc', catalog);
    const application = prepareConfigurationApplication(
      config,
      emptyRecipe(),
      catalog,
      context,
      'demo',
    );
    if (application.kind === 'configuration-only') throw Error();
    const d = await service.revise(
      draft.id,
      1,
      parseDeliverableContent(
        { ...content(), recipe: application.recipe },
        catalog,
        context,
        PROJECT_A,
      ),
      author,
    );
    const pdf = generateDeliverablePdf(
      (await repo.listProjects())[0],
      d,
      d.revisions.at(-1)!,
    );
    const raw = Buffer.from(pdf).toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    for (const marker of [
      'P4I Consultant',
      'DEMO / EXPERIMENTAL',
      'DRAFT',
      'Evidence SHA-256',
      'Weights:',
      'EXPERIMENTAL',
    ])
      expect(raw).toContain(marker);
    expect(safeReportName('../../evil\r\n.pdf', 1, 'pdf')).not.toMatch(
      /[\r\n/]/,
    );
  });
  it('prepares an actual Copilot draft without approval/publication handlers or map mutations', async () => {
    const env = {
        catalog,
        context,
        mode: 'demo' as const,
        configurations: [],
        raster: getRasterProvider(gis),
        signal: new AbortController().signal,
      },
      provider = createControlledDemoProvider(),
      recipe = emptyRecipe();
    const plan = await planWithProvider(
      provider,
      planningInput('Siapkan draft deliverable klien', recipe, env),
    );
    const response = await executeGISPlan(plan, recipe, env);
    expect(response.changed).toBe(false);
    expect(response.results[0].tool).toBe('prepareClientDeliverableDraft');
    expect(response.results[0].summary).toContain('DRAFT');
    expect(response.approval).toBeNull();
  });
});
