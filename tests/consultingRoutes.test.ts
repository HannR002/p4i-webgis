import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { GET, POST } from '../app/api/consulting/route';
import { GET as DOWNLOAD } from '../app/api/consulting/download/route';
import { PROJECT_A } from '../lib/server/consulting/development';
import { emptyRecipe } from '../lib/gis/catalog';
const content = {
  title: 'Confidential DEMO draft',
  summary: 'Only published results can be released.',
  analystNotes: 'INTERNAL-SECRET-DRAFT-NOTE',
  assumptions: 'Synthetic inputs',
  limitations: 'EXPERIMENTAL, not scientific validation',
  recipe: emptyRecipe(),
};
function req(
  path = '',
  body?: unknown,
  cookie = '',
  origin = 'http://localhost',
) {
  return new Request('http://localhost/api/consulting' + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, origin, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function start() {
  const r = await GET(req());
  return r.headers.get('set-cookie')!.split(';')[0];
}
async function post(cookie: string, body: unknown) {
  return POST(req('', body, cookie));
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GIS_DEMO_MODE', 'true');
});
afterEach(() => vi.unstubAllEnvs());
describe('consulting HTTP, publication and download boundary', () => {
  it('requires development mode and rejects production despite the DEMO flag', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await GET(req())).status).toBe(403);
    expect((await DOWNLOAD(req('/download?id=x'))).status).toBe(403);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GIS_DEMO_MODE', 'false');
    expect((await GET(req())).status).toBe(403);
  });
  it('creates opaque isolated sessions and rejects forged roles, cross-origin writes and unknown fields', async () => {
    const r = await GET(req()),
      cookie = r.headers.get('set-cookie')!.split(';')[0];
    expect(r.headers.get('set-cookie')).toContain('HttpOnly');
    expect(r.headers.get('set-cookie')).toContain('SameSite=strict');
    expect(
      (
        await POST(
          req(
            '',
            {
              action: 'create',
              projectId: PROJECT_A,
              content,
              origin: 'human',
            },
            cookie,
            'https://evil.example',
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(cookie, {
          action: 'create',
          projectId: PROJECT_A,
          content,
          origin: 'human',
          role: 'super_admin',
        })
      ).status,
    ).toBe(400);
    const created = await post(cookie, {
      action: 'create',
      projectId: PROJECT_A,
      content,
      origin: 'ai',
    });
    expect(created.status).toBe(200);
    const { detail } = await created.json();
    expect(detail.status).toBe('DRAFT');
    expect(detail.revisions[0].origin).toBe('ai');
    expect(
      (await GET(req('?id=' + detail.id, undefined, await start()))).status,
    ).toBe(403);
  });
  it('keeps drafts and unentitled reports out of client list, detail and all download formats', async () => {
    const cookie = await start();
    const r = await post(cookie, {
        action: 'create',
        projectId: PROJECT_A,
        content,
        origin: 'human',
      }),
      d = (await r.json()).detail;
    await post(cookie, { action: 'persona', persona: 'client-a' });
    expect(
      (await (await GET(req('', undefined, cookie))).json()).deliverables,
    ).toEqual([]);
    expect((await GET(req('?id=' + d.id, undefined, cookie))).status).toBe(403);
    for (const format of ['pdf', 'json'])
      expect(
        (
          await DOWNLOAD(
            req(`/download?id=${d.id}&format=${format}`, undefined, cookie),
          )
        ).status,
      ).toBe(403);
    expect(
      (
        await post(cookie, {
          action: 'review',
          id: d.id,
          version: d.version,
          hash: d.revisions[0].contentHash,
          decision: 'APPROVE',
          comments: 'forged',
          checklist: {},
        })
      ).status,
    ).toBe(400);
  });
  it('serves only the reviewed published snapshot, redacts internal notes and returns safe PDF attachments', async () => {
    const cookie = await start();
    let d = (
      await (
        await post(cookie, {
          action: 'create',
          projectId: PROJECT_A,
          content,
          origin: 'human',
        })
      ).json()
    ).detail;
    d = (
      await (
        await post(cookie, { action: 'submit', id: d.id, version: d.version })
      ).json()
    ).detail;
    await post(cookie, { action: 'persona', persona: 'reviewer' });
    d = (
      await (
        await post(cookie, {
          action: 'review',
          id: d.id,
          version: d.version,
          hash: d.revisions[0].contentHash,
          decision: 'APPROVE',
          comments: 'Professional completeness reviewed for DEMO.',
          checklist: {
            completeness: true,
            interpretation: true,
            authorizedRelease: true,
            professionalQuality: true,
          },
        })
      ).json()
    ).detail;
    await post(cookie, { action: 'persona', persona: 'publisher' });
    d = (
      await (
        await post(cookie, {
          action: 'publish',
          id: d.id,
          version: d.version,
          hash: d.revisions[0].contentHash,
        })
      ).json()
    ).detail;
    expect(d.status).toBe('PUBLISHED');
    await post(cookie, { action: 'persona', persona: 'client-a' });
    const json = await DOWNLOAD(
      req(`/download?id=${d.id}&format=json`, undefined, cookie),
    );
    expect(json.status).toBe(200);
    const raw = await json.text();
    expect(raw).not.toContain('INTERNAL-SECRET-DRAFT-NOTE');
    expect(raw).not.toContain('Professional completeness reviewed');
    const pdf = await DOWNLOAD(
      req(`/download?id=${d.id}&format=pdf`, undefined, cookie),
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf');
    expect(pdf.headers.get('Cache-Control')).toContain('no-store');
    expect(pdf.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(pdf.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="p4i-deliverable-/,
    );
    const bytes = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
    expect(bytes).toContain('%PDF-');
    expect(bytes).toContain('PUBLISHED - SIMULATION');
    expect(bytes).not.toContain('INTERNAL-SECRET-DRAFT-NOTE');
    await post(cookie, { action: 'persona', persona: 'analyst' });
    d = (
      await (
        await post(cookie, {
          action: 'revise',
          id: d.id,
          version: d.version,
          content: { ...content, summary: 'UNPUBLISHED NEXT REVISION' },
          origin: 'human',
        })
      ).json()
    ).detail;
    await post(cookie, { action: 'persona', persona: 'client-a' });
    const view = await (
      await GET(req('?id=' + d.id, undefined, cookie))
    ).json();
    expect(view.detail.revision.number).toBe(1);
    expect(JSON.stringify(view)).not.toContain('UNPUBLISHED NEXT');
    expect(
      (
        await DOWNLOAD(
          req(`/download?id=${d.id}&revision=2`, undefined, cookie),
        )
      ).status,
    ).toBe(400);
    await post(cookie, { action: 'persona', persona: 'client-b' });
    expect(
      (await (await GET(req('', undefined, cookie))).json()).deliverables,
    ).toEqual([]);
    expect(
      (await DOWNLOAD(req(`/download?id=${d.id}`, undefined, cookie))).status,
    ).toBe(403);
  });
  it('cannot attach an invented or other-session compute job and does not accept uploaded measurements', async () => {
    const cookie = await start(),
      d = (
        await (
          await post(cookie, {
            action: 'create',
            projectId: PROJECT_A,
            content,
            origin: 'human',
          })
        ).json()
      ).detail;
    expect(
      (
        await post(cookie, {
          action: 'attachAnalysis',
          id: d.id,
          version: d.version,
          jobId: 'invented',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(cookie, {
          action: 'attachAnalysis',
          id: d.id,
          version: d.version,
          jobId: 'invented',
          result: { value: 999 },
        })
      ).status,
    ).toBe(400);
  });
});
