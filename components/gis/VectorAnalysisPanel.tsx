'use client';
import { useEffect, useRef, useState } from 'react';
import { applyMapAction } from '../../lib/gis/recipe';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  VECTOR_ANALYSIS_OPERATIONS,
  parseVectorAnalysisRequest,
  parseVectorAnalysisResult,
  type VectorAnalysisOperation,
  type VectorAnalysisRequest,
  type VectorAnalysisResult,
} from '../../lib/gis/vectorAnalysis';
import {
  parseVectorDocument,
  vectorLayerFingerprint,
  type VectorLayerDocument,
  type VectorLayerSummary,
  type VectorProject,
} from '../../lib/gis/vectorPersistence';
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: 'no-store', ...init });
  const v = await r.json();
  if (!r.ok) throw Error(v.error ?? 'Analisis tidak tersedia');
  return v;
}
const storage = '/api/gis/vector-storage';
export default function VectorAnalysisPanel() {
  const mapEpoch = useWorkspaceStore((s) => s.mapEpoch);
  // Replacement/history boundaries dispose estimates, source selection and requests
  // in every mount (Analysis tab and Copilot), including byte-identical recipes.
  return <VectorAnalysisSession key={mapEpoch} />;
}
function VectorAnalysisSession() {
  const s = useWorkspaceStore();
  const [projects, setProjects] = useState<VectorProject[]>([]),
    [project, setProject] = useState(''),
    [layers, setLayers] = useState<VectorLayerSummary[]>([]);
  const [source, setSource] = useState<VectorLayerDocument | null>(null),
    [target, setTarget] = useState<VectorLayerDocument | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]),
    [targetIds, setTargetIds] = useState<string[]>([]);
  const [operation, setOperation] = useState<VectorAnalysisOperation>('buffer'),
    [distance, setDistance] = useState(500),
    [attribute, setAttribute] = useState('group'),
    [unit, setUnit] = useState('m');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      'Pilih data tersimpan. Hasil dihitung oleh PostGIS lokal; sumber tidak berubah.',
    ),
    [failure, setFailure] = useState(false);
  const [estimate, setEstimate] = useState<{
    request: VectorAnalysisRequest;
    value: VectorAnalysisResult['estimate'];
  } | null>(null);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const result = s.vectorAnalysisResult;
  const binary = [
    'intersection',
    'union',
    'difference',
    'clip',
    'intersects',
    'within',
    'distance',
  ].includes(operation);
  useEffect(() => {
    let cancelled = false;
    api(storage)
      .then((v) => {
        if (!cancelled) {
          setProjects(
            (v.projects ?? []).filter((p: VectorProject) => p.canEdit),
          );
          if (!v.available)
            setMessage(
              'PostGIS lokal belum aktif. Penyimpanan staging dan produksi belum tersedia.',
            );
        }
      })
      .catch(() => {
        if (!cancelled)
          setMessage(
            'Akses backend tidak tersedia. Editor manual tetap tersedia.',
          );
      });
    return () => {
      cancelled = true;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (project)
      api(`${storage}?operation=layers&projectId=${project}`)
        .then((v) => {
          if (!cancelled) setLayers(v);
        })
        .catch(() => {
          if (!cancelled) setMessage('Daftar layer ditolak');
        });
    return () => {
      cancelled = true;
    };
  }, [project]);
  function invalidate() {
    setEstimate(null);
    setFailure(false);
  }
  async function load(id: string, which: 'source' | 'target') {
    invalidate();
    if (!id) {
      if (which === 'source') {
        setSource(null);
        setSourceIds([]);
      } else {
        setTarget(null);
        setTargetIds([]);
      }
      return;
    }
    setBusy(true);
    const turn = ++sequence.current;
    const active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    try {
      const doc = parseVectorDocument(
        await api(
          `${storage}?operation=load&projectId=${project}&layerId=${id}`,
          { signal: active.signal },
        ),
      );
      if (turn !== sequence.current || active.signal.aborted) return;
      if (which === 'source') {
        setSource(doc);
        setSourceIds(doc.features.slice(0, 20).map((f) => f.id));
      } else {
        setTarget(doc);
        setTargetIds(doc.features.slice(0, 20).map((f) => f.id));
      }
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'Gagal memuat');
    } finally {
      if (turn === sequence.current) setBusy(false);
    }
  }
  function useProposal() {
    try {
      const proposal = s.vectorAnalysisProposal,
        binding = s.vectorProjectBinding;
      if (
        !proposal ||
        !binding ||
        !binding.canEdit ||
        binding.layer.id !== proposal.layerId
      )
        throw Error(
          'Buka layer proyek yang sesuai dan dapat diedit terlebih dahulu.',
        );
      const local = s.recipe.sketchLayers?.find(
        (l) => l.id === proposal.layerId,
      );
      if (
        !local ||
        vectorLayerFingerprint(local) !== vectorLayerFingerprint(binding.layer)
      )
        throw Error(
          'Usulan memakai edit lokal yang belum tersimpan. Simpan/reload secara eksplisit sebelum analisis database.',
        );
      const ids = proposal.featureIds.map(
        (id) => binding.features.find((f) => f.localId === id)?.id,
      );
      if (ids.some((id) => !id))
        throw Error('Fitur belum mempunyai identitas database.');
      setProject(binding.projectId);
      setSource(binding);
      setSourceIds(ids as string[]);
      setOperation(proposal.operation);
      setDistance(proposal.parameters.distanceMetres ?? 500);
      setUnit(proposal.parameters.unit ?? 'm');
      setTarget(null);
      setTargetIds([]);
      invalidate();
      setMessage(
        'Usulan Copilot siap diperiksa. Estimasi dan eksekusi memeriksa izin serta revisi database kembali.',
      );
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'Usulan ditolak');
    }
  }
  function input(): VectorAnalysisRequest {
    return parseVectorAnalysisRequest({
      operation,
      projectId: project,
      source: source
        ? {
            layerId: source.id,
            revision: source.revision,
            featureIds: sourceIds,
          }
        : null,
      target:
        binary && target
          ? {
              layerId: target.id,
              revision: target.revision,
              featureIds: targetIds,
            }
          : null,
      parameters:
        operation === 'buffer'
          ? { distanceMetres: distance }
          : operation === 'dissolve'
            ? { attribute }
            : ['area', 'length', 'distance'].includes(operation)
              ? { unit }
              : {},
    });
  }
  async function run(preview: boolean) {
    const turn = ++sequence.current,
      active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    setBusy(true);
    setFailure(false);
    const before = useWorkspaceStore.getState();
    try {
      if (before.vectorEdit || before.vectorVertices.length)
        throw Error('Selesaikan/batalkan digitasi terlebih dahulu.');
      const request = input();
      if (
        !preview &&
        (!estimate ||
          JSON.stringify(estimate.request) !== JSON.stringify(request))
      )
        throw Error('Periksa estimasi input ini terlebih dahulu.');
      const raw = await api(
        `/api/gis/vector-analysis${preview ? '?preview=true' : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: active.signal,
        },
      );
      if (turn !== sequence.current || active.signal.aborted) return;
      const latest = useWorkspaceStore.getState();
      if (
        latest.recipe !== before.recipe ||
        latest.vectorEpoch !== before.vectorEpoch
      )
        throw Error(
          'Sesi berubah; hasil lama tidak diterapkan. Jalankan ulang.',
        );
      if (preview) {
        setEstimate({ request, value: raw });
        setMessage(
          'Estimasi server siap. Eksekusi mengulang pemeriksaan izin, revisi dan batas.',
        );
      } else {
        const checked = parseVectorAnalysisResult(raw);
        s.setVectorAnalysisResult(checked);
        setMessage(
          `Selesai: ${checked.layer.data.features.length} fitur hasil. ${checked.layer.data.features.length ? 'Pratinjau tersedia pada peta.' : 'Hasil kosong; tidak ada geometri buatan.'}`,
        );
      }
    } catch (e) {
      if (turn === sequence.current && !active.signal.aborted) {
        setFailure(true);
        setMessage(e instanceof Error ? e.message : 'Analisis gagal');
      }
    } finally {
      if (turn === sequence.current) setBusy(false);
    }
  }
  function copyResult() {
    try {
      if (!result || !result.layer.data.features.length) return;
      if (
        !window.confirm(
          'Salin hasil ke layer kerja baru? Penyimpanan proyek tetap memerlukan Simpan ke Proyek dan konfirmasi terpisah.',
        )
      )
        return;
      const next = applyMapAction(
        s.recipe,
        {
          tool: 'importVectorLayer',
          name: result.layer.name,
          collection: result.layer.data,
          wgs84: true,
        },
        s.catalog,
        s.context,
      );
      const layer = next.sketchLayers?.at(-1);
      if (layer) {
        layer.style = { ...result.layer.style };
        layer.opacity = result.layer.opacity;
      }
      s.replace(next, 'Salin hasil PostGIS ke layer baru', s.recipe, 'edit');
      s.setVectorProjectBinding(null);
      if (layer)
        s.setVectorEditor({
          vectorLayerId: layer.id,
          vectorMode: 'select',
          selectedVectorIds: [],
        });
      setMessage(
        'Hasil disalin ke editor. Buka tab Layer → Penyimpanan proyek → pilih target → Simpan ke Proyek. Undo hanya mengubah sesi lokal.',
      );
    } catch (e) {
      setFailure(true);
      setMessage(e instanceof Error ? e.message : 'Salin gagal');
    }
  }
  function download() {
    if (!result) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...result.layer.data,
            p4iAnalysis: { ...result, layer: undefined },
          },
          null,
          2,
        ),
      ],
      { type: 'application/geo+json' },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `p4i-${result.request.operation}-local.geojson`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function choices(
    doc: VectorLayerDocument | null,
    ids: string[],
    set: (v: string[]) => void,
    label: string,
  ) {
    return (
      doc && (
        <fieldset>
          <legend>
            {label} · revisi {doc.revision} · maksimum 20
          </legend>
          {doc.features.map((f) => (
            <label
              key={f.id}
              style={{ display: 'block', overflowWrap: 'anywhere' }}
            >
              <input
                type="checkbox"
                disabled={busy}
                checked={ids.includes(f.id)}
                onChange={(e) => {
                  set(
                    e.target.checked
                      ? [...ids, f.id]
                      : ids.filter((x) => x !== f.id),
                  );
                  invalidate();
                }}
              />
              {
                doc.layer.data.features.find((x) => x.id === f.localId)
                  ?.properties.name
              }{' '}
              · {f.id.slice(0, 8)}
            </label>
          ))}
        </fieldset>
      )
    );
  }
  return (
    <section
      className="gis-vector-analysis"
      aria-label="Analisis vektor PostGIS"
    >
      <h3>Analisis Vektor · PostGIS lokal</h3>
      <p>
        Data sintetis tersimpan · EPSG:4326 · maksimum 40 fitur / 2048 vertex /
        extent 1°. Operasi berlebihan ditolak.
      </p>
      {s.vectorAnalysisProposal && (
        <button
          className="gis-button secondary"
          disabled={busy}
          onClick={useProposal}
        >
          Gunakan usulan analisis Copilot
        </button>
      )}
      <fieldset disabled={busy}>
        <legend>Input dan parameter</legend>
        <label>
          Proyek analisis
          <select
            aria-label="Proyek analisis"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setSource(null);
              setTarget(null);
              setSourceIds([]);
              setTargetIds([]);
              setLayers([]);
              invalidate();
            }}
          >
            <option value="">Pilih proyek berizin</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operasi vektor
          <select
            aria-label="Operasi vektor"
            value={operation}
            onChange={(e) => {
              setOperation(e.target.value as VectorAnalysisOperation);
              setUnit(e.target.value === 'area' ? 'ha' : 'm');
              invalidate();
            }}
          >
            {VECTOR_ANALYSIS_OPERATIONS.map((op) => (
              <option key={op}>{op}</option>
            ))}
          </select>
        </label>
        <label>
          Layer sumber analisis
          <select
            aria-label="Layer sumber analisis"
            value={source?.id ?? ''}
            onChange={(e) => void load(e.target.value, 'source')}
          >
            <option value="">Pilih layer tersimpan</option>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · r{l.revision}
              </option>
            ))}
          </select>
        </label>
        {choices(source, sourceIds, setSourceIds, 'Fitur sumber')}
        {binary && (
          <>
            <label>
              Layer pembanding
              <select
                aria-label="Layer pembanding"
                value={target?.id ?? ''}
                onChange={(e) => void load(e.target.value, 'target')}
              >
                <option value="">Pilih target pada proyek sama</option>
                {layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            {choices(target, targetIds, setTargetIds, 'Fitur pembanding')}
          </>
        )}
        {operation === 'buffer' && (
          <label>
            Radius buffer (meter)
            <input
              aria-label="Radius buffer (meter)"
              type="number"
              min={1}
              max={10000}
              value={distance}
              onChange={(e) => {
                setDistance(Number(e.target.value));
                invalidate();
              }}
            />
          </label>
        )}
        {operation === 'dissolve' && (
          <label>
            Atribut pengelompokan
            <input
              aria-label="Atribut pengelompokan"
              value={attribute}
              maxLength={32}
              onChange={(e) => {
                setAttribute(e.target.value);
                invalidate();
              }}
            />
          </label>
        )}
        {['area', 'length', 'distance'].includes(operation) && (
          <label>
            Unit hasil
            <select
              aria-label="Unit hasil"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                invalidate();
              }}
            >
              {(operation === 'area' ? ['m2', 'ha'] : ['m', 'km']).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
      <p>
        Output:{' '}
        {['area', 'length', 'distance'].includes(operation)
          ? 'geometri sumber + nilai dan unit'
          : operation === 'buffer'
            ? 'polygon / multipart'
            : operation === 'intersects' || operation === 'within'
              ? 'fitur sumber terpilih'
              : 'geometri hasil tervalidasi; hasil kosong diperbolehkan'}
        .
      </p>
      <button
        className="gis-button secondary"
        disabled={busy || !source}
        onClick={() => void run(true)}
      >
        Periksa estimasi PostGIS
      </button>
      {estimate && (
        <p>
          Estimasi server: {estimate.value.features} fitur ·{' '}
          {estimate.value.vertices} vertex · {estimate.value.pairTests} pasangan
          · komputasi lokal terbatas.
        </p>
      )}
      <button
        className="gis-button"
        disabled={busy || !estimate}
        onClick={() => void run(false)}
      >
        Jalankan analisis PostGIS
      </button>
      {busy && (
        <button
          className="gis-button secondary"
          onClick={() => {
            controller.current?.abort();
            sequence.current++;
            setBusy(false);
            setMessage(
              'Permintaan dibatalkan. Database berhenti paling lambat pada batas waktu 3 detik; sumber tidak dimutasi.',
            );
          }}
        >
          Batalkan analisis
        </button>
      )}
      <p role={failure ? 'alert' : 'status'}>{message}</p>
      {result && (
        <section aria-label="Hasil analisis vektor">
          <h4>
            Hasil {result.request.operation} ·{' '}
            {result.layer.data.features.length} fitur
          </h4>
          <p>
            PostGIS · {result.crs} · {result.createdAt}
          </p>
          <details>
            <summary>Provenance dan batas</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {JSON.stringify(result.request, null, 2)}
            </pre>
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </details>
          <label>
            <input
              type="checkbox"
              checked={result.layer.visible}
              onChange={(e) =>
                s.setVectorAnalysisResult({
                  ...result,
                  layer: { ...result.layer, visible: e.target.checked },
                })
              }
            />
            Tampilkan hasil analisis
          </label>
          <label>
            Warna hasil
            <input
              aria-label="Warna hasil"
              type="color"
              value={result.layer.style.color}
              onChange={(e) =>
                s.setVectorAnalysisResult({
                  ...result,
                  layer: {
                    ...result.layer,
                    style: {
                      ...result.layer.style,
                      color: e.target.value,
                      fillColor: e.target.value,
                    },
                  },
                })
              }
            />
          </label>
          <label>
            Opacity hasil
            <input
              aria-label="Opacity hasil"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={result.layer.opacity}
              onChange={(e) =>
                s.setVectorAnalysisResult({
                  ...result,
                  layer: { ...result.layer, opacity: Number(e.target.value) },
                })
              }
            />
          </label>
          <details>
            <summary>Atribut hasil analisis</summary>
            {result.layer.data.features.map((f) => (
              <p key={f.id} style={{ overflowWrap: 'anywhere' }}>
                {f.properties.name}: {JSON.stringify(f.properties.attributes)}
              </p>
            ))}
          </details>
          <button className="gis-button secondary" onClick={download}>
            Unduh GeoJSON hasil
          </button>
          <button
            className="gis-button secondary"
            disabled={!result.layer.data.features.length}
            onClick={copyResult}
          >
            Salin hasil ke editor untuk disimpan
          </button>
          <button
            className="gis-button secondary"
            onClick={() => s.setVectorAnalysisResult(null)}
          >
            Buang hasil analisis
          </button>
        </section>
      )}
    </section>
  );
}
