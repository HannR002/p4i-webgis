'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  ConsultingProject,
  ClientDeliverable,
  DeliverableContent,
  PublishedClientDeliverable,
  ConsultingCapability,
  ReviewChecklist,
} from '../../lib/consulting/contracts';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { emptyRecipe } from '../../lib/gis/catalog';
import { useGisCatalog } from '../gis/useGisCatalog';
import { record } from '../../lib/gis/validation';
import DeliverableMapPreview from './DeliverableMapPreview';
type Detail = ClientDeliverable | PublishedClientDeliverable;
interface CatalogResponse {
  mode: string;
  persona: string;
  personas: { id: string; label: string }[];
  grants: Record<string, ConsultingCapability[]>;
  projects: ConsultingProject[];
  deliverables: {
    id: string;
    projectId: string;
    title: string;
    status: string;
    revision: number;
  }[];
}
const defaultContent = (): DeliverableContent => ({
  title: 'Draft kajian GIS',
  summary:
    'Ringkasan belum disusun. Tinjau snapshot analisis dan isi interpretasi yang sesuai.',
  analystNotes: '',
  assumptions: 'Input DEMO/eksperimental; asumsi harus ditinjau oleh analis.',
  limitations:
    'Data sintetik atau input pengguna. Tidak untuk keputusan operasional. Tidak menyatakan validasi metodologi.',
  recipe: structuredClone(useWorkspaceStore.getState().recipe ?? emptyRecipe()),
});
const labels = {
  title: 'Judul laporan',
  summary: 'Ringkasan analisis',
  analystNotes: 'Catatan analis (internal)',
  assumptions: 'Asumsi analisis',
  limitations: 'Keterbatasan',
};
export default function ConsultingWorkspace() {
  useGisCatalog();
  const router = useRouter();
  const detailSequence = useRef(0);
  const [data, setData] = useState<CatalogResponse | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [project, setProject] = useState(''),
    [form, setForm] = useState<DeliverableContent>(defaultContent),
    [comments, setComments] = useState(''),
    [jobId, setJobId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [origin, setOrigin] = useState<'human' | 'ai'>('human'),
    [historyRevision, setHistoryRevision] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<ReviewChecklist>({
    completeness: false,
    interpretation: false,
    authorizedRelease: false,
    professionalQuality: false,
  });
  async function read() {
    const r = await fetch('/api/consulting', { cache: 'no-store' });
    const body = await r.json();
    if (!r.ok) throw Error(body.error ?? 'Workflow tidak tersedia');
    setData(body);
    setProject((p) =>
      body.projects.some((v: ConsultingProject) => v.id === p)
        ? p
        : (body.projects[0]?.id ?? ''),
    );
    return body as CatalogResponse;
  }
  useEffect(() => {
    let active = true;
    fetch('/api/consulting', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error ?? 'Workflow tidak tersedia');
        if (active) {
          setData(body);
          setProject(body.projects[0]?.id ?? '');
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function fetchDetail(id: string) {
    const token = ++detailSequence.current;
    const r = await fetch(`/api/consulting?id=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error ?? 'Deliverable tidak tersedia');
    if (token !== detailSequence.current) return;
    setDetail(b.detail);
    setOrigin(
      ('revision' in b.detail ? b.detail.revision : b.detail.revisions.at(-1))
        .origin,
    );
    setHistoryRevision(null);
    setChecklist({
      completeness: false,
      interpretation: false,
      authorizedRelease: false,
      professionalQuality: false,
    });
    setComments('');
    setForm(
      'revision' in b.detail
        ? b.detail.revision.content
        : b.detail.revisions.at(-1).content,
    );
    setProject(b.detail.projectId);
    return b.detail as Detail;
  }
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (body.action === 'persona') {
      detailSequence.current++;
      setDetail(null);
      setHistoryRevision(null);
      setForm(defaultContent());
    }
    try {
      const r = await fetch('/api/consulting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error ?? 'Aksi gagal');
      await read();
      if (b.detail) {
        await fetchDetail(b.detail.id);
        setNotice(
          `Tersimpan di ruang DEMO: ${b.detail.status} · revisi ${b.detail.currentRevision}`,
        );
      } else {
        setDetail(null);
        setHistoryRevision(null);
        setForm(defaultContent());
      }
      return b;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aksi gagal');
    } finally {
      setBusy(false);
    }
  }
  async function download(format: 'pdf' | 'json') {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/consulting/download?id=${encodeURIComponent(detail.id)}&format=${format}${historyRevision ? `&revision=${historyRevision}` : ''}`,
      );
      if (!r.ok) {
        const b = await r.json();
        throw Error(b.error ?? 'Unduhan ditolak');
      }
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `p4i-deliverable-r${revision?.number ?? 1}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Unduhan selesai dari snapshot yang diotorisasi.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unduhan gagal');
    } finally {
      setBusy(false);
    }
  }
  const caps = data?.grants[project] ?? [],
    staffDetail = detail && 'revisions' in detail ? detail : null;
  const revision = detail
    ? 'revision' in detail
      ? detail.revision
      : (detail.revisions.find((r) => r.number === historyRevision) ??
        detail.revisions.at(-1)!)
    : null;
  const staleRevision =
    !!historyRevision && historyRevision !== staffDetail?.currentRevision;
  const canEdit =
    caps.includes('author') &&
    (!staffDetail ||
      ['DRAFT', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED'].includes(
        staffDetail.status,
      )) &&
    !staleRevision;
  function field(key: keyof Omit<DeliverableContent, 'recipe'>, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function openMap() {
    if (!revision) return;
    try {
      const s = useWorkspaceStore.getState();
      s.replace(revision.content.recipe, 'Snapshot deliverable', s.recipe);
      router.push('/spatial/viewer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot peta tidak tersedia');
    }
  }
  async function aiDraft() {
    setBusy(true);
    setError(null);
    try {
      const s = useWorkspaceStore.getState();
      const r = await fetch('/api/gis/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Siapkan draft deliverable klien',
          recipe: form.recipe,
          configurations: [],
        }),
      });
      const b = await r.json();
      if (!r.ok || !record(b) || !Array.isArray(b.results))
        throw Error(
          record(b) && typeof b.error === 'string'
            ? b.error
            : 'Copilot tidak tersedia',
        );
      const summary = b.results.find(
        (v) => v.tool === 'prepareClientDeliverableDraft',
      )?.summary;
      if (typeof summary !== 'string')
        throw Error('Planner belum menyediakan draft');
      setForm((f) => ({ ...f, summary }));
      setOrigin('ai');
      setNotice(
        'Draft Copilot DEMO disiapkan; tinjau lalu simpan sebagai DRAFT.',
      );
      if (s.mode !== 'demo')
        setNotice('Tinjau ketersediaan provider sebelum menyimpan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft gagal');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="consulting-page">
      <header>
        <p className="gis-eyebrow">P4I CONSULTANT · CLIENT DELIVERABLES</p>
        <h1>Proyek & deliverable GIS</h1>
        <p>
          Siapkan laporan, tinjau kualitas profesional, dan atur akses klien
          pada revisi yang disetujui.
        </p>
      </header>
      <div className="consulting-banner" role="note">
        <strong>RUANG DEVELOPMENT · DEMO / EKSPERIMENTAL</strong>
        <p>
          Semua identitas, proyek dan rilis di halaman ini adalah simulasi
          terisolasi. Penyimpanan sementara 2 jam; restart menghapus ruang ini.
          Tidak ada publikasi klien nyata atau validasi metodologi ilmiah.
        </p>
      </div>
      {error && (
        <p className="consulting-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="consulting-notice" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Memuat workflow…</p>}
      {data && (
        <>
          <div className="consulting-controls">
            <label>
              Peran simulasi
              <select
                aria-label="Peran simulasi"
                value={data.persona}
                disabled={busy}
                onChange={(e) =>
                  void action({ action: 'persona', persona: e.target.value })
                }
              >
                {data.personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Proyek
              <select
                aria-label="Proyek konsultansi"
                value={project}
                disabled={busy}
                onChange={(e) => {
                  setProject(e.target.value);
                  setDetail(null);
                  setHistoryRevision(null);
                }}
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            {caps.includes('author') && (
              <button
                disabled={busy}
                onClick={() => {
                  setDetail(null);
                  setForm(defaultContent());
                  setOrigin('human');
                  setHistoryRevision(null);
                }}
              >
                Draft baru dari peta sesi
              </button>
            )}
            <Link href="/spatial/viewer">Map Workspace</Link>
          </div>
          {!data.projects.length && (
            <p className="gis-empty">
              Tidak ada grant proyek. Peran admin tidak otomatis menjadi
              reviewer/publisher.
            </p>
          )}
          <div className="consulting-grid">
            <aside className="consulting-card">
              <h2>Deliverable proyek</h2>
              <p>{data.projects.find((p) => p.id === project)?.clientLabel}</p>
              {data.deliverables
                .filter((d) => d.projectId === project)
                .map((d) => (
                  <button
                    className="consulting-list-item"
                    key={d.id}
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      void fetchDetail(d.id).catch((e) => setError(e.message));
                    }}
                  >
                    <strong>{d.title}</strong>
                    <span>
                      {d.status} · revisi {d.revision}
                    </span>
                  </button>
                ))}
              {!data.deliverables.some((d) => d.projectId === project) && (
                <p>
                  Belum ada deliverable yang dapat diakses.
                  {caps.includes('client')
                    ? ' Hanya rilis terotorisasi ditampilkan.'
                    : ''}
                </p>
              )}
            </aside>
            <section
              className="consulting-card"
              aria-label="Workspace deliverable"
            >
              {staffDetail && (
                <p role="status">
                  <strong>{staffDetail.status}</strong> · revisi{' '}
                  {staffDetail.currentRevision} · versi {staffDetail.version}
                </p>
              )}
              {detail && 'publication' in detail && (
                <p role="status">
                  <strong>PUBLISHED · SIMULASI</strong> · revisi{' '}
                  {detail.revision.number}. Rilis nyata: tidak.
                </p>
              )}
              {canEdit && (
                <section>
                  <h2>{detail ? 'Revisi laporan' : 'Draft laporan baru'}</h2>
                  <p>
                    Asal draft:{' '}
                    {origin === 'ai' ? 'AI GIS Copilot DEMO' : 'Analis'}.
                    Perubahan pada laporan yang disetujui membuat revisi DRAFT
                    baru.
                  </p>
                  {(
                    [
                      'title',
                      'summary',
                      'analystNotes',
                      'assumptions',
                      'limitations',
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {
                        {
                          title: 'Judul laporan',
                          summary: 'Ringkasan analisis',
                          analystNotes: 'Catatan analis (internal)',
                          assumptions: 'Asumsi analisis',
                          limitations: 'Keterbatasan',
                        }[key]
                      }
                      {key === 'title' ? (
                        <input
                          aria-label={labels[key]}
                          value={form[key]}
                          maxLength={160}
                          onChange={(e) => field(key, e.target.value)}
                        />
                      ) : (
                        <textarea
                          aria-label={labels[key]}
                          value={form[key]}
                          rows={key === 'summary' ? 5 : 3}
                          maxLength={
                            key === 'summary' || key === 'analystNotes'
                              ? 5000
                              : 3000
                          }
                          onChange={(e) => field(key, e.target.value)}
                        />
                      )}
                    </label>
                  ))}
                  <details>
                    <summary>Snapshot peta, konfigurasi dan provenance</summary>
                    <pre tabIndex={0} aria-label="Snapshot draft JSON">
                      {JSON.stringify(form.recipe, null, 2)}
                    </pre>
                  </details>
                  <div className="consulting-actions">
                    <button
                      disabled={busy || !project}
                      onClick={() =>
                        void action(
                          detail
                            ? {
                                action: 'revise',
                                id: detail.id,
                                version: staffDetail!.version,
                                content: form,
                                origin,
                              }
                            : {
                                action: 'create',
                                projectId: project,
                                content: form,
                                origin,
                              },
                        )
                      }
                    >
                      {detail ? 'Simpan revisi baru' : 'Simpan draft'}
                    </button>
                    <button disabled={busy} onClick={() => void aiDraft()}>
                      Siapkan draft dengan Copilot DEMO
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          recipe: structuredClone(
                            useWorkspaceStore.getState().recipe,
                          ),
                        }));
                        setNotice(
                          'Peta sesi dilampirkan; simpan revisi untuk merekamnya.',
                        );
                      }}
                    >
                      Lampirkan peta sesi & konfigurasi
                    </button>
                  </div>
                </section>
              )}
              {staffDetail &&
                caps.includes('author') &&
                ['DRAFT', 'ANALYSIS_RUNNING'].includes(staffDetail.status) && (
                  <section>
                    <h2>Analisis terkait</h2>
                    <label>
                      Job komputasi Phase 06
                      <input
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                        placeholder="compute-…"
                      />
                    </label>
                    <button
                      disabled={busy || !jobId}
                      onClick={() =>
                        void action({
                          action: 'attachAnalysis',
                          id: staffDetail.id,
                          version: staffDetail.version,
                          jobId,
                        })
                      }
                    >
                      Lampirkan/perbarui job terotorisasi
                    </button>
                    <p>
                      Hanya job milik sesi/pengguna yang sama. Hasil harus
                      berasal dari provider; tidak menerima angka statistik
                      manual sebagai hasil terverifikasi.
                    </p>
                    {staffDetail.status === 'DRAFT' && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action({
                            action: 'submit',
                            id: staffDetail.id,
                            version: staffDetail.version,
                          })
                        }
                      >
                        Kirim untuk review
                      </button>
                    )}
                  </section>
                )}
              {revision && (
                <section>
                  <h2>Preview laporan · revisi {revision.number}</h2>
                  {staffDetail && (
                    <label>
                      Riwayat revisi
                      <select
                        aria-label="Riwayat revisi"
                        value={historyRevision ?? staffDetail.currentRevision}
                        onChange={(e) =>
                          setHistoryRevision(Number(e.target.value))
                        }
                      >
                        {staffDetail.revisions.map((r) => (
                          <option key={r.number} value={r.number}>
                            Revisi {r.number} · {r.createdAt}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <h3>{revision.content.title}</h3>
                  <p>{revision.content.summary}</p>
                  <DeliverableMapPreview content={revision.content} />
                  <button disabled={busy} onClick={openMap}>
                    Buka snapshot di Map Workspace
                  </button>
                  <h3>Asumsi & keterbatasan</h3>
                  <p>{revision.content.assumptions}</p>
                  <p>{revision.content.limitations}</p>
                  {staffDetail && (
                    <>
                      <h3>Catatan analis</h3>
                      <p>
                        {revision.content.analystNotes ||
                          'Tidak ada catatan internal.'}
                      </p>
                    </>
                  )}
                  <details>
                    <summary>
                      Konfigurasi, bobot, sumber dan hasil tersimpan
                    </summary>
                    <pre tabIndex={0} aria-label="Bukti laporan JSON">
                      {JSON.stringify(
                        {
                          datasetSources: revision.content.datasetSources ?? [],
                          configuration:
                            revision.content.recipe.analysisConfiguration ??
                            null,
                          results:
                            revision.content.recipe.analysisResults ?? [],
                          verifiedRun: revision.analysisRun,
                          verifiedResult: revision.analysisResult,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                  <p className="consulting-hash">
                    SHA-256 revisi review: {revision.contentHash}
                  </p>
                  {detail && 'releasedContentHash' in detail && (
                    <p className="consulting-hash">
                      Hash konten rilis (catatan internal disamarkan):{' '}
                      {detail.releasedContentHash}
                    </p>
                  )}
                  <div className="consulting-actions">
                    <button
                      disabled={busy}
                      onClick={() => void download('pdf')}
                    >
                      Unduh laporan PDF
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void download('json')}
                    >
                      Unduh bukti JSON
                    </button>
                  </div>
                </section>
              )}
              {staffDetail &&
                !staleRevision &&
                caps.includes('review') &&
                staffDetail.status === 'READY_FOR_REVIEW' && (
                  <section>
                    <h2>Review deliverable</h2>
                    <p>
                      Penilaian kelengkapan, interpretasi, otorisasi rilis dan
                      kualitas profesional; tidak menyatakan metodologi
                      tervalidasi ilmiah.
                    </p>
                    {(Object.keys(checklist) as (keyof ReviewChecklist)[]).map(
                      (key) => (
                        <label className="consulting-check" key={key}>
                          <input
                            type="checkbox"
                            checked={checklist[key]}
                            onChange={(e) =>
                              setChecklist((c) => ({
                                ...c,
                                [key]: e.target.checked,
                              }))
                            }
                          />
                          {
                            {
                              completeness: 'Kelengkapan laporan',
                              interpretation: 'Interpretasi sesuai tujuan',
                              authorizedRelease:
                                'Sumber dan isi diizinkan untuk rilis',
                              professionalQuality:
                                'Kualitas profesional memadai',
                            }[key]
                          }
                        </label>
                      ),
                    )}
                    <label>
                      Komentar reviewer
                      <textarea
                        value={comments}
                        maxLength={3000}
                        onChange={(e) => setComments(e.target.value)}
                      />
                    </label>
                    <div className="consulting-actions">
                      {(['REQUEST_CHANGES', 'REJECT', 'APPROVE'] as const).map(
                        (decision) => (
                          <button
                            key={decision}
                            disabled={
                              busy ||
                              !comments.trim() ||
                              (decision === 'APPROVE' &&
                                !Object.values(checklist).every(Boolean))
                            }
                            onClick={() =>
                              void action({
                                action: 'review',
                                id: staffDetail.id,
                                version: staffDetail.version,
                                hash: revision!.contentHash,
                                decision,
                                comments,
                                checklist,
                              })
                            }
                          >
                            {
                              {
                                REQUEST_CHANGES: 'Minta revisi',
                                REJECT: 'Tolak deliverable',
                                APPROVE: 'Setujui revisi untuk rilis',
                              }[decision]
                            }
                          </button>
                        ),
                      )}
                    </div>
                  </section>
                )}
              {staffDetail &&
                caps.includes('publish') &&
                staffDetail.status === 'APPROVED' &&
                !staleRevision && (
                  <section>
                    <h2>Kelayakan rilis</h2>
                    <p>
                      Revisi ini memiliki review profesional yang disetujui.
                      Rilis berikut hanya simulasi ke portal klien DEMO.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action({
                          action: 'publish',
                          id: staffDetail.id,
                          version: staffDetail.version,
                          hash: revision!.contentHash,
                        })
                      }
                    >
                      Simulasikan rilis ke klien DEMO
                    </button>
                  </section>
                )}
              {staffDetail && (
                <details>
                  <summary>Keputusan reviewer & riwayat rilis</summary>
                  {staffDetail.reviews.map((r) => (
                    <p key={r.id}>
                      Revisi {r.revision} · {r.decision} · {r.reviewerId} ·{' '}
                      {r.comments}
                    </p>
                  ))}
                  {staffDetail.publications.map((p) => (
                    <p key={p.id}>
                      Revisi {p.revision} · SIMULASI · {p.publishedAt} ·
                      official=false
                    </p>
                  ))}
                  {!staffDetail.reviews.length && (
                    <p>Belum ada keputusan reviewer.</p>
                  )}
                </details>
              )}
              {!canEdit && !revision && (
                <p>
                  Pilih deliverable yang tersedia untuk melihat snapshot yang
                  diotorisasi.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
