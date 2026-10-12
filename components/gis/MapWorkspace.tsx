'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  Copy,
  RotateCcw,
  Layers,
  MousePointer2,
  Crosshair,
  Ruler,
  Sparkles,
  FlaskConical,
  Info,
  ChevronUp,
  ChevronDown,
  Trash2,
  LocateFixed,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useMapStore } from '../../store/useMapStore';
import { emptyRecipe, WEBMAPS } from '../../lib/gis/catalog';
import { record, validatePixelSample } from '../../lib/gis/validation';
import type { MapRecipe, PixelSample } from '../../lib/gis/contracts';
import { useGisCatalog } from './useGisCatalog';
import PixelInspector from './PixelInspector';
import CopilotPanel from './CopilotPanel';
import AhpSimulatorPanel from '../AhpSimulatorPanel';
import FloodAnalysisPanel from '../FloodAnalysisPanel';
import ExportPdfButton from '../ExportPdfButton';
import ExportImageButton from '../ExportImageButton';
const WorkspaceMap = dynamic(() => import('./WorkspaceMap'), {
  ssr: false,
  loading: () => <div className="gis-map-loading">Memuat workspace…</div>,
});
type Panel = 'layers' | 'pixel' | 'copilot' | 'analysis';
const STORAGE_KEY = 'p4i-map-draft-v1';
export default function MapWorkspace({
  webmap,
  dataset,
  initialPanel = 'layers',
}: {
  webmap?: string;
  dataset?: string;
  initialPanel?: Panel;
}) {
  const { error: catalogError } = useGisCatalog();
  const s = useWorkspaceStore();
  const mapState = useMapStore();
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [tool, setTool] = useState<'pan' | 'pixel' | 'measure'>(
    initialPanel === 'pixel' ? 'pixel' : 'pan',
  );
  const [measure, setMeasure] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampling, setSampling] = useState<{
    layers: MapRecipe['layers'] | null;
    status: 'idle' | 'loading' | 'done';
    error: string | null;
  }>({ layers: null, status: 'idle', error: null });
  const sampleStatus = sampling.layers === s.recipe.layers ? sampling.status : 'idle';
  const sampleError = sampling.layers === s.recipe.layers ? sampling.error : null;
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [showRecipe, setShowRecipe] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const initialized = useRef(false);
  const sampleRequest = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const samplingController = useRef<AbortController | null>(null);
  useEffect(() => {
    if (initialized.current || s.mode === 'loading' || !s.catalog.length) return;
    initialized.current = true;
    if (s.mode !== 'demo') return;
    if (s.recipe.layers.length && !webmap && !dataset) return;
    const template = WEBMAPS.find((m) => m.id === webmap);
    const ids = dataset ? [dataset] : (template?.datasets ?? ['demo-rainfall', 'demo-boundaries']);
    s.openTemplate(template?.title ?? 'Peta kerja — demo', ids);
  }, [s, webmap, dataset]);
  // Cancel obsolete samples when the visible raster set changes or the workspace unmounts.
  const rasterKey = s.recipe.layers
    .filter((l) => l.visible && l.type === 'raster')
    .map((l) => l.datasetId)
    .join(',');
  useEffect(() => {
    sampleRequest.current++;
    const controller = new AbortController();
    samplingController.current = controller;
    return () => controller.abort();
  }, [s.recipe.layers]);
  function act(action: unknown) {
    setError(null);
    try {
      s.action(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tindakan gagal');
    }
  }
  function local(operation: () => void) {
    setError(null);
    setNotice(null);
    try {
      operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft tidak dapat diproses');
    }
  }
  async function inspect(latitude: number, longitude: number) {
    setPanel('pixel');
    setPanelOpen(true);
    const layers = s.recipe.layers;
    s.setSamples([]);
    const ids = rasterKey.split(',').filter(Boolean);
    const request = ++sampleRequest.current;
    if (!ids.length) {
      s.setSamples([]);
      setSampling({ layers, status: 'idle', error: 'Aktifkan setidaknya satu layer raster.' });
      return;
    }
    setSampling({ layers, status: 'loading', error: null });
    const signal = samplingController.current?.signal;
    try {
      const r = await fetch('/api/gis/pixel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, datasetIds: ids }),
        signal,
      });
      const d: unknown = await r.json();
      if (!r.ok || !record(d) || !Array.isArray(d.samples))
        throw new Error('Sampel belum tersedia untuk dataset ini.');
      const samples = d.samples as PixelSample[];
      samples.forEach(validatePixelSample);
      if (request === sampleRequest.current && !signal?.aborted) {
        s.setSamples(samples);
        setSampling({ layers, status: 'done', error: null });
      }
    } catch (e) {
      if (request === sampleRequest.current && !signal?.aborted) {
        setSampling({ layers, status: 'done', error: e instanceof Error ? e.message : 'Sampling gagal' });
        s.setSamples([]);
      }
    }
  }
  function changePanel(p: Panel) {
    setPanel(p);
    setPanelOpen(true);
    setTool(p === 'pixel' ? 'pixel' : 'pan');
  }
  async function downloadVector(id: string) {
    try {
      const r = await fetch(`/api/gis/vector/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error('Unduhan belum tersedia');
      const b = await r.blob();
      download(b, `${id}-synthetic.geojson`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unduhan gagal');
    }
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="gis-workspace">
      <div className="gis-workspace-header">
        <div>
          <span className="gis-eyebrow">MAP WORKSPACE</span>
          <h1>{s.recipe.title}</h1>
        </div>
        <div className="gis-actions">
          <button
            className="gis-icon-button"
            aria-label="Undo"
            disabled={!s.past.length}
            onClick={s.undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="gis-icon-button"
            aria-label="Redo"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={18} />
          </button>
          <button
            className="gis-button secondary"
            onClick={() =>
              local(() => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(s.recipe));
                setNotice('Draft disimpan di browser ini.');
              })
            }
          >
            <Save size={15} />
            Simpan draft
          </button>
          <button
            className="gis-button secondary"
            onClick={() =>
              local(() => {
                const data = localStorage.getItem(STORAGE_KEY);
                if (!data) throw new Error('Belum ada draft lokal.');
                s.replace(JSON.parse(data) as unknown, 'Memuat draft lokal');
                setNotice('Draft dimuat.');
              })
            }
          >
            <FolderOpen size={15} />
            Buka
          </button>
          <button
            className="gis-icon-button"
            aria-label="Tampilkan atau sembunyikan panel"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            <Layers size={18} />
          </button>
        </div>
      </div>
      <div className={`gis-workspace-mode ${s.mode === 'demo' ? 'demo' : ''}`}>
        {s.mode === 'demo'
          ? 'DEMO SINTETIK · Tidak untuk keputusan operasional / hasil ilmiah'
          : 'Integrasi raster belum tersedia · Viewer proyek lama tetap dapat digunakan'}
        <span>
          {s.recipe.provenance === 'ai'
            ? 'AI-generated map configuration'
            : 'Konfigurasi sesi lokal'}
        </span>
      </div>
      {(error || s.error || catalogError) && (
        <div className="gis-error" role="alert">
          {error ?? s.error ?? 'Katalog tidak dapat dimuat'}
        </div>
      )}
      {notice && (
        <div className="gis-notice" role="status">
          {notice}
        </div>
      )}
      <div className={`gis-workspace-body ${!panelOpen ? 'panel-closed' : ''}`}>
        <div className="gis-map-area" data-gis-export>
          {catalogError ? (
            <div className="gis-map-loading" role="alert">Katalog tidak dapat dimuat. Coba muat ulang halaman.</div>
          ) : s.mode !== 'loading' ? (
            <WorkspaceMap tool={tool} onInspect={inspect} onMeasure={setMeasure} />
          ) : (
            <div className="gis-map-loading">Memuat workspace…</div>
          )}
          <div className="gis-map-toolbar">
            <button
              aria-label="Navigasi peta"
              aria-pressed={tool === 'pan'}
              onClick={() => setTool('pan')}
            >
              <MousePointer2 size={18} />
            </button>
            <button
              aria-label="Inspeksi piksel"
              aria-pressed={tool === 'pixel'}
              onClick={() => changePanel('pixel')}
            >
              <Crosshair size={18} />
            </button>
            <button
              aria-label="Ukur jarak"
              aria-pressed={tool === 'measure'}
              onClick={() => {
                setTool('measure');
                setMeasure(0);
              }}
            >
              <Ruler size={18} />
            </button>
            <button
              aria-label="Kembali ke cakupan awal"
              onClick={() => act({ tool: 'setViewport', center: [-1.6, 103.62], zoom: 12 })}
            >
              <LocateFixed size={18} />
            </button>
          </div>
          <div className="gis-map-label">
            <strong>{s.recipe.title}</strong>
            <small>{s.mode === 'demo' ? 'DATA DEMO · SINTETIK' : 'P4I Spatial Analytics'}</small>
          </div>
          {s.recipe.legend.length > 0 && (
            <div className="gis-map-legend">
              <h3>Legenda {s.mode === 'demo' && '· demo'}</h3>
              {s.recipe.legend.map((l) => (
                <div key={l.datasetId}>
                  <strong>{l.title}</strong>
                  <div>
                    {l.entries.map((e, i) => (
                      <span key={i}>
                        <i style={{ background: e.color }} />
                        {e.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <small>
                Preview raster digeneralisasi. Nilai sampel memakai grid native sintetik.
              </small>
            </div>
          )}
          {tool === 'measure' && (
            <div className="gis-measure">
              {measure
                ? `Jarak geodesik perkiraan: ${measure.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`
                : 'Klik dua titik untuk mengukur jarak.'}
            </div>
          )}
        </div>
        {panelOpen && (
          <aside className="gis-workspace-panel">
            <div className="gis-tabs">
              {(
                [
                  { id: 'layers', label: 'Layer', icon: Layers },
                  { id: 'pixel', label: 'Pixel', icon: Crosshair },
                  { id: 'copilot', label: 'AI GIS', icon: Sparkles },
                  { id: 'analysis', label: 'Analisis', icon: FlaskConical },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button key={id} aria-pressed={panel === id} onClick={() => changePanel(id)}>
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <div className="gis-panel-content">
              {panel === 'layers' && (
                <section>
                  <h2>Susun peta Anda</h2>
                  <label>
                    Judul peta
                    <input
                      aria-label="Judul peta"
                      placeholder={s.recipe.title}
                      value={title}
                      maxLength={200}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => {
                        if (title.trim()) {
                          act({ tool: 'setMapTitle', title });
                          setTitle('');
                        }
                      }}
                    />
                  </label>
                  <label>
                    Deskripsi
                    <textarea
                      aria-label="Deskripsi peta"
                      placeholder={s.recipe.description || 'Tujuan peta…'}
                      value={description}
                      maxLength={2000}
                      onChange={(e) => setDescription(e.target.value)}
                      onBlur={() => {
                        if (description) {
                          s.replace({ ...s.recipe, description }, 'Ubah deskripsi');
                          setDescription('');
                        }
                      }}
                    />
                  </label>
                  <label>
                    Basemap
                    <select
                      aria-label="Basemap"
                      value={s.recipe.basemap}
                      onChange={(e) => act({ tool: 'setBasemap', basemap: e.target.value })}
                    >
                      <option value="osm">OpenStreetMap</option>
                      <option value="none">Tanpa basemap</option>
                    </select>
                  </label>
                  <div className="gis-section-heading">
                    <h3>Layer aktif ({s.recipe.layers.length})</h3>
                  </div>
                  {[...s.recipe.layers].reverse().map((l, reversedIndex) => {
                    const d = s.catalog.find((d) => d.id === l.datasetId);
                    const index = s.recipe.layers.length - 1 - reversedIndex;
                    return (
                      <div className="gis-layer-item" key={l.id}>
                        <div className="gis-layer-title">
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`Tampilkan ${d?.title}`}
                              checked={l.visible}
                              onChange={(e) =>
                                act({
                                  tool: 'toggleLayer',
                                  layerId: l.id,
                                  visible: e.target.checked,
                                })
                              }
                            />
                            {d?.title ?? l.datasetId}
                          </label>
                          <button
                            aria-label={`Hapus ${d?.title}`}
                            onClick={() => act({ tool: 'removeLayer', layerId: l.id })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <span className="gis-muted">
                          {l.type} · {d?.version} · {d?.status}
                        </span>
                        <label className="gis-opacity">
                          Opacity {Math.round(l.opacity * 100)}%
                          <input
                            aria-label={`Opacity ${d?.title}`}
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={l.opacity}
                            onChange={(e) =>
                              act({
                                tool: 'setLayerOpacity',
                                layerId: l.id,
                                opacity: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <div className="gis-layer-tools">
                          <button
                            disabled={index === s.recipe.layers.length - 1}
                            aria-label={`Naikkan ${d?.title}`}
                            onClick={() =>
                              act({ tool: 'reorderLayer', layerId: l.id, index: index + 1 })
                            }
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            disabled={index === 0}
                            aria-label={`Turunkan ${d?.title}`}
                            onClick={() =>
                              act({ tool: 'reorderLayer', layerId: l.id, index: index - 1 })
                            }
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            aria-label={`Zoom ${d?.title}`}
                            onClick={() => act({ tool: 'zoomToLayer', layerId: l.id })}
                          >
                            <LocateFixed size={14} />
                          </button>
                          <label className="gis-style-label">
                            Warna
                            <input
                              type="color"
                              aria-label={`Warna ${d?.title}`}
                              value={
                                'color' in l.style ? l.style.fillColor : l.style.palette.at(-1)
                              }
                              onChange={(e) => {
                                if ('color' in l.style)
                                  act({
                                    tool: 'styleVectorLayer',
                                    layerId: l.id,
                                    style: {
                                      ...l.style,
                                      color: e.target.value,
                                      fillColor: e.target.value,
                                    },
                                  });
                                else
                                  act({
                                    tool: 'styleRasterLayer',
                                    layerId: l.id,
                                    style: {
                                      ...l.style,
                                      palette: [...l.style.palette.slice(0, -1), e.target.value],
                                    },
                                  });
                              }}
                            />
                          </label>
                        </div>
                        <details>
                          <summary>
                            <Info size={13} />
                            Informasi layer
                          </summary>
                          <p>{d?.provenance}</p>
                          <p>
                            {d?.raster
                              ? `${d.raster.resolution.x} × ${d.raster.resolution.y} ${d.raster.resolution.unit} · ${d.raster.crs} · ${d.raster.resampling}`
                              : d?.crs}
                          </p>
                          {d?.type === 'vector' && d.status === 'demo' && (
                            <button
                              className="gis-button secondary"
                              onClick={() => downloadVector(d.id)}
                            >
                              Unduh GeoJSON contoh
                            </button>
                          )}
                        </details>
                      </div>
                    );
                  })}
                  {!s.recipe.layers.length && (
                    <p className="gis-empty">Tambahkan dataset dari katalog di bawah.</p>
                  )}
                  <h3>Tambah dataset</h3>
                  <div className="gis-add-datasets">
                    {s.catalog.map((d) => (
                      <button
                        key={d.id}
                        disabled={
                          d.status === 'unavailable' ||
                          s.recipe.layers.some((l) => l.datasetId === d.id)
                        }
                        onClick={() => act({ tool: 'addLayer', datasetId: d.id })}
                      >
                        + {d.title}
                        <small>
                          {d.type} · {d.status === 'unavailable' ? 'belum tersedia' : 'demo'}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="gis-section-heading">
                    <h3>Area kajian (AOI)</h3>
                  </div>
                  <select
                    aria-label="Pilih area kajian"
                    disabled={s.mode !== 'demo'}
                    value={s.recipe.aoi?.id ?? ''}
                    onChange={(e) => act({ tool: 'selectAOI', aoiId: e.target.value })}
                  >
                    <option value="" disabled>
                      Pilih area contoh
                    </option>
                    <option value="demo-aoi-west">Area contoh Barat</option>
                    <option value="demo-aoi-east">Area contoh Timur</option>
                  </select>
                  <p className="gis-muted">AOI contoh tidak dikirim ke analisis banjir nyata.</p>
                  <div className="gis-actions">
                    <button
                      className="gis-button secondary"
                      onClick={() =>
                        local(() =>
                          s.replace(
                            {
                              ...s.recipe,
                              id: crypto.randomUUID(),
                              title: (s.recipe.title + ' — salinan').slice(0, 200),
                            },
                            'Duplikasi peta',
                          ),
                        )
                      }
                    >
                      <Copy size={14} />
                      Duplikasi
                    </button>
                    <button
                      className="gis-button secondary"
                      onClick={() =>
                        local(() => s.replace(emptyRecipe(), 'Reset peta (Undo tersedia)'))
                      }
                    >
                      <RotateCcw size={14} />
                      Reset
                    </button>
                  </div>
                  <h3>Ekspor</h3>
                  <ExportPdfButton recipe={s.recipe} datasets={s.catalog} />
                  <ExportImageButton recipe={s.recipe} />
                  <div className="gis-actions">
                    <button
                      className="gis-button secondary"
                      onClick={() =>
                        download(
                          new Blob([JSON.stringify(s.recipe, null, 2)], {
                            type: 'application/json',
                          }),
                          'p4i-map-recipe.json',
                        )
                      }
                    >
                      Ekspor resep JSON
                    </button>
                    <button
                      className="gis-button secondary"
                      onClick={() => fileInput.current?.click()}
                    >
                      Impor resep
                    </button>
                  </div>
                  <input
                    ref={fileInput}
                    hidden
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 65536) {
                        setError('Resep terlalu besar (maks 64 KB).');
                        return;
                      }
                      const value = await file.text();
                      local(() =>
                        s.replace(JSON.parse(value) as unknown, 'Impor resep tervalidasi'),
                      );
                      e.target.value = '';
                    }}
                  />
                </section>
              )}
              {panel === 'pixel' && (
                <PixelInspector samples={s.samples} status={sampleStatus} error={sampleError} />
              )}
              {panel === 'copilot' && <CopilotPanel />}
              {panel === 'analysis' && (
                <section>
                  <h2>Analisis spasial</h2>
                  <div className="gis-warning">
                    TODO(P4I-GIS-VALIDATION): Ambang, dataset, dan bobot ilmiah masih memerlukan
                    validasi. AOI sintetik tidak memicu analisis GEE.
                  </div>
                  <AhpSimulatorPanel standalone />
                  <button
                    className="gis-button secondary"
                    disabled={!mapState.isCrValid}
                    onClick={() =>
                      local(() =>
                        s.replace(
                          {
                            ...s.recipe,
                            analysis: {
                              method: 'ahp-wlc',
                              weights: mapState.derivedWeights,
                              cr: mapState.crValue,
                              provisional: true,
                            },
                          },
                          'Simpan bobot AHP (provisional)',
                        ),
                      )
                    }
                  >
                    Simpan bobot AHP ke resep
                  </button>
                  {s.mode !== 'demo' && (
                    <FloodAnalysisPanel isAuthenticated={s.context.role !== 'guest'} />
                  )}
                  <p className="gis-muted">
                    Analisis banjir nyata tetap memakai identitas kecamatan dari viewer proyek lama,
                    izin server, dan GEE. Tidak menggunakan data contoh.
                  </p>
                  <Link className="gis-card-link" href="/spatial">
                    Buka viewer proyek & analisis lama →
                  </Link>
                  <div className="gis-unavailable">
                    Zonal statistics, clip, normalisasi, weighted overlay raster, dan buffer
                    menunggu adapter komputasi. Tidak ada kalkulator kode bebas.
                  </div>
                </section>
              )}
              <button className="gis-button secondary" onClick={() => setShowRecipe(!showRecipe)}>
                {showRecipe ? 'Tutup' : 'Tinjau'} MapRecipe
              </button>
              {showRecipe && <pre className="gis-recipe">{JSON.stringify(s.recipe, null, 2)}</pre>}
            </div>
          </aside>
        )}
      </div>
      <footer className="gis-workspace-footer">
        <span>
          {s.recipe.aoi?.name ?? 'AOI belum dipilih'} ·{' '}
          {s.recipe.layers.filter((l) => l.visible).length} layer terlihat
        </span>
        <span>
          {s.recipe.viewport.center.map((n) => n.toFixed(4)).join(', ')} · Zoom{' '}
          {s.recipe.viewport.zoom}
        </span>
        <span>Snapshot Undo: {s.past.length}/30</span>
      </footer>
    </div>
  );
}
