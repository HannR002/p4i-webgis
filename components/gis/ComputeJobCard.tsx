'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ComputeJob } from '../../lib/gis/computeContracts';
import {
  parseComputeJob,
  draftComputeReport,
} from '../../lib/gis/computeValidation';
import { applyComputeJob } from '../../lib/gis/computeMap';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { record } from '../../lib/gis/validation';
export default function ComputeJobCard({ initial }: { initial: ComputeJob }) {
  const [job, setJob] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const base = useRef(JSON.stringify(useWorkspaceStore.getState().recipe));
  const permissions = useRef(
    JSON.stringify(useWorkspaceStore.getState().context),
  );
  async function request(action: string, current = job) {
    const r = await fetch('/api/gis/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        jobId: current.id,
        ...(action === 'approve'
          ? {
              requestHash: current.requestHash,
              ceiling: current.estimate.ceiling,
            }
          : {}),
      }),
    });
    const raw: unknown = await r.json();
    if (!r.ok)
      throw Error(
        record(raw) && typeof raw.error === 'string'
          ? raw.error
          : 'Permintaan job gagal',
      );
    const next = parseComputeJob(raw);
    if (next.id !== current.id || next.requestHash !== current.requestHash)
      throw Error('Identitas job berubah');
    setJob(next);
    return next;
  }
  function apply(next: ComputeJob) {
    const s = useWorkspaceStore.getState();
    if (JSON.stringify(s.context) !== permissions.current)
      throw Error('Izin berubah; muat ulang hasil dengan otorisasi terkini.');
    s.replace(
      applyComputeJob(
        s.recipe,
        next,
        s.catalog,
        s.context,
        s.mode === 'demo' ? 'demo' : 'unavailable',
      ),
      'Hasil komputasi eksperimental',
      s.recipe,
    );
    base.current = JSON.stringify(useWorkspaceStore.getState().recipe);
    setNotice('Hasil diterapkan ke MapRecipe. Undo/Redo tersedia.');
  }
  async function act(action: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let next = await request(action);
      if (
        (action === 'approve' || action === 'retry') &&
        next.state === 'QUEUED'
      )
        next = await request('execute', next);
      if (next.state === 'COMPLETED' && action !== 'get') {
        if (
          JSON.stringify(useWorkspaceStore.getState().recipe) === base.current
        )
          apply(next);
        else
          setNotice(
            'Peta berubah saat job diproses. Tinjau hasil lalu terapkan secara eksplisit.',
          );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Job gagal');
    } finally {
      setBusy(false);
    }
  }
  function download() {
    try {
      const blob = new Blob([draftComputeReport(job)], {
          type: 'text/markdown;charset=utf-8',
        }),
        url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `p4i-${job.id}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laporan belum tersedia');
    }
  }
  return (
    <section className="gis-compute-card" aria-label="Job komputasi GIS">
      <strong>
        {job.request.configuration?.name ?? job.request.operation.tool}
      </strong>
      <p role="status">
        <span className="gis-tag">{job.state}</span> · Percobaan {job.attempt}/3
      </p>
      <p className="gis-muted">
        Development · penyimpanan job sementara 30 menit; bukan antrean
        produksi.
      </p>
      <dl>
        <dt>Kebijakan</dt>
        <dd>{job.estimate.costClass}</dd>
        <dt>Biaya eksternal</dt>
        <dd>
          {job.estimate.monetaryCost === 'UNKNOWN'
            ? 'UNKNOWN · belum dapat dijalankan'
            : 'Tidak ada panggilan berbayar lokal; biaya hosting tidak dihitung'}
        </dd>
        <dt>Batas permintaan</dt>
        <dd>
          {job.estimate.ceiling.cells} sel · ≤
          {job.estimate.ceiling.providerCalls} sampling provider ·{' '}
          {job.estimate.ceiling.durationMs / 1000} detik · AOI ≤
          {job.estimate.ceiling.aoiSquareMetres.toFixed(0)} m²
        </dd>
      </dl>
      <p>{job.estimate.reason}</p>
      {job.state === 'AWAITING_APPROVAL' && (
        <div className="gis-actions">
          <button
            disabled={busy || !job.estimate.adapterAvailable}
            onClick={() => void act('approve')}
          >
            Setujui batas & jalankan
          </button>
          <button disabled={busy} onClick={() => void act('reject')}>
            Tolak job
          </button>
        </div>
      )}
      {['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'].includes(job.state) && (
        <div className="gis-actions">
          {job.state === 'QUEUED' && (
            <button disabled={busy} onClick={() => void act('execute')}>
              Jalankan job disetujui
            </button>
          )}
          <button onClick={() => void act('cancel')}>Batalkan job</button>
          <button disabled={busy} onClick={() => void act('get')}>
            Perbarui status
          </button>
        </div>
      )}
      {['FAILED', 'CANCELLED'].includes(job.state) && job.attempt < 3 && (
        <button disabled={busy} onClick={() => void act('retry')}>
          Coba ulang (persetujuan baru bila perlu)
        </button>
      )}
      {job.error && <p role="alert">{job.error}</p>}
      {job.result && (
        <>
          <p>
            <strong>
              {job.result.artifact.demo ? 'DEMO' : 'INPUT PENGGUNA'} ·
              EKSPERIMENTAL
            </strong>
          </p>
          <p>{job.result.artifact.summary}</p>
          <p className="gis-muted">{job.result.artifact.provenance}</p>
          <details>
            <summary>Nilai hasil, NoData dan provenance</summary>
            <pre tabIndex={0} aria-label="Nilai hasil komputasi JSON">
              {JSON.stringify(
                { values: job.result.values, raster: job.result.raster },
                null,
                2,
              )}
            </pre>
          </details>
          <ul>
            {job.result.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="gis-actions">
            <button
              onClick={() => {
                try {
                  apply(job);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Penerapan gagal');
                }
              }}
            >
              Terapkan hasil ke peta
            </button>
            <button onClick={download}>Unduh laporan draft (.md)</button>
            <Link href="/spatial/consulting">Siapkan deliverable klien</Link>
          </div>
        </>
      )}
      <details>
        <summary>Snapshot operasi, konfigurasi & sumber</summary>
        <pre tabIndex={0} aria-label="Snapshot permintaan komputasi JSON">
          {JSON.stringify(job.request, null, 2)}
        </pre>
      </details>
      <details>
        <summary>Jejak job & penggunaan</summary>
        <p className="gis-muted">{job.id}</p>
        <p className="gis-muted">SHA-256: {job.requestHash}</p>
        <ol>
          {job.history.map((h, i) => (
            <li key={i}>
              {h.state} · {h.at}
            </li>
          ))}
        </ol>
        <pre tabIndex={0} aria-label="Catatan penggunaan komputasi JSON">
          {JSON.stringify(job.usage, null, 2)}
        </pre>
      </details>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
