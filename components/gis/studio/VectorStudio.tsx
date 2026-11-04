"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Check,
  Download,
  FolderOpen,
  Layers,
  Map as MapIcon,
  Sparkles,
  Undo2,
  Redo2,
  Save,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Plus,
} from "lucide-react";
import type {
  VectorFeature,
  VectorCollection,
} from "../../../lib/gis/studio/model";
import {
  BASEMAPS,
  check,
  exportVector,
  fields,
  freshDocument,
  parseDocument,
  visibleFeatures,
  STUDIO_LIMITS,
  type Source,
  type StudioDocument,
  type StudioLayer,
} from "../../../lib/gis/studio/model";
import {
  applyStudioPlan,
  importDocumentText,
  localRulePlan,
  studioContext,
  validateActions,
  type StudioPlan,
} from "../../../lib/gis/studio/plans";
import {
  listStudioDocuments,
  loadStudioDocument,
  saveStudioDocument,
} from "../../../lib/gis/studio/storage";
const StudioMap = dynamic(() => import("./StudioMap"), {
  ssr: false,
  loading: () => (
    <div className="studio-map-placeholder">Memuat peta vektor…</div>
  ),
});
type Selection = { layer: StudioLayer; feature: VectorFeature };
type ImportResult = {
  ok: true;
  data: VectorCollection;
  originalCRS: string;
  format: "geojson" | "shapefile";
  files: Source["files"];
};
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function VectorStudio() {
  const [doc, setDoc] = useState<StudioDocument>(freshDocument),
    [past, setPast] = useState<StudioDocument[]>([]),
    [future, setFuture] = useState<StudioDocument[]>([]),
    [active, setActive] = useState(""),
    [selected, setSelected] = useState<Selection | null>(null),
    [coordinate, setCoordinate] = useState<[number, number] | null>(null),
    [message, setMessage] = useState(
      "Impor hasil vektor ArcGIS atau buka dokumen peta. Tidak ada dataset yayasan yang dimuat otomatis.",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mapIssue, setMapIssue] = useState(""),
    [citation, setCitation] = useState(
      "Berkas pengguna; asal belum dikonfirmasi",
    ),
    [license, setLicense] = useState("Izin penggunaan belum dikonfirmasi"),
    [arcgis, setArcgis] = useState(true),
    [prompt, setPrompt] = useState(""),
    [engine, setEngine] = useState<"rules" | "ollama">("rules"),
    [aiEnabled, setAIEnabled] = useState(false),
    [consent, setConsent] = useState(false),
    [plan, setPlan] = useState<StudioPlan | null>(null),
    [saved, setSaved] = useState<
      { key: string; title: string; updatedAt: string }[]
    >([]),
    [tab, setTab] = useState<"import" | "style" | "assistant" | "source">(
      "import",
    );
  const fileInput = useRef<HTMLInputElement>(null),
    documentInput = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    aiRequest = useRef<AbortController | null>(null);
  const layer = doc.layers.find((l) => l.id === active) ?? doc.layers[0];
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/gis/studio-plan", { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAIEnabled(d?.enabled === true))
      .catch(() => {});
    return () => {
      c.abort();
      worker.current?.terminate();
      aiRequest.current?.abort();
    };
  }, []);
  function commit(next: StudioDocument) {
    setPast((p) => [...p, doc].slice(-20));
    setFuture([]);
    setDoc({
      ...next,
      revision: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    });
    setSelected(null);
    setCoordinate(null);
    setError("");
  }
  function changeLayer(patch: Partial<StudioLayer>) {
    if (!layer) return;
    commit({
      ...doc,
      focus: null,
      layers: doc.layers.map((l) =>
        l.id === layer.id ? { ...l, ...patch } : l,
      ),
    });
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((f) => [doc, ...f]);
    setPast((p) => p.slice(0, -1));
    setDoc(previous);
    setSelected(null);
    setError("");
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, doc]);
    setFuture((f) => f.slice(1));
    setDoc(next);
    setSelected(null);
    setError("");
  }
  async function action(fn: () => Promise<void> | void) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operasi gagal.");
    }
  }
  async function importFiles(files: File[]) {
    check(
      files.length > 0 && files.length <= 5,
      "Pilih satu paket dengan maksimum lima komponen.",
    );
    check(doc.layers.length < STUDIO_LIMITS.layers, "Maksimum delapan layer.");
    check(
      files.reduce((n, f) => n + f.size, 0) <= STUDIO_LIMITS.bytes,
      "Ukuran maksimum 10 MiB.",
    );
    check(
      citation.trim() && license.trim(),
      "Catat sumber dan status izin terlebih dahulu.",
    );
    setBusy(true);
    try {
      const parts = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          bytes: await f.arrayBuffer(),
        })),
      );
      const result = await new Promise<ImportResult>((resolve, reject) => {
        const w = new Worker(
          new URL("../../../lib/gis/studio/import.worker.ts", import.meta.url),
        );
        worker.current = w;
        const finish = () => {
          clearTimeout(timeout);
          w.terminate();
          worker.current = null;
        };
        const timeout = setTimeout(() => {
          finish();
          reject(
            Error(
              "Impor melebihi 15 detik. Sederhanakan atau bagi layer di ArcGIS.",
            ),
          );
        }, 15000);
        w.onerror = () => {
          finish();
          reject(Error("Parser berkas gagal. Periksa format dan CRS."));
        };
        w.onmessage = (e) => {
          finish();
          if (e.data?.ok === true) resolve(e.data);
          else
            reject(
              Error(
                typeof e.data?.error === "string"
                  ? e.data.error
                  : "Format berkas tidak sah.",
              ),
            );
        };
        w.postMessage(
          { parts },
          parts.map((p) => p.bytes),
        );
      });
      const id = crypto.randomUUID();
      const imported: StudioLayer = {
        id,
        name: files[0].name.replace(
          /\.(zip|geojson|json|shp|dbf|shx|prj|cpg)$/i,
          "",
        ),
        visible: true,
        color: "#168178",
        opacity: 0.9,
        filter: null,
        data: result.data,
        source: {
          kind: "user-vector",
          format: result.format,
          files: result.files,
          importedAt: new Date().toISOString(),
          originalCRS: result.originalCRS,
          outputCRS: "OGC:CRS84",
          processing: arcgis ? "user-declared-ArcGIS" : "not-specified",
          citation: citation.trim(),
          license: license.trim(),
        },
      };
      const next = parseDocument({
        ...doc,
        layers: [...doc.layers, imported],
        focus: id,
      });
      commit(next);
      setActive(id);
      setTab("style");
      setMessage(
        `${imported.data.features.length} fitur diimpor. Geometri/atribut dipertahankan; bukan dihitung ulang. ${imported.data.features.filter((f) => f.geometry === null).length} fitur memiliki geometri kosong.`,
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function planChanges() {
    check(prompt.trim(), "Tuliskan instruksi.");
    setPlan(null);
    if (engine === "rules") {
      setPlan(localRulePlan(prompt, doc, layer));
      return;
    }
    check(
      consent,
      "Setujui pengiriman instruksi dan metadata layer ke model pada server aplikasi.",
    );
    setBusy(true);
    const c = new AbortController();
    aiRequest.current = c;
    try {
      const r = await fetch("/api/gis/studio-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          context: studioContext(doc),
          metadataConsent: consent,
        }),
        signal: c.signal,
      });
      const body = await r.json();
      check(r.ok, body.error || "Model AI tidak tersedia.");
      const p = body.plan as StudioPlan;
      check(
        p.documentId === doc.id && p.revision === doc.revision,
        "Identitas rencana berbeda.",
      );
      validateActions(p.actions, studioContext(doc));
      setPlan(p);
    } finally {
      setBusy(false);
      aiRequest.current = null;
    }
  }
  function moveLayer(delta: number) {
    if (!layer) return;
    const list = [...doc.layers],
      i = list.findIndex((l) => l.id === layer.id),
      target = i + delta;
    if (target < 0 || target >= list.length) return;
    [list[i], list[target]] = [list[target], list[i]];
    commit({ ...doc, layers: list, focus: null });
  }
  const shown = useMemo(
    () => (layer ? visibleFeatures(layer).features : []),
    [layer],
  );
  const columns = useMemo(() => (layer ? fields(layer) : []), [layer]);
  return (
    <div className="studio">
      <header className="studio-heading">
        <div>
          <span className="studio-eyebrow">P4I / VECTOR MAP STUDIO</span>
          <h1>Data Anda. Peta yang dapat dijelaskan.</h1>
          <p>
            Susun hasil ArcGIS, periksa atribut, dan tinjau bantuan AI sebelum
            menerapkannya.
          </p>
        </div>
        <span className="studio-badge">
          <Check size={14} />
          Vektor pengguna tetap lokal
        </span>
      </header>
      <fieldset disabled={busy} className="studio-controls">
        <div className="studio-note">
          Overlay, pembobotan dan penilaian tetap dilakukan di ArcGIS. Studio
          menyusun tampilan dari data hasilnya. Tidak ada skor yang dibuat dari
          nama wilayah atau warna piksel.
        </div>
        <div className="studio-document-bar">
          <label>
            Judul peta
            <input
              aria-label="Judul dokumen peta"
              key={doc.title}
              defaultValue={doc.title}
              maxLength={200}
              onBlur={(e) => {
                const title = e.target.value.trim();
                if (title && title !== doc.title)
                  commit({ ...doc, title, focus: null });
              }}
            />
          </label>
          <div className="studio-buttons">
            <button
              title="Undo"
              aria-label="Undo perubahan studio"
              onClick={undo}
              disabled={!past.length}
            >
              <Undo2 size={16} />
            </button>
            <button
              title="Redo"
              aria-label="Redo perubahan studio"
              onClick={redo}
              disabled={!future.length}
            >
              <Redo2 size={16} />
            </button>
            <button
              onClick={() =>
                void action(async () => {
                  await saveStudioDocument(doc);
                  setMessage(
                    "Snapshot tersimpan di browser ini. Belum tersinkron ke akun/proyek yayasan.",
                  );
                })
              }
            >
              <Save size={15} />
              Simpan browser
            </button>
            <button
              onClick={() =>
                void action(async () => {
                  setSaved(await listStudioDocuments());
                  setMessage("Pilih snapshot pada daftar tersimpan di bawah.");
                })
              }
            >
              <FolderOpen size={15} />
              Buka browser
            </button>
            <button onClick={() => download(doc, "peta-p4i.p4imap.json")}>
              <Download size={15} />
              Dokumen peta
            </button>
            <button onClick={() => documentInput.current?.click()}>
              Buka dokumen
            </button>
            <button
              onClick={() => {
                const clone = {
                  ...doc,
                  id: crypto.randomUUID(),
                  title: doc.title + " (salinan)",
                  focus: null,
                };
                commit(clone);
                setMessage("Salinan peta dibuat. Data sumber tetap sama.");
              }}
            >
              <Copy size={15} />
              Salin
            </button>
            <button
              onClick={() => {
                commit(freshDocument());
                setMessage(
                  "Peta baru dibuat. Undo dapat mengembalikan peta sebelumnya.",
                );
              }}
            >
              <Plus size={15} />
              Baru
            </button>
          </div>
        </div>
        <input
          ref={documentInput}
          type="file"
          accept=".json"
          hidden
          aria-label="Pilih dokumen peta tersimpan"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void action(async () => {
                check(f.size <= 25 * 1024 * 1024, "Dokumen melebihi 25 MiB.");
                commit({
                  ...importDocumentText(await f.text()),
                  basemap: "none",
                });
                setMessage(
                  "Dokumen dipulihkan. Peta dasar daring perlu Anda aktifkan kembali.",
                );
              });
            e.currentTarget.value = "";
          }}
        />
        {saved.length > 0 && (
          <details className="studio-saved" open>
            <summary>Snapshot browser ({saved.length})</summary>
            {saved.map((s) => (
              <button
                key={s.key}
                onClick={() =>
                  void action(async () => {
                    const restored = await loadStudioDocument(s.key);
                    commit({ ...restored, basemap: "none" });
                    setSaved([]);
                    setMessage(
                      "Snapshot dimuat. Basemap daring tetap nonaktif sampai dipilih kembali.",
                    );
                  })
                }
              >
                {s.title} · {new Date(s.updatedAt).toLocaleString("id-ID")}
              </button>
            ))}
          </details>
        )}
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        <p className="studio-status" role="status">
          {busy ? "Memproses…" : message}
        </p>
        <div className="studio-grid">
          <aside className="studio-layer-panel">
            <div className="studio-panel-title">
              <Layers size={17} />
              <h2>Layer hasil</h2>
              <span>{doc.layers.length}/8</span>
            </div>
            <p className="studio-hint">
              Urutan terakhir digambar paling atas. Filter mengubah tampilan dan
              ekspor, bukan data sumber.
            </p>
            {doc.layers.length === 0 && (
              <div className="studio-empty">
                <MapIcon size={32} />
                <p>Belum ada data yayasan.</p>
                <small>Impor berkas berizin pada panel kanan.</small>
              </div>
            )}
            {doc.layers.map((l) => (
              <div
                key={l.id}
                className={`studio-layer ${layer?.id === l.id ? "selected" : ""}`}
              >
                <button
                  aria-label={`${l.visible ? "Sembunyikan" : "Tampilkan"} ${l.name}`}
                  onClick={() =>
                    commit({
                      ...doc,
                      focus: null,
                      layers: doc.layers.map((x) =>
                        x.id === l.id ? { ...x, visible: !x.visible } : x,
                      ),
                    })
                  }
                >
                  {l.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  className="studio-layer-name"
                  aria-pressed={layer?.id === l.id}
                  onClick={() => setActive(l.id)}
                >
                  <i style={{ background: l.color }} />
                  {l.name}
                  <small>
                    {visibleFeatures(l).features.length}/
                    {l.data.features.length} fitur ·{" "}
                    {l.source.kind === "synthetic"
                      ? "SINTETIS"
                      : "berkas pengguna"}
                  </small>
                </button>
              </div>
            ))}
            {layer && (
              <div className="studio-buttons">
                <button
                  aria-label="Naikkan layer"
                  onClick={() => moveLayer(-1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  aria-label="Turunkan layer"
                  onClick={() => moveLayer(1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button onClick={() => commit({ ...doc, focus: layer.id })}>
                  Fokus layer
                </button>
                <button
                  aria-label="Hapus layer dari peta"
                  onClick={() =>
                    commit({
                      ...doc,
                      focus: null,
                      layers: doc.layers.filter((l) => l.id !== layer.id),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
            <div className="studio-basemap">
              <h3>Peta dasar dunia</h3>
              <label>
                Sumber tampilan
                <select
                  aria-label="Peta dasar"
                  value={doc.basemap}
                  onChange={(e) =>
                    commit({
                      ...doc,
                      basemap: e.target.value as "none" | "osm",
                      focus: null,
                    })
                  }
                >
                  <option value="none">Tanpa peta dasar · lokal</option>
                  <option value="osm">OpenStreetMap · tile daring</option>
                </select>
              </label>
              <p>{BASEMAPS[doc.basemap].source}</p>
              <small>
                OSM menggunakan gambar tile untuk latar. Layer Anda tetap
                vektor. Saat diaktifkan, tile area yang terlihat diminta ke
                server OSM; tidak mengirim berkas yayasan.
              </small>
              <a
                href={BASEMAPS.osm.attributionURL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Sumber & lisensi OpenStreetMap ↗
              </a>
            </div>
          </aside>
          <section className="studio-map-panel">
            <div className="studio-map-top">
              <span>{doc.title}</span>
              <span>
                {doc.basemap === "none"
                  ? "TANPA TILE EKSTERNAL"
                  : "OPENSTREETMAP / LATAR"}
              </span>
            </div>
            <StudioMap
              doc={doc}
              onSelect={setSelected}
              onCoordinate={setCoordinate}
              onIssue={setMapIssue}
            />
            {mapIssue && (
              <p className="studio-error" role="alert">
                {mapIssue}
              </p>
            )}
            <div className="studio-legend">
              {doc.layers
                .filter((l) => l.visible)
                .map((l) => (
                  <span key={l.id}>
                    <i style={{ background: l.color }} />
                    {l.name}
                  </span>
                ))}
            </div>
            {coordinate && (
              <p className="studio-hint">
                Klik koordinat {coordinate[0].toFixed(6)},{" "}
                {coordinate[1].toFixed(6)}. Gambar basemap tidak menyediakan
                atribut/ukuran piksel ilmiah di sini. Klik fitur vektor untuk
                membaca atribut.
              </p>
            )}
          </section>
          <aside className="studio-tools">
            <div
              className="studio-tool-tabs"
              role="group"
              aria-label="Panel studio"
            >
              {(["import", "style", "assistant", "source"] as const).map(
                (t) => (
                  <button
                    key={t}
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {
                      {
                        import: "Impor",
                        style: "Tampilan",
                        assistant: "AI & aturan",
                        source: "Sumber",
                      }[t]
                    }
                  </button>
                ),
              )}
            </div>
            {tab === "import" && (
              <section>
                <h2>Buka hasil ArcGIS</h2>
                <p>
                  GeoJSON WGS84 atau ZIP berisi satu .shp, .shx, .dbf, .prj pada
                  root. Komponen terpisah juga dapat dipilih bersamaan.
                </p>
                <label>
                  Asal data / keterangan
                  <input
                    value={citation}
                    maxLength={1000}
                    onChange={(e) => setCitation(e.target.value)}
                  />
                </label>
                <label>
                  Lisensi / status izin
                  <input
                    value={license}
                    maxLength={1000}
                    onChange={(e) => setLicense(e.target.value)}
                  />
                </label>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={arcgis}
                    onChange={(e) => setArcgis(e.target.checked)}
                  />
                  Saya menyatakan berkas ini hasil pengerjaan ArcGIS
                </label>
                <p className="studio-hint">
                  Pernyataan asal tidak diverifikasi otomatis. Tidak menambahkan
                  data contoh sebagai data yayasan.
                </p>
                <button
                  className="studio-primary"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <FolderOpen size={16} />
                  Pilih berkas vektor
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".geojson,.json,.zip,.shp,.shx,.dbf,.prj,.cpg"
                  hidden
                  aria-label="Pilih paket vektor"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    void action(() => importFiles(files));
                  }}
                />
                <p className="studio-hint">
                  Maks 10 MiB, 10.000 fitur total, 150.000 vertex per layer.
                  Impor dijalankan dalam worker dengan batas waktu. Simbologi
                  .lyrx/.aprx perlu disusun kembali; tidak ikut terbaca dari
                  SHP.
                </p>
              </section>
            )}
            {tab === "style" && (
              <section>
                <h2>Tampilan layer</h2>
                {layer ? (
                  <>
                    <label>
                      Nama layer
                      <input
                        key={layer.id + layer.name}
                        defaultValue={layer.name}
                        maxLength={160}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== layer.name)
                            changeLayer({ name });
                        }}
                      />
                    </label>
                    <label>
                      Warna
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) => changeLayer({ color: e.target.value })}
                      />
                    </label>
                    <label>
                      Opasitas {Math.round(layer.opacity * 100)}%
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step=".1"
                        value={layer.opacity}
                        onChange={(e) =>
                          changeLayer({ opacity: Number(e.target.value) })
                        }
                      />
                    </label>
                    <p>
                      {shown.length} dari {layer.data.features.length} fitur
                      ditampilkan.
                    </p>
                    {layer.filter && (
                      <p>
                        Filter: {layer.filter.field} ={" "}
                        {JSON.stringify(layer.filter.equals)}{" "}
                        <button onClick={() => changeLayer({ filter: null })}>
                          Hapus filter
                        </button>
                      </p>
                    )}
                    <p className="studio-hint">
                      Gunakan panel aturan untuk filter atribut. GeoJSON
                      mempertahankan geometri dan atribut sumber, termasuk Z
                      bila ada.
                    </p>
                    <button
                      className="studio-primary"
                      onClick={() =>
                        download(exportVector(doc), "peta-p4i-hasil.geojson")
                      }
                    >
                      <Download size={15} />
                      Ekspor layer terlihat + provenance
                    </button>
                  </>
                ) : (
                  <p>Pilih atau impor layer.</p>
                )}
              </section>
            )}
            {tab === "assistant" && (
              <section>
                <span className="studio-eyebrow">
                  <Sparkles size={14} />
                  PERUBAHAN YANG DITINJAU
                </span>
                <h2>Rancang peta dengan bantuan</h2>
                <label>
                  Mesin perencana
                  <select
                    value={engine}
                    onChange={(e) => {
                      setEngine(e.target.value as typeof engine);
                      setPlan(null);
                    }}
                  >
                    <option value="rules">Aturan lokal · bukan LLM</option>
                    <option value="ollama" disabled={!aiEnabled}>
                      Model AI lokal{" "}
                      {aiEnabled
                        ? "· perlu akun aktif"
                        : "· belum dikonfigurasi"}
                    </option>
                  </select>
                </label>
                <p className="studio-hint">
                  AI mengusulkan judul, warna, filter, visibilitas dan fokus.
                  Tidak membuat data geografis, overlay atau penilaian baru.
                </p>
                <label>
                  Instruksi
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={1500}
                    rows={4}
                    placeholder="judul: Peta Program P4I"
                  />
                </label>
                <p className="studio-hint">
                  Aturan: judul: … / warna: #146b70 / fokus / filter: nama_field
                  = nilai / hapus filter / sembunyikan / tampilkan.
                </p>
                {engine === "ollama" && (
                  <label className="studio-check">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    Izinkan instruksi, nama layer dan nama kolom dikirim ke
                    model pada server. Koordinat, geometri dan baris atribut
                    tidak disertakan.
                  </label>
                )}
                <button
                  className="studio-primary"
                  disabled={busy || !prompt.trim()}
                  onClick={() => void action(planChanges)}
                >
                  Buat rencana
                </button>
                {plan && (
                  <div className="studio-proposal">
                    <strong>
                      {plan.provider === "rules"
                        ? "ATURAN LOKAL"
                        : "MODEL AI: " + plan.model}
                    </strong>
                    <p>{plan.message}</p>
                    <pre>{JSON.stringify(plan.actions, null, 2)}</pre>
                    <button
                      onClick={() =>
                        void action(() => {
                          commit(applyStudioPlan(doc, plan));
                          setPlan(null);
                          setMessage(
                            "Rencana diterapkan sebagai satu perubahan. Undo tersedia.",
                          );
                        })
                      }
                    >
                      Tinjau dan terapkan
                    </button>
                    <button onClick={() => setPlan(null)}>Batalkan</button>
                  </div>
                )}
                <p className="studio-hint">
                  {aiEnabled
                    ? "Model lokal dikonfigurasi operator; keberhasilan inferensi belum dijamin."
                    : "Integrasi model nyata belum aktif. Aturan lokal tetap dapat digunakan dengan label yang berbeda."}
                </p>
              </section>
            )}
            {tab === "source" && (
              <section>
                <h2>Asal yang dapat diperiksa</h2>
                {layer ? (
                  <>
                    <dl>
                      <dt>Layer</dt>
                      <dd>{layer.name}</dd>
                      <dt>Kategori</dt>
                      <dd>
                        {layer.source.kind === "synthetic"
                          ? "SINTETIS"
                          : "Berkas pengguna"}
                      </dd>
                      <dt>Sumber</dt>
                      <dd>{layer.source.citation}</dd>
                      <dt>Izin</dt>
                      <dd>{layer.source.license}</dd>
                      <dt>Pengerjaan asal</dt>
                      <dd>
                        {layer.source.processing === "user-declared-ArcGIS"
                          ? "ArcGIS — pernyataan pengguna"
                          : "Belum dinyatakan"}
                      </dd>
                      <dt>CRS asli</dt>
                      <dd>{layer.source.originalCRS}</dd>
                      <dt>CRS tampilan data</dt>
                      <dd>{layer.source.outputCRS}</dd>
                    </dl>
                    {layer.source.files.map((f) => (
                      <div className="studio-hash" key={f.name}>
                        <strong>{f.name}</strong>
                        <small>
                          {f.bytes.toLocaleString("id-ID")} byte · SHA-256
                        </small>
                        <code>{f.sha256}</code>
                      </div>
                    ))}
                  </>
                ) : (
                  <p>Impor data untuk melihat sumber.</p>
                )}
                <p className="studio-hint">
                  Hash merekam identitas berkas, bukan membuktikan kebenaran
                  survei atau izin penggunaannya.
                </p>
              </section>
            )}
          </aside>
        </div>
        <section className="studio-table-panel">
          <div className="studio-panel-title">
            <h2>
              {selected ? "Objek yang dipilih" : "Tabel atribut"}
              {layer ? " · " + layer.name : ""}
            </h2>
            <button onClick={() => setSelected(null)}>Tampilkan tabel</button>
          </div>
          {selected ? (
            <div>
              <p>
                {selected.layer.name} ·{" "}
                {selected.feature.geometry?.type ?? "Geometri kosong"}
              </p>
              <pre>{JSON.stringify(selected.feature.properties, null, 2)}</pre>
              <p className="studio-hint">
                Sumber: {selected.layer.source.citation}
              </p>
            </div>
          ) : (
            <div className="studio-table-scroll">
              {layer ? (
                <table>
                  <caption>
                    {shown.length} fitur cocok; tabel menampilkan 100 pertama
                    dan maksimum 10 kolom. Ekspor menyertakan semua atribut.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Fitur</th>
                      <th scope="col">Geometri</th>
                      {columns.slice(0, 10).map((c) => (
                        <th scope="col" key={c}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, 100).map((f, i) => (
                      <tr key={i}>
                        <td>
                          <button
                            onClick={() => setSelected({ layer, feature: f })}
                          >
                            {String(f.id ?? i + 1)}
                          </button>
                        </td>
                        <td>{f.geometry?.type ?? "Kosong"}</td>
                        {columns.slice(0, 10).map((c) => (
                          <td key={c}>
                            {f.properties?.[c] === undefined
                              ? "—"
                              : JSON.stringify(f.properties[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>
                  Data atribut akan muncul setelah impor. Tidak mengambil nilai
                  dari warna peta dasar.
                </p>
              )}
            </div>
          )}
        </section>
        <p className="studio-footnote">
          Penyimpanan browser dan unduhan dokumen sudah disediakan. Katalog
          bersama, hak akses proyek dan publikasi ke server membutuhkan
          integrasi backend terpisah.{" "}
          <Link href="/spatial/viewer">Buka workspace lama</Link>
        </p>
      </fieldset>
    </div>
  );
}
