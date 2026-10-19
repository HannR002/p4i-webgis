'use client';
import { useEffect, useRef, useState } from 'react';
import { saveLocalWorkspaceDraft } from '../../lib/gis/workspaceDraft';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  parseVectorDocument,
  vectorLayerFingerprint,
  type VectorLayerSummary,
  type VectorProject,
  type SaveVectorLayer,
} from '../../lib/gis/vectorPersistence';
import type { SketchLayer } from '../../lib/gis/vectorEditing';
const endpoint = '/api/gis/vector-storage';
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      response.status === 409
        ? 'Konflik revisi. Edit lokal tetap utuh; ekspor atau simpan draft sebelum muat ulang.'
        : (data.error ?? 'Penyimpanan tidak tersedia'),
    );
  return data;
}
export default function VectorProjectStorage({
  layer,
}: {
  layer: SketchLayer | undefined;
}) {
  const s = useWorkspaceStore(),
    binding = s.vectorProjectBinding;
  const [available, setAvailable] = useState(false),
    [projects, setProjects] = useState<VectorProject[]>([]),
    [projectId, setProjectId] = useState(''),
    [layers, setLayers] = useState<VectorLayerSummary[]>([]),
    [layerId, setLayerId] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Penyimpanan proyek belum tersedia; draft lokal tetap tersedia.',
    ),
    [failure, setFailure] = useState(false);
  const attempt = useRef<{
    fingerprint: string;
    input: SaveVectorLayer;
  } | null>(null);
  const current = binding && binding.layer.id === layer?.id ? binding : null;
  const dirty =
    !!layer &&
    (!current ||
      vectorLayerFingerprint(current.layer) !== vectorLayerFingerprint(layer));
  useEffect(() => {
    let cancelled = false;
    request(endpoint)
      .then((data) => {
        if (cancelled) return;
        setAvailable(data.available === true);
        setProjects(data.projects ?? []);
        if (data.available)
          setMessage(
            'PostGIS lokal · data sintetis · belum diverifikasi pada Supabase staging.',
          );
      })
      .catch(() => {
        if (!cancelled) {
          setFailure(true);
          setMessage(
            'Backend proyek tidak tersedia atau akses ditolak. Editor lokal tetap dapat digunakan.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!available || !projectId) return;
    let cancelled = false;
    request(
      `${endpoint}?operation=layers&projectId=${encodeURIComponent(projectId)}`,
    )
      .then((data) => {
        if (!cancelled) setLayers(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setFailure(true);
          setMessage(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [available, projectId]);
  async function open(id = layerId) {
    if (!id || !projectId || busy) return;
    if (
      !window.confirm(
        'Buka data proyek dan ganti layer vektor sesi? Ekspor/simpan draft lokal dahulu. Undo lokal dapat memulihkan sesi sebelumnya.',
      )
    )
      return;
    const state = useWorkspaceStore.getState(),
      expected = state.recipe,
      epoch = state.vectorEpoch;
    setBusy(true);
    setFailure(false);
    try {
      const doc = parseVectorDocument(
        await request(
          `${endpoint}?operation=load&projectId=${encodeURIComponent(projectId)}&layerId=${encodeURIComponent(id)}`,
        ),
      );
      const latest = useWorkspaceStore.getState();
      if (latest.recipe !== expected || latest.vectorEpoch !== epoch)
        throw Error('Peta berubah saat membuka proyek; hasil lama diabaikan.');
      latest.replace(
        { ...latest.recipe, sketchLayers: [doc.layer] },
        'Buka layer dari proyek',
        expected,
      );
      latest.setVectorProjectBinding(doc);
      latest.setVectorEditor({
        vectorLayerId: doc.layer.id,
        selectedVectorIds: [],
        vectorMode: 'select',
      });
      attempt.current = null;
      setMessage(
        `Revisi ${doc.revision} dibuka. ${doc.canEdit ? 'Edit diizinkan.' : 'Akses baca saja; tidak dapat menyimpan.'}`,
      );
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'Buka gagal');
    } finally {
      setBusy(false);
    }
  }
  async function save(archive = false) {
    const state = useWorkspaceStore.getState(),
      selected = state.recipe.sketchLayers?.find((l) => l.id === layer?.id);
    if (!selected || busy) return;
    if (state.vectorEdit || state.vectorVertices.length) {
      setFailure(true);
      setMessage('Selesaikan atau batalkan gambar/edit dahulu.');
      return;
    }
    const targetProject = current?.projectId ?? projectId;
    if (
      !targetProject ||
      !projects.some((p) => p.id === targetProject && p.canEdit)
    ) {
      setFailure(true);
      setMessage('Akses edit proyek diperlukan');
      return;
    }
    if (
      !window.confirm(
        archive
          ? 'Arsipkan layer proyek? Ini revisi server baru; Undo lokal tidak membatalkan penyimpanan server.'
          : `Simpan perubahan ke ${projects.find((p) => p.id === targetProject)?.title} (${projects.find((p) => p.id === targetProject)?.accessTier === 'public' ? 'publik' : 'terbatas'}) di PostGIS lokal? Ini tindakan persisten; Undo hanya mengubah sesi lokal.`,
      )
    )
      return;
    const base = {
      projectId: targetProject,
      layerId: current?.id ?? null,
      expectedRevision: current?.revision ?? 0,
      layer: selected,
      archive,
    };
    const fingerprint = JSON.stringify(base);
    const input =
      attempt.current?.fingerprint === fingerprint
        ? attempt.current.input
        : { ...base, requestId: crypto.randomUUID() };
    attempt.current = { fingerprint, input };
    setBusy(true);
    setFailure(false);
    setMessage('Menyimpan transaksi ke PostGIS…');
    try {
      const doc = parseVectorDocument(
        await request(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      );
      // A completed save must not attach an old project identity to a newer/replaced working set.
      const latest = useWorkspaceStore.getState();
      const unchanged =
        latest.recipe.sketchLayers === state.recipe.sketchLayers &&
        latest.vectorProjectBinding === state.vectorProjectBinding;
      if (unchanged) latest.setVectorProjectBinding(doc);
      attempt.current = null;
      setMessage(
        unchanged
          ? `Tersimpan revisi ${doc.revision}${archive ? ' · layer diarsipkan' : ''}. Undo lokal tidak mengubah revisi server.`
          : `Tersimpan revisi ${doc.revision} di server, tetapi sesi berubah saat menyimpan. Edit lokal dipertahankan; simpan draft/ekspor lalu buka ulang proyek sebelum menyimpan lagi.`,
      );

      if (projectId === doc.projectId)
        setLayers(
          await request(
            `${endpoint}?operation=layers&projectId=${encodeURIComponent(projectId)}`,
          ),
        );
      setLayerId(archive ? '' : doc.id);
    } catch (e) {
      setFailure(true);
      setMessage(
        e instanceof Error
          ? e.message
          : 'Simpan gagal; edit lokal dipertahankan',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="gis-vector-storage">
      <summary>
        Penyimpanan proyek · {available ? 'PostGIS lokal' : 'belum tersedia'}
      </summary>
      <p className="gis-muted">
        Simpan draft lokal memakai tombol Simpan draft di header. Penyimpanan
        proyek adalah tindakan terpisah; tidak otomatis membagikan atau
        menerbitkan data.
      </p>
      <button
        onClick={() => {
          try {
            const state = useWorkspaceStore.getState();
            saveLocalWorkspaceDraft(
              state.recipe,
              !!state.vectorEdit || !!state.vectorVertices.length,
              localStorage,
            );
            setFailure(false);
            setMessage(
              'Draft lokal disimpan di browser; server tidak berubah.',
            );
          } catch (e) {
            setFailure(true);
            setMessage(e instanceof Error ? e.message : 'Draft lokal gagal');
          }
        }}
      >
        Simpan draft lokal
      </button>
      <p role={failure ? 'alert' : 'status'}>{message}</p>
      {available && (
        <>
          <label>
            Proyek penyimpanan
            <select
              aria-label="Proyek penyimpanan"
              value={projectId}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value !== projectId) {
                  setLayers([]);
                  setLayerId('');
                  setProjectId(e.target.value);
                }
              }}
            >
              <option value="">Pilih proyek berwenang</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · {p.canEdit ? 'editor' : 'baca saja'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Layer proyek
            <select
              aria-label="Layer proyek"
              value={layerId}
              disabled={busy}
              onChange={(e) => setLayerId(e.target.value)}
            >
              <option value="">Pilih layer tersimpan</option>
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · r{l.revision} · {l.featureCount} objek
                </option>
              ))}
            </select>
          </label>
          <p>
            {layer
              ? dirty
                ? 'Perubahan lokal belum tersimpan ke proyek.'
                : `Sesuai revisi tersimpan ${current?.revision}.`
              : 'Buat atau buka layer terlebih dahulu.'}
          </p>
          <div className="gis-config-actions">
            <button
              disabled={
                busy ||
                !layer ||
                !!current?.archived ||
                !(current
                  ? current.canEdit
                  : projects.find((p) => p.id === projectId)?.canEdit)
              }
              onClick={() => void save()}
            >
              Simpan ke Proyek
            </button>
            <button disabled={busy || !layerId} onClick={() => void open()}>
              Buka dari Proyek
            </button>
            <button
              disabled={
                busy ||
                !current ||
                current.archived ||
                current.projectId !== projectId
              }
              onClick={() => void open(current!.id)}
            >
              Muat ulang perubahan
            </button>
            <button
              disabled={busy || !current || !dirty}
              onClick={() => {
                if (
                  window.confirm(
                    'Batalkan perubahan lokal dan pulihkan snapshot terakhir yang dibuka/disimpan? Server tidak berubah.',
                  )
                ) {
                  try {
                    s.cancelVectorEdit();
                    s.replace(
                      {
                        ...s.recipe,
                        sketchLayers: s.recipe.sketchLayers?.map((l) =>
                          l.id === current!.layer.id ? current!.layer : l,
                        ) ?? [current!.layer],
                      },
                      'Batalkan perubahan lokal',
                      undefined,
                      'edit',
                    );
                  } catch (e) {
                    setFailure(true);
                    setMessage(
                      e instanceof Error ? e.message : 'Pembatalan gagal',
                    );
                  }
                }
              }}
            >
              Batalkan perubahan lokal
            </button>
            <button
              disabled={busy || !current?.canEdit || current.archived}
              onClick={() => void save(true)}
            >
              Arsipkan layer proyek
            </button>
          </div>
          <p className="gis-muted">
            Pembukaan/pemulihan mengganti layer vektor sesi, bukan layer
            katalog/raster. Simpan ke proyek menyimpan layer edit aktif. Tidak
            ada auto-save.
          </p>
        </>
      )}
    </details>
  );
}
