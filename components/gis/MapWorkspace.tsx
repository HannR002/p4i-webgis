'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  Info,
  ChevronUp,
  ChevronDown,
  Trash2,
  LocateFixed,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useMapStore } from '../../store/useMapStore';
import { bandRange } from '../../lib/gis/raster';
import { emptyRecipe, WEBMAPS } from '../../lib/gis/catalog';
import { record, validatePixelSample } from '../../lib/gis/validation';
import type { MapRecipe, PixelSample } from '../../lib/gis/contracts';
import { useGisCatalog } from './useGisCatalog';
import PixelInspector from './PixelInspector';
import RasterToolsPanel from './RasterToolsPanel';
import AnalysisConfigurationPanel from './AnalysisConfigurationPanel';
import { defaultConfiguration } from '../../lib/gis/analysisConfiguration';
import VectorEditorPanel from './VectorEditorPanel';
import CopilotPanel from './CopilotPanel';
import WorkspaceTabs, { type WorkspacePanel } from './WorkspaceTabs';
import AhpSimulatorPanel from '../AhpSimulatorPanel';
import FloodAnalysisPanel from '../FloodAnalysisPanel';
import ExportPdfButton from '../ExportPdfButton';
import ExportImageButton from '../ExportImageButton';
const WorkspaceMap = dynamic(() => import('./WorkspaceMap'), {
  ssr: false,
  loading: () => <div className="gis-map-loading">Memuat workspace…</div>,
});
type Panel = WorkspacePanel;
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
  const { error: catalogError, mutate: retryCatalog } = useGisCatalog();
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
  const sampleStatus =
    sampling.layers === s.recipe.layers ? sampling.status : 'idle';
  const sampleError =
    sampling.layers === s.recipe.layers ? sampling.error : null;
  const [showRecipe, setShowRecipe] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const initialized = useRef<string | null>(null);
  const requestedMap = `${webmap ?? ''}:${dataset ?? ''}`;
  const unknownSelection =
    (webmap && !WEBMAPS.some((m) => m.id === webmap)) ||
    (dataset &&
      s.mode !== 'loading' &&
      !s.catalog.some((d) => d.id === dataset));
  const sampleRequest = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const samplingController = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    if (
      initialized.current === requestedMap ||
      unknownSelection ||
      s.mode === 'loading' ||
      !s.catalog.length
    )
      return;
    initialized.current = requestedMap;
    if (s.mode !== 'demo') return;
    if (s.recipe.layers.length && !webmap && !dataset) return;
    const template = WEBMAPS.find((m) => m.id === webmap);
    const ids = dataset
      ? [dataset]
      : (template?.datasets ?? ['demo-rainfall', 'demo-boundaries']);
    s.openTemplate(template?.title ?? 'Peta kerja — demo', ids);
  }, [s, webmap, dataset, requestedMap, unknownSelection]);
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
  async function inspect(
    latitude: number,
    longitude: number,
    resampling: 'nearest' | 'bilinear' = 'nearest',
  ) {
    setPanel('pixel');
    setPanelOpen(true);
    const layers = s.recipe.layers;
    s.setSamples([]);
    const ids = rasterKey.split(',').filter(Boolean);
    const request = ++sampleRequest.current;
    if (!ids.length) {
      s.setSamples([]);
      setSampling({
        layers,
        status: 'idle',
        error: 'Aktifkan setidaknya satu layer raster.',
      });
      return;
    }
    setSampling({ layers, status: 'loading', error: null });
    const signal = samplingController.current?.signal;
    try {
      const r = await fetch('/api/gis/pixel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude,
          longitude,
          datasetIds: ids,
          resampling,
          bands: Object.fromEntries(
            s.recipe.layers
              .filter((l) => l.visible && l.type === 'raster')
              .map((l) => [
                l.datasetId,
                'band' in l.style && l.style.band
                  ? l.style.band
                  : s.catalog.find((d) => d.id === l.datasetId)?.raster
                      ?.bands[0].id,
              ]),
          ),
        }),
        signal,
      });
      const d: unknown = await r.json();
      if (!r.ok || !record(d) || !Array.isArray(d.samples))
        throw new Error(
          record(d) && typeof d.error === 'string'
            ? d.error
            : 'Sampel belum tersedia untuk dataset ini.',
        );
      const samples = d.samples as PixelSample[];
      samples.forEach(validatePixelSample);
      if (request === sampleRequest.current && !signal?.aborted) {
        s.setSamples(samples);
        setSampling({ layers, status: 'done', error: null });
      }
    } catch (e) {
      if (request === sampleRequest.current && !signal?.aborted) {
        setSampling({
          layers,
          status: 'done',
          error: e instanceof Error ? e.message : 'Sampling gagal',
        });
        s.setSamples([]);
      }
    }
  }
  function changePanel(p: Panel) {
    s.setVectorEditor({ vectorMode: 'off', vectorVertices: [] });
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
          <h1 title={s.recipe.title}>{s.recipe.title}</h1>
          <p className="gis-workspace-subtitle">
            Susun layer, jelajahi data, simpan kajian.
          </p>
        </div>
        <div className="gis-actions">
          <button
            className="gis-icon-button"
            aria-label="Undo"
            title="Undo"
            disabled={!s.past.length}
            onClick={s.undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="gis-icon-button"
            aria-label="Redo"
            title="Redo"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            <Redo2 size={18} />
          </button>
          <button
            className="gis-button secondary"
            disabled={s.mode === 'loading' || !!catalogError}
            onClick={() =>
              local(() => {
                if (s.vectorEdit || s.vectorVertices.length)
                  throw new Error(
                    'Selesaikan atau batalkan gambar/edit sebelum menyimpan draft.',
                  );
                const value = JSON.stringify(s.recipe);
                if (new Blob([value]).size > 65536)
                  throw new Error(
                    'Draft terlalu besar (maks 64 KB); kurangi objek/konfigurasi sebelum menyimpan.',
                  );
                localStorage.setItem(STORAGE_KEY, value);
                setNotice('Draft disimpan di browser ini.');
              })
            }
          >
            <Save size={15} />
            Simpan draft
          </button>
          <button
            className="gis-button secondary"
            disabled={s.mode === 'loading' || !!catalogError}
            onClick={() =>
              local(() => {
                const data = localStorage.getItem(STORAGE_KEY);
                if (!data) throw new Error('Belum ada draft lokal.');
                if (new Blob([data]).size > 65536)
                  throw new Error('Draft terlalu besar (maks 64 KB).');
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
            title="Tampilkan atau sembunyikan panel"
            aria-controls="gis-workspace-panel"
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
          : s.mode === 'loading'
            ? 'Memuat katalog workspace…'
            : 'Integrasi data nyata belum tersedia · Jelajahi proyek melalui viewer proyek'}
        <span>
          {s.recipe.provenance === 'ai'
            ? 'AI-generated map configuration'
            : 'Konfigurasi sesi lokal'}
        </span>
      </div>
      {unknownSelection && (
        <div className="gis-error" role="alert">
          Peta atau dataset tidak ditemukan.{' '}
          <Link href="/spatial/webmap">Kembali ke katalog peta</Link>
        </div>
      )}
      {(error || s.error || catalogError) && (
        <div className="gis-error" role="alert">
          {error ?? s.error ?? 'Katalog tidak dapat dimuat'}
          {catalogError && (
            <button
              className="gis-button secondary"
              onClick={() => void retryCatalog()}
            >
              Coba lagi
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="gis-notice" role="status">
          {notice}
        </div>
      )}
      <div className={`gis-workspace-body ${!panelOpen ? 'panel-closed' : ''}`}>
        <div
          className="gis-map-area"
          data-gis-export
          role="region"
          aria-label="Peta dan legenda"
        >
          {catalogError ? (
            <div className="gis-map-loading" role="alert">
              Katalog tidak dapat dimuat. Coba muat ulang halaman.
            </div>
          ) : unknownSelection ? (
            <div className="gis-map-loading">
              Peta yang diminta tidak ditemukan. Pilih peta dari katalog.
            </div>
          ) : s.mode === 'demo' ? (
            <WorkspaceMap
              tool={tool}
              onInspect={inspect}
              onMeasure={setMeasure}
            />
          ) : s.mode === 'unavailable' ? (
            <div className="gis-map-loading">
              <h2>Data workspace belum aktif</h2>
              <p>
                Integrasi dataset nyata sedang disiapkan. Jelajahi proyek yang
                tersedia melalui viewer proyek.
              </p>
              <Link className="gis-button secondary" href="/spatial">
                Buka viewer proyek
              </Link>
            </div>
          ) : (
            <div className="gis-map-loading">Memuat workspace…</div>
          )}
          <div
            className="gis-map-toolbar"
            role="group"
            aria-label="Alat peta"
            hidden={s.mode !== 'demo' || !!unknownSelection || !!catalogError}
          >
            <button
              aria-label="Navigasi peta"
              title="Navigasi peta"
              aria-pressed={tool === 'pan'}
              onClick={() => {
                s.setVectorEditor({ vectorMode: 'off', vectorVertices: [] });
                setTool('pan');
              }}
            >
              <MousePointer2 size={18} />
            </button>
            <button
              aria-label="Inspeksi piksel"
              title="Inspeksi piksel"
              aria-pressed={tool === 'pixel'}
              onClick={() => changePanel('pixel')}
            >
              <Crosshair size={18} />
            </button>
            <button
              aria-label="Ukur jarak"
              title="Ukur jarak"
              aria-pressed={tool === 'measure'}
              onClick={() => {
                s.setVectorEditor({ vectorMode: 'off', vectorVertices: [] });
                setTool('measure');
                setMeasure(0);
              }}
            >
              <Ruler size={18} />
            </button>
            <button
              aria-label="Kembali ke cakupan awal"
              title="Kembali ke cakupan awal"
              onClick={() =>
                act({ tool: 'setViewport', center: [-1.6, 103.62], zoom: 12 })
              }
            >
              <LocateFixed size={18} />
            </button>
          </div>
          <div className="gis-map-label">
            <strong>{s.recipe.title}</strong>
            <small>
              {s.mode === 'demo'
                ? 'DATA DEMO · SINTETIK'
                : 'P4I Spatial Analytics'}
            </small>
          </div>
          {(s.recipe.legend.length > 0 ||
            s.recipe.sketchLayers?.some((l) => l.visible)) && (
            <details className="gis-map-legend" open>
              <summary>Legenda {s.mode === 'demo' && '· demo'}</summary>
              <div className="gis-legend-content">
                {s.recipe.analysisResults?.map((r) => (
                  <div key={r.jobId} className="gis-analysis-legend">
                    <strong>{r.title} · EKSPERIMENTAL</strong>
                    <p>
                      {r.demo ? 'DEMO' : 'Input pengguna'} · {r.summary}
                    </p>
                    {r.points.length > 0 && (
                      <p>● Ungu: titik/garis hasil; bukan permukaan raster.</p>
                    )}
                  </div>
                ))}
                {s.recipe.sketchLayers
                  ?.filter((l) => l.visible)
                  .map((l) => (
                    <div key={l.id}>
                      <strong>{l.name} · vektor lokal</strong>
                      <div>
                        {l.data.features.slice(0, 12).map((f) => (
                          <span key={f.id}>
                            <i
                              style={{
                                background: (f.properties.style ?? l.style)
                                  .color,
                              }}
                            />
                            {f.properties.name}
                          </span>
                        ))}
                        {l.data.features.length > 12 && (
                          <small>
                            +{l.data.features.length - 12} objek; lihat editor
                          </small>
                        )}
                      </div>
                    </div>
                  ))}
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
                  {s.recipe.layers.some((l) => l.type === 'raster')
                    ? 'Preview raster digeneralisasi. Nilai sampel memakai grid native sintetik.'
                    : 'Geometri lokal dari input pengguna; bukan batas resmi.'}
                </small>
              </div>
            </details>
          )}
          {tool === 'measure' && (
            <div className="gis-measure">
              {measure
                ? `Jarak geodesik perkiraan: ${measure.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`
                : 'Klik dua titik untuk mengukur jarak.'}
            </div>
          )}
        </div>
        <aside
          className="gis-workspace-panel"
          id="gis-workspace-panel"
          hidden={!panelOpen}
          aria-label="Konfigurasi dan analisis peta"
        >
          <WorkspaceTabs panel={panel} select={changePanel} />
          <div className="gis-panel-content">
            <fieldset
              className="gis-session-controls"
              disabled={s.mode === 'loading' || !!catalogError}
              aria-label="Kontrol sesi peta"
            >
              <div
                id="gis-panel-layers"
                role="tabpanel"
                aria-labelledby="gis-tab-layers"
                tabIndex={0}
                hidden={panel !== 'layers'}
              >
                <VectorEditorPanel />
                {panel === 'layers' && (
                  <section>
                    <h2>Susun peta Anda</h2>
                    <label>
                      Judul peta
                      <input
                        aria-label="Judul peta"
                        placeholder={s.recipe.title}
                        key={`title-${s.recipe.title}`}
                        defaultValue={s.recipe.title}
                        maxLength={200}
                        onBlur={(e) => {
                          const title = e.target.value.trim();
                          if (title && title !== s.recipe.title)
                            act({ tool: 'setMapTitle', title });
                          else e.target.value = s.recipe.title;
                        }}
                      />
                    </label>
                    <label>
                      Deskripsi
                      <textarea
                        aria-label="Deskripsi peta"
                        placeholder={s.recipe.description || 'Tujuan peta…'}
                        key={`description-${s.recipe.description}`}
                        defaultValue={s.recipe.description}
                        maxLength={2000}
                        onBlur={(e) => {
                          const description = e.target.value;
                          if (description !== s.recipe.description)
                            local(() =>
                              s.replace(
                                { ...s.recipe, description },
                                'Ubah deskripsi',
                              ),
                            );
                        }}
                      />
                    </label>
                    <label>
                      Basemap
                      <select
                        aria-label="Basemap"
                        value={s.recipe.basemap}
                        onChange={(e) =>
                          act({ tool: 'setBasemap', basemap: e.target.value })
                        }
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
                              onClick={() =>
                                act({ tool: 'removeLayer', layerId: l.id })
                              }
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
                                act({
                                  tool: 'reorderLayer',
                                  layerId: l.id,
                                  index: index + 1,
                                })
                              }
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              disabled={index === 0}
                              aria-label={`Turunkan ${d?.title}`}
                              onClick={() =>
                                act({
                                  tool: 'reorderLayer',
                                  layerId: l.id,
                                  index: index - 1,
                                })
                              }
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button
                              aria-label={`Zoom ${d?.title}`}
                              onClick={() =>
                                act({ tool: 'zoomToLayer', layerId: l.id })
                              }
                            >
                              <LocateFixed size={14} />
                            </button>
                            <label className="gis-style-label">
                              Warna
                              <input
                                type="color"
                                aria-label={`Warna ${d?.title}`}
                                value={
                                  'color' in l.style
                                    ? l.style.fillColor
                                    : l.style.palette.at(-1)
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
                                        palette: [
                                          ...l.style.palette.slice(0, -1),
                                          e.target.value,
                                        ],
                                      },
                                    });
                                }}
                              />
                            </label>
                          </div>
                          {d?.raster && 'palette' in l.style && (
                            <label className="gis-band-select">
                              Band
                              <select
                                aria-label={`Band ${d.title}`}
                                value={l.style.band ?? d.raster.bands[0].id}
                                onChange={(e) => {
                                  const range = bandRange(
                                    d.raster!,
                                    e.target.value,
                                  );
                                  act({
                                    tool: 'styleRasterLayer',
                                    layerId: l.id,
                                    style: {
                                      ...l.style,
                                      band: e.target.value,
                                      min: range[0],
                                      max: range[1],
                                    },
                                  });
                                }}
                              >
                                {d.raster.bands.map((band) => (
                                  <option key={band.id} value={band.id}>
                                    {band.id} · {band.unit}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
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
                      <p className="gis-empty">
                        Tambahkan dataset dari katalog di bawah.
                      </p>
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
                          onClick={() =>
                            act({ tool: 'addLayer', datasetId: d.id })
                          }
                        >
                          + {d.title}
                          <small>
                            {d.type} ·{' '}
                            {d.status === 'unavailable'
                              ? 'belum tersedia'
                              : d.status === 'demo'
                                ? 'demo'
                                : 'tersedia'}
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
                      onChange={(e) =>
                        act({ tool: 'selectAOI', aoiId: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        Pilih area contoh
                      </option>
                      <option value="demo-aoi-west">Area contoh Barat</option>
                      <option value="demo-aoi-east">Area contoh Timur</option>
                    </select>
                    <p className="gis-muted">
                      AOI contoh tidak dikirim ke analisis banjir nyata.
                    </p>
                    <div className="gis-actions">
                      <button
                        className="gis-button secondary"
                        onClick={() =>
                          local(() =>
                            s.replace(
                              {
                                ...s.recipe,
                                id: crypto.randomUUID(),
                                title: (s.recipe.title + ' — salinan').slice(
                                  0,
                                  200,
                                ),
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
                          local(() =>
                            s.replace(
                              emptyRecipe(),
                              'Reset peta (Undo tersedia)',
                            ),
                          )
                        }
                      >
                        <RotateCcw size={14} />
                        Reset
                      </button>
                    </div>
                    <h3>Deliverable klien</h3>
                    <Link
                      className="gis-button secondary"
                      href="/spatial/consulting"
                    >
                      Siapkan deliverable dari peta sesi
                    </Link>
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
                      aria-label="Impor MapRecipe JSON"
                      accept=".json,application/json"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 65536) {
                          setError('Resep terlalu besar (maks 64 KB).');
                          return;
                        }
                        const input = e.currentTarget;
                        const expectedRecipe =
                          useWorkspaceStore.getState().recipe;
                        const value = await file.text();
                        local(() =>
                          s.replace(
                            JSON.parse(value) as unknown,
                            'Impor resep tervalidasi',
                            expectedRecipe,
                          ),
                        );
                        input.value = '';
                      }}
                    />
                  </section>
                )}
              </div>
              <div
                id="gis-panel-pixel"
                role="tabpanel"
                aria-labelledby="gis-tab-pixel"
                tabIndex={0}
                hidden={panel !== 'pixel'}
              >
                {panel === 'pixel' && (
                  <>
                    <button
                      className="gis-button secondary"
                      onClick={() => inspect(...s.recipe.viewport.center)}
                      disabled={s.mode !== 'demo'}
                    >
                      <Crosshair size={16} aria-hidden="true" />
                      Inspeksi titik pusat
                    </button>
                    <PixelInspector
                      onQuery={s.mode === 'demo' ? inspect : undefined}
                      samples={s.samples}
                      status={sampleStatus}
                      error={sampleError}
                    />
                  </>
                )}
              </div>
              <div
                id="gis-panel-copilot"
                role="tabpanel"
                aria-labelledby="gis-tab-copilot"
                tabIndex={0}
                hidden={panel !== 'copilot'}
              >
                <CopilotPanel onOpenAnalysis={() => changePanel('analysis')} />
              </div>
              <div
                id="gis-panel-analysis"
                role="tabpanel"
                aria-labelledby="gis-tab-analysis"
                tabIndex={0}
                hidden={panel !== 'analysis'}
              >
                {panel === 'analysis' && (
                  <section>
                    <h2>Analisis spasial</h2>
                    <div className="gis-warning">
                      Pengaturan dan mapping saat ini eksperimental. Validasi
                      metodologi ilmiah ditunda; AOI sintetik tidak memicu GEE.
                    </div>
                    <div className="gis-context">
                      <strong>Area kajian:</strong>{' '}
                      {s.recipe.aoi?.name ?? 'Belum dipilih'}
                      <br />
                      <strong>Layer:</strong>{' '}
                      {s.recipe.layers.filter((l) => l.visible).length} terlihat
                      ·{' '}
                      {s.recipe.analysis
                        ? s.recipe.analysis.weightMethod === 'manual-wlc'
                          ? 'Bobot WLC tersimpan'
                          : 'Bobot AHP tersimpan'
                        : 'Belum ada bobot tersimpan'}
                    </div>
                    <AnalysisConfigurationPanel />
                    <RasterToolsPanel />
                    <AhpSimulatorPanel standalone />
                    <button
                      className="gis-button secondary"
                      onClick={() =>
                        local(() => {
                          const initial = defaultConfiguration(
                            mapState.weightMethod === 'manual-wlc'
                              ? 'wlc'
                              : 'ahp-smce',
                            s.catalog,
                            s.recipe,
                          );
                          const configuration =
                            initial.analysisType === 'ahp-smce'
                              ? {
                                  ...initial,
                                  weights: { ...mapState.derivedWeights },
                                  parameters: {
                                    pairwise: { ...mapState.pairwiseValues },
                                  },
                                }
                              : {
                                  ...initial,
                                  weights: { ...mapState.derivedWeights },
                                };
                          s.replace(
                            {
                              ...s.recipe,
                              analysisConfiguration: configuration,
                              analysis: {
                                method: 'ahp-wlc',
                                weights: mapState.derivedWeights,
                                cr:
                                  mapState.weightMethod === 'manual-wlc'
                                    ? 0
                                    : Math.max(0, mapState.crValue),
                                provisional: true,
                                weightMethod: mapState.weightMethod,
                              },
                            },
                            'Simpan bobot AHP (provisional)',
                          );
                        })
                      }
                    >
                      {mapState.weightMethod === 'manual-wlc'
                        ? 'Simpan bobot WLC ke resep'
                        : 'Simpan bobot AHP ke resep'}
                    </button>
                    {s.mode !== 'demo' && (
                      <FloodAnalysisPanel
                        isAuthenticated={s.context.role !== 'guest'}
                      />
                    )}
                    <p className="gis-muted">
                      Analisis banjir nyata tetap memakai identitas kecamatan
                      dari viewer proyek lama, izin server, dan GEE. Tidak
                      menggunakan data contoh.
                    </p>
                    <Link className="gis-card-link" href="/spatial">
                      Buka viewer proyek & analisis lama →
                    </Link>
                    <div className="gis-unavailable">
                      Raster lokal hanya DEMO: statistik native, operasi titik
                      dan descriptor clip/mask. Buffer, vector overlay,
                      harmonisasi dan raster nyata menunggu adapter.
                    </div>
                  </section>
                )}
              </div>
              <button
                className="gis-button secondary"
                onClick={() => setShowRecipe(!showRecipe)}
              >
                {showRecipe ? 'Tutup' : 'Tinjau'} MapRecipe
              </button>
              {showRecipe && (
                <pre className="gis-recipe">
                  {JSON.stringify(s.recipe, null, 2)}
                </pre>
              )}
            </fieldset>
          </div>
        </aside>
      </div>
      <footer className="gis-workspace-footer">
        <span>
          {s.recipe.aoi?.name ?? 'AOI belum dipilih'} ·{' '}
          {s.recipe.layers.filter((l) => l.visible).length +
            (s.recipe.sketchLayers?.filter((l) => l.visible).length ?? 0)}{' '}
          layer terlihat
        </span>
        <span>
          {s.recipe.viewport.center.map((n) => n.toFixed(4)).join(', ')} · Zoom{' '}
          {s.recipe.viewport.zoom}
        </span>
        <span>Draft lokal · {s.past.length} perubahan dapat dibatalkan</span>
      </footer>
    </div>
  );
}
