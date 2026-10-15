import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextResponse } from 'next/server';
import type {
  ConsultingRepository,
  ConsultingProject,
  ClientDeliverable,
  WorkflowAuditEvent,
  WorkflowActor,
  ConsultingCapability,
} from '../../consulting/contracts';
import { demoEnabled } from '../../gis/mode';
import { GisInputError } from '../../gis/validation';
import { GisPermissionError } from '../../gis/recipe';
export const PROJECT_A = '11111111-1111-4111-8111-111111111111',
  PROJECT_B = '22222222-2222-4222-8222-222222222222';
export const DEVELOPMENT_PROJECTS: ConsultingProject[] = [
  {
    id: PROJECT_A,
    title: 'Kajian tata ruang — Proyek DEMO A',
    category: 'Konsultansi GIS',
    description:
      'Proyek sintetik untuk alur deliverable; tidak terhubung data klien nyata.',
    access_tier: 'restricted',
    clientLabel: 'Organisasi DEMO A',
    demo: true,
  },
  {
    id: PROJECT_B,
    title: 'Kajian wilayah — Proyek DEMO B',
    category: 'Konsultansi GIS',
    description: 'Proyek sintetik terisolasi untuk menguji entitlement.',
    access_tier: 'restricted',
    clientLabel: 'Organisasi DEMO B',
    demo: true,
  },
];
export const PERSONAS = [
  { id: 'analyst', label: 'Analis DEMO' },
  { id: 'reviewer', label: 'Reviewer DEMO (ditugaskan)' },
  { id: 'publisher', label: 'Publisher DEMO (ditugaskan)' },
  { id: 'client-a', label: 'Klien DEMO A' },
  { id: 'client-b', label: 'Klien DEMO B' },
  { id: 'admin', label: 'Admin DEMO (tanpa grant review)' },
] as const;
export type Persona = (typeof PERSONAS)[number]['id'];
export function developmentActor(persona: Persona): WorkflowActor {
  const capabilities: ConsultingCapability[] =
    persona === 'analyst'
      ? ['author']
      : persona === 'reviewer'
        ? ['review']
        : persona === 'publisher'
          ? ['publish']
          : persona.startsWith('client-')
            ? ['client']
            : [];
  return {
    id: `development-${persona}`,
    kind: 'human',
    grants:
      persona === 'client-a'
        ? { [PROJECT_A]: capabilities }
        : persona === 'client-b'
          ? { [PROJECT_B]: capabilities }
          : { [PROJECT_A]: capabilities, [PROJECT_B]: capabilities },
  };
}
export class DevelopmentConsultingRepository implements ConsultingRepository {
  private records = new Map<string, ClientDeliverable>();
  private events: WorkflowAuditEvent[] = [];
  async listProjects() {
    return structuredClone(DEVELOPMENT_PROJECTS);
  }
  async listDeliverables(projectId: string) {
    return structuredClone(
      [...this.records.values()].filter((d) => d.projectId === projectId),
    );
  }
  async get(id: string) {
    return structuredClone(this.records.get(id) ?? null);
  }
  async commit(
    d: ClientDeliverable,
    expected: number | null,
    event: WorkflowAuditEvent,
  ) {
    const prior = this.records.get(d.id);
    if ((prior?.version ?? null) !== expected)
      throw new GisInputError('Versi berubah; muat ulang sebelum melanjutkan');
    if ((this.records.size >= 32 && !prior) || this.events.length >= 2000)
      throw new GisInputError('Batas ruang development tercapai');
    if (
      prior &&
      (d.projectId !== prior.projectId ||
        d.createdBy !== prior.createdBy ||
        prior.revisions.some(
          (r, i) => JSON.stringify(r) !== JSON.stringify(d.revisions[i]),
        ) ||
        prior.reviews.some(
          (r, i) => JSON.stringify(r) !== JSON.stringify(d.reviews[i]),
        ) ||
        prior.publications.some(
          (r, i) => JSON.stringify(r) !== JSON.stringify(d.publications[i]),
        ))
    )
      throw new GisInputError(
        'Bukti revisi/review/publikasi bersifat immutable',
      );
    if (
      new TextEncoder().encode(
        JSON.stringify(
          [...this.records.values()].filter((r) => r.id !== d.id).concat(d),
        ),
      ).length >
      2 * 1024 * 1024
    )
      throw new GisInputError('Batas 2 MiB ruang development tercapai');
    this.records.set(d.id, structuredClone(d));
    this.events.push(structuredClone(event));
  }
  async audit(projectId: string) {
    return structuredClone(
      this.events.filter((e) => e.projectId === projectId),
    );
  }
}
interface Session {
  repo: DevelopmentConsultingRepository;
  persona: Persona;
  expiresAt: number;
}
const key = Symbol.for('p4i.consulting.development.v1');
const globals = globalThis as typeof globalThis & {
  [key]?: Map<string, Session>;
};
const sessions = (globals[key] ??= new Map<string, Session>());
export function consultingSession(request: Request) {
  if (!demoEnabled(process.env))
    throw new GisPermissionError(
      'Workflow deliverable belum tersedia di production. Aktifkan development DEMO untuk ruang simulasi terisolasi.',
    );
  for (const [key, s] of sessions)
    if (s.expiresAt < Date.now()) sessions.delete(key);
  let id = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('p4i-consulting='))
    ?.slice(15);
  let session = id ? sessions.get(id) : undefined;
  if (!session) {
    if (sessions.size >= 32)
      throw new GisInputError('Kapasitas ruang development tercapai');
    id = randomUUID();
    session = {
      repo: new DevelopmentConsultingRepository(),
      persona: 'analyst',
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    };
    sessions.set(id, session);
  }
  const current = session;
  return {
    session: current,
    actor: developmentActor(current.persona),
    attach(response: NextResponse) {
      response.cookies.set('p4i-consulting', id!, {
        httpOnly: true,
        sameSite: 'strict',
        secure:
          request.headers.get('origin')?.startsWith('https://') ??
          new URL(request.url).protocol === 'https:',
        path: '/',
        maxAge: 7200,
      });
      return response;
    },
  };
}
