"use client";
import ComputeJobCard from "./ComputeJobCard";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import type {
  GISExecutionPlan,
  GISExecutionTrace,
  GISRunResponse,
  GISExecutionContext,
} from "../../lib/gis/copilotContracts";
import type { GISAnalysisConfiguration } from "../../lib/gis/analysisContracts";
import { parseGISRunResponse } from "../../lib/gis/copilotValidation";
import { createAnalysisConfigurationRepository } from "../../lib/gis/analysisRepository";
import { parseAnalysisConfiguration } from "../../lib/gis/analysisConfiguration";
import { canAccessDataset } from "../../lib/gis/recipe";
import { parseRecipe, record } from "../../lib/gis/validation";
const prompts = [
  "Buat peta curah hujan dan kemiringan dengan batas kecamatan",
  "Buatkan peta tutupan lahan area contoh Barat, tambahkan batas kecamatan, gunakan basemap OSM dan buatkan legenda",
  "Tambahkan tutupan lahan dan tanah",
  "Pilih area contoh Barat dan buat legenda",
  "Jelaskan peta yang sedang saya lihat",
  "Inspeksi pixel di pusat peta",
  "Daftar konfigurasi analisis",
  "Hitung luas area contoh Barat",
  "Hitung jarak [103.55, -1.6] ke [103.65, -1.6]",
];
const statusLabels: Record<GISRunResponse["status"], string> = {
  completed: "Selesai",
  preview: "Preview · belum diterapkan",
  "needs-input": "Perlu informasi",
  unsupported: "Belum didukung",
  "approval-required": "Persetujuan diperlukan",
};
export default function CopilotPanel({
  onOpenAnalysis,
}: {
  onOpenAnalysis?: () => void;
}) {
  const s = useWorkspaceStore();
  const [prompt, setPrompt] = useState(""),
    [automatic, setAutomatic] = useState(true);
  const [messages, setMessages] = useState<
    { role: "Anda" | "Copilot DEMO"; text: string }[]
  >([]);
  const [response, setResponse] = useState<GISRunResponse | null>(null),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [libraryWarning, setLibraryWarning] = useState<string | null>(null);
  const [traces, setTraces] = useState<GISExecutionTrace[]>([]);
  const [draftUndo, setDraftUndo] = useState<{
    previous: GISAnalysisConfiguration | null;
  } | null>(null);
  const baseSignature = useRef(""),
    permissionSignature = useRef("");
  const draftSignature = useRef("");
  const approvalConsumed = useRef(false);
  const [approvalDecision, setApprovalDecision] = useState<
    "none" | "saved" | "cancelled"
  >("none");
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  function repository() {
    return createAnalysisConfigurationRepository(
      {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
      },
      useWorkspaceStore.getState().catalog,
    );
  }
  function contextConfigurations() {
    const current = useWorkspaceStore.getState();
    let saved: GISAnalysisConfiguration[] = [];
    try {
      saved = repository().list();
      setLibraryWarning(null);
    } catch (e) {
      setLibraryWarning(
        e instanceof Error ? e.message : "Bibliotek konfigurasi tidak tersedia",
      );
    }
    const combined = [
      ...saved,
      ...(current.recipe.analysisConfiguration
        ? [current.recipe.analysisConfiguration]
        : []),
      ...(current.analysisDraft ? [current.analysisDraft] : []),
    ];
    const byId = new Map<string, GISAnalysisConfiguration>();
    for (const raw of combined) {
      try {
        const c = parseAnalysisConfiguration(raw, current.catalog);
        if (
          c.inputDatasetIds.every((id) => {
            const d = current.catalog.find((d) => d.id === id);
            return d && canAccessDataset(d, current.context);
          })
        )
          byId.set(c.id, c);
      } catch {
        setLibraryWarning(
          "Ada draft/metadata konfigurasi yang berubah; buka panel Analisis untuk memperbaruinya.",
        );
      }
    }
    return [...byId.values()];
  }
  async function ask(value: string, reviewedPlan?: GISExecutionPlan) {
    if (busy || !value.trim()) return;
    const current = useWorkspaceStore.getState();
    const base = JSON.stringify(current.recipe),
      permissions = JSON.stringify(current.context);
    // The workspace regenerates legends with a different key order. Compare
    // validated recipes so read-only results do not become false mutations.
    const canonicalBase = JSON.stringify(
      parseRecipe(current.recipe, current.catalog),
    );
    const configurations = contextConfigurations();
    const env: GISExecutionContext = {
      catalog: current.catalog,
      context: current.context,
      mode: current.mode === "demo" ? "demo" : "unavailable",
      configurations,
    };
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const request = ++sequence.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    setResponse(null);
    setApprovalDecision("none");
    approvalConsumed.current = false;
    if (!reviewedPlan)
      setMessages((m) =>
        [...m, { role: "Anda" as const, text: value }].slice(-24),
      );
    try {
      const r = await fetch("/api/gis/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reviewedPlan
            ? {
                plan: reviewedPlan,
                recipe: current.recipe,
                configurations,
                requestId: reviewedPlan.id,
              }
            : {
                prompt: value,
                requestId: crypto.randomUUID(),
                recipe: current.recipe,
                configurations,
                execution: automatic ? "auto" : "preview",
              },
        ),
        signal: active.signal,
      });
      const raw: unknown = await r.json();
      if (!r.ok)
        throw Error(
          record(raw) && typeof raw.error === "string"
            ? raw.error
            : "Copilot tidak tersedia",
        );
      if (active.signal.aborted || request !== sequence.current) return;
      const latest = useWorkspaceStore.getState();
      if (
        JSON.stringify(latest.recipe) !== base ||
        JSON.stringify(latest.context) !== permissions
      )
        throw Error(
          "Peta atau izin berubah saat permintaan diproses. Hasil lama tidak diterapkan; kirim instruksi baru.",
        );
      const parsed = parseGISRunResponse(raw, env);
      const actualChange = JSON.stringify(parsed.recipe) !== canonicalBase;
      if (
        parsed.changed !== actualChange ||
        (parsed.status !== "completed" && actualChange)
      )
        throw Error("Respons perubahan sesi tidak konsisten");
      if (parsed.changed)
        latest.replace(
          parsed.recipe,
          `Copilot DEMO: ${parsed.plan.steps.map((step) => step.action.tool).join(", ")}`,
          latest.recipe,
        );
      const configuration = parsed.results.findLast(
        (r) => r.data.kind === "configuration",
      );
      if (configuration?.data.kind === "configuration") {
        setDraftUndo({ previous: latest.analysisDraft });
        latest.setAnalysisDraft(configuration.data.configuration);
      }
      const pixels = parsed.results.flatMap((r) =>
        r.data.kind === "pixels" ? r.data.samples : [],
      );
      if (pixels.length) latest.setSamples(pixels);
      setResponse(parsed);
      baseSignature.current = JSON.stringify(
        useWorkspaceStore.getState().recipe,
      );
      permissionSignature.current = permissions;
      draftSignature.current = JSON.stringify(
        useWorkspaceStore.getState().analysisDraft,
      );
      setTraces((t) => [...t, parsed.trace].slice(-20));
      setMessages((m) =>
        [
          ...m,
          { role: "Copilot DEMO" as const, text: parsed.plan.message },
        ].slice(-24),
      );
      setPrompt("");
      if (parsed.status === "completed")
        setNotice(
          parsed.changed
            ? "Perubahan otomatis diterapkan ke sesi. Undo/Redo tersedia."
            : "Pembacaan/draft selesai; tidak ada penulisan permanen otomatis.",
        );
    } catch (e) {
      if (!active.signal.aborted) {
        const reason = e instanceof Error ? e.message : "Permintaan gagal";
        setError(reason);
        setMessages((m) =>
          [
            ...m,
            {
              role: "Copilot DEMO" as const,
              text: `Permintaan gagal: ${reason} Tidak ada perubahan sesi diterapkan.`,
            },
          ].slice(-24),
        );
      }
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  function applyPreview() {
    if (!response || response.status !== "preview") return;
    if (
      JSON.stringify(useWorkspaceStore.getState().recipe) !==
      baseSignature.current
    ) {
      setError("Peta berubah sejak preview dibuat. Minta rencana baru.");
      return;
    }
    void ask("Terapkan rencana yang ditinjau", response.plan);
  }
  function approveLocalSave() {
    if (approvalConsumed.current) return;
    const approval = response?.approval;
    if (
      !approval?.supported ||
      approval.tool !== "requestConfigurationSave" ||
      !approval.configuration
    )
      return;
    try {
      const current = useWorkspaceStore.getState();
      if (
        JSON.stringify(current.recipe) !== baseSignature.current ||
        JSON.stringify(current.context) !== permissionSignature.current ||
        JSON.stringify(current.analysisDraft) !== draftSignature.current
      )
        throw Error("Peta, izin atau draft berubah; minta persetujuan baru.");
      const c = parseAnalysisConfiguration(
        approval.configuration,
        current.catalog,
      );
      if (
        c.inputDatasetIds.some((id) => {
          const d = current.catalog.find((d) => d.id === id);
          return !d || !canAccessDataset(d, current.context);
        })
      )
        throw Error("Akses konfigurasi ditolak");
      approvalConsumed.current = true;
      const saved = repository().save(c);
      current.setAnalysisDraft(saved);
      setApprovalDecision("saved");
      setNotice(
        `Disetujui dan disimpan lokal: ${saved.name} · v${saved.version}.`,
      );
    } catch (e) {
      approvalConsumed.current = false;
      setError(e instanceof Error ? e.message : "Penyimpanan gagal");
    }
  }
  function openConfiguration(c: GISAnalysisConfiguration) {
    s.setAnalysisDraft(c);
    onOpenAnalysis?.();
  }
  const sources = s.recipe.layers
    .map((l) => s.catalog.find((d) => d.id === l.datasetId))
    .filter((d) => !!d);
  return (
    <section className="gis-copilot">
      <h2>
        <Sparkles size={19} />
        AI GIS Copilot
      </h2>
      <span className="gis-tag">PLANNER DEMO DETERMINISTIK</span>
      <p className="gis-muted">
        Controlled Autonomous · Option B. Pembacaan dan perubahan sesi aman
        dapat berjalan otomatis. Belum ada model LLM terhubung atau komputasi
        GEE otomatis.
      </p>
      <div className="gis-context">
        Konteks: {s.recipe.layers.length} layer ·{" "}
        {s.recipe.aoi?.name ?? "AOI belum dipilih"}
        {s.analysisDraft && (
          <p>
            Draft editor: {s.analysisDraft.name} · v{s.analysisDraft.version} ·
            eksperimental
          </p>
        )}
        {s.recipe.analysisConfiguration && (
          <p>
            Konfigurasi resep: {s.recipe.analysisConfiguration.name} · v
            {s.recipe.analysisConfiguration.version} · eksperimental
          </p>
        )}
      </div>
      <label className="gis-copilot-policy">
        <input
          type="checkbox"
          checked={automatic}
          disabled={busy}
          onChange={(e) => setAutomatic(e.target.checked)}
        />
        Otomatis terapkan perubahan sesi
      </label>
      <p className="gis-muted">
        Matikan untuk preview. Menyimpan konfigurasi, publikasi dan operasi
        berbiaya selalu memerlukan persetujuan terpisah.
      </p>
      <div className="gis-prompts">
        {prompts.map((p) => (
          <button
            key={p}
            disabled={busy || s.mode !== "demo"}
            onClick={() => void ask(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="gis-conversation" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`gis-message ${m.role === "Anda" ? "user" : ""}`}
          >
            <small>{m.role}</small>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {response && (
        <div className="gis-plan">
          <h3>Rencana dan aktivitas</h3>
          <p className="gis-copilot-status" role="status">
            {response.status === "approval-required" &&
            approvalDecision !== "none"
              ? approvalDecision === "saved"
                ? "Simpan lokal selesai atas persetujuan Anda"
                : "Persetujuan dibatalkan"
              : statusLabels[response.status]}{" "}
            · {response.plan.steps.length} langkah · {response.trace.elapsedMs}{" "}
            ms
          </p>
          <ol>
            {response.plan.steps.map((step, i) => (
              <li key={step.id}>
                <strong>{step.action.tool}</strong>
                {"datasetId" in step.action
                  ? ` · ${step.action.datasetId}`
                  : ""}
                <small>{response.trace.entries[i]?.summary}</small>
              </li>
            ))}
          </ol>
          {response.status === "preview" && (
            <details>
              <summary>Tinjau parameter rencana</summary>
              <pre className="gis-recipe">
                {JSON.stringify(
                  response.plan.steps.map((s) => s.action),
                  null,
                  2,
                )}
              </pre>
            </details>
          )}
          {response.plan.limitations.map((v, i) => (
            <p className="gis-warning" key={i}>
              {v}
            </p>
          ))}
          {response.status === "preview" && response.plan.steps.length > 0 && (
            <button
              className="gis-button"
              disabled={busy}
              onClick={applyPreview}
            >
              Terapkan ke sesi peta
            </button>
          )}
          {response.approval && approvalDecision === "none" && (
            <div className="gis-copilot-approval">
              <h3>Persetujuan diperlukan</h3>
              <p>{response.approval.reason}</p>
              {response.approval.configuration && (
                <>
                  <p>
                    {response.approval.configuration.name} · v
                    {response.approval.configuration.version} · eksperimental
                  </p>
                  <details>
                    <summary>Tinjau snapshot konfigurasi</summary>
                    <pre className="gis-recipe">
                      {JSON.stringify(response.approval.configuration, null, 2)}
                    </pre>
                  </details>
                </>
              )}
              {response.approval.supported &&
              response.approval.tool === "requestConfigurationSave" ? (
                <button
                  className="gis-button"
                  disabled={busy}
                  onClick={approveLocalSave}
                >
                  Setujui simpan konfigurasi lokal
                </button>
              ) : (
                <p className="gis-muted">
                  Adapter belum tersedia. Operasi backend tetap tidak dapat
                  dijalankan dari Copilot.
                </p>
              )}
              <button
                className="gis-button secondary"
                disabled={busy}
                onClick={() => {
                  setApprovalDecision("cancelled");
                  setNotice(
                    "Persetujuan dibatalkan; tidak ada penyimpanan atau komputasi.",
                  );
                }}
              >
                Batalkan persetujuan
              </button>
            </div>
          )}
          <div className="gis-copilot-results">
            {response.results
              .filter((r) => r.data.kind !== "map-change")
              .map((result) => (
                <article key={result.stepId}>
                  <h4>{result.tool}</h4>
                  <p>{result.summary}</p>
                  {result.data.kind === "compute" && (
                    <ComputeJobCard
                      key={result.data.job.id}
                      initial={result.data.job}
                    />
                  )}
                  {result.data.kind === "datasets" &&
                    result.data.datasets.map((d) => (
                      <p key={d.id}>
                        <strong>{d.title}</strong> ·{" "}
                        {d.status === "demo"
                          ? "DEMO"
                          : d.status === "unavailable"
                            ? "belum tersedia"
                            : "tersedia"}
                        <br />
                        <small>
                          {d.id} · {d.source} · {d.version}
                        </small>
                      </p>
                    ))}
                  {result.data.kind === "metadata" && (
                    <>
                      <p>
                        {result.data.dataset.title} ·{" "}
                        {result.data.dataset.status} ·{" "}
                        {result.data.dataset.version}
                      </p>
                      <p>
                        {result.data.dataset.source} ·{" "}
                        {result.data.dataset.license}
                      </p>
                      {result.data.dataset.raster && (
                        <p>
                          {result.data.dataset.raster.crs} ·{" "}
                          {result.data.dataset.raster.resolution.x} ×{" "}
                          {result.data.dataset.raster.resolution.y}{" "}
                          {result.data.dataset.raster.resolution.unit}
                          <br />
                          {result.data.dataset.raster.bands
                            .map(
                              (b) =>
                                `${b.id} (${b.unit}, scale ${b.scale}, offset ${b.offset})`,
                            )
                            .join(" · ")}
                          <br />
                          {result.data.dataset.raster.period.start}–
                          {result.data.dataset.raster.period.end}
                        </p>
                      )}
                      <p>{result.data.dataset.provenance}</p>
                    </>
                  )}
                  {result.data.kind === "pixels" &&
                    result.data.samples.map((p) => (
                      <div
                        className="gis-copilot-pixel"
                        key={`${p.datasetId}-${p.band}`}
                      >
                        <strong>
                          {p.datasetId} · {p.band}
                        </strong>
                        <p>
                          {p.noData
                            ? `NoData · ${p.noDataReason}`
                            : `${p.value} ${p.unit}${p.classification ? ` · ${p.classification}` : ""}`}
                        </p>
                        <small>
                          {p.crs} · {p.version} · {p.resolution.x}{" "}
                          {p.resolution.unit} ·{" "}
                          {p.demo ? "DEMO" : "provider nyata"}
                          <br />
                          {p.source}
                        </small>
                      </div>
                    ))}
                  {result.data.kind === "configurations" && (
                    <ul>
                      {result.data.configurations.map((c) => (
                        <li key={c.id}>
                          {c.name} · {c.analysisType} · v{c.version} ·
                          eksperimental{" "}
                          <button
                            disabled={busy}
                            onClick={() =>
                              void ask(`Pilih konfigurasi "${c.id}"`)
                            }
                          >
                            Pilih {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.data.kind === "configuration" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void ask(
                          `Jalankan konfigurasi "${result.data.kind === "configuration" ? result.data.configuration.id : ""}"`,
                        )
                      }
                    >
                      Jalankan konfigurasi
                    </button>
                  )}
                  {result.data.kind === "configuration" && (
                    <>
                      <p>
                        {result.data.configuration.name} · v
                        {result.data.configuration.version} · eksperimental ·
                        belum disimpan otomatis
                      </p>
                      <div className="gis-config-actions">
                        <button
                          className="gis-button secondary"
                          onClick={() =>
                            openConfiguration(
                              result.data.kind === "configuration"
                                ? result.data.configuration
                                : s.analysisDraft!,
                            )
                          }
                        >
                          Buka draft di Analisis
                        </button>
                        <button
                          disabled={busy}
                          className="gis-button secondary"
                          onClick={() =>
                            void ask(
                              `Siapkan konfigurasi "${result.data.kind === "configuration" ? result.data.configuration.id : ""}"`,
                            )
                          }
                        >
                          Siapkan request konfigurasi
                        </button>
                        <button
                          disabled={busy}
                          className="gis-button secondary"
                          onClick={() =>
                            void ask(
                              `Simpan konfigurasi "${result.data.kind === "configuration" ? result.data.configuration.id : ""}"`,
                            )
                          }
                        >
                          Minta simpan lokal
                        </button>
                      </div>
                    </>
                  )}
                  {result.data.kind === "preparation" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void ask(
                          `Jalankan konfigurasi "${result.data.kind === "preparation" ? result.data.configuration.id : ""}"`,
                        )
                      }
                    >
                      Jalankan melalui kontrol komputasi
                    </button>
                  )}
                  {result.data.kind === "preparation" && (
                    <>
                      <p>{result.data.reason}</p>
                      <p>
                        {result.data.configuration.name} · eksperimental ·{" "}
                        {result.data.executable
                          ? "parameter siap"
                          : "adapter/AOI belum tersedia"}
                      </p>
                      <button
                        className="gis-button secondary"
                        onClick={() =>
                          openConfiguration(
                            result.data.kind === "preparation"
                              ? result.data.configuration
                              : s.analysisDraft!,
                          )
                        }
                      >
                        Buka konfigurasi untuk eksekusi eksplisit
                      </button>
                      {result.data.request !== null && (
                        <details>
                          <summary>Request analisis · belum dijalankan</summary>
                          <pre className="gis-recipe">
                            {JSON.stringify(result.data.request, null, 2)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                </article>
              ))}
          </div>
        </div>
      )}
      {draftUndo && (
        <button
          className="gis-button secondary"
          disabled={busy}
          onClick={() => {
            s.setAnalysisDraft(draftUndo.previous);
            setDraftUndo(null);
            setNotice("Draft AI dibatalkan; repository tetap tidak berubah.");
          }}
        >
          Batalkan draft AI
        </button>
      )}
      {notice && (
        <p className="gis-context" role="status">
          {notice}
        </p>
      )}
      {libraryWarning && <p className="gis-warning">{libraryWarning}</p>}
      {error && (
        <p className="gis-error" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(prompt);
        }}
      >
        <label htmlFor="gis-prompt">Instruksi GIS</label>
        <textarea
          id="gis-prompt"
          maxLength={2000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Buat peta tutupan lahan area contoh Barat…"
          rows={3}
        />
        <div className="gis-config-actions">
          <button
            className="gis-button"
            disabled={busy || !prompt.trim() || s.mode !== "demo"}
          >
            {busy ? "Memproses…" : "Kirim instruksi"}
            <Send size={15} />
          </button>
          {busy && (
            <button
              type="button"
              className="gis-button secondary"
              onClick={() => {
                controller.current?.abort();
                sequence.current++;
                setBusy(false);
                setNotice(
                  "Permintaan dibatalkan; respons terlambat tidak diterapkan.",
                );
              }}
            >
              Batalkan permintaan AI
            </button>
          )}
        </div>
      </form>
      <details>
        <summary>Sumber layer saat ini</summary>
        {sources.map((d) => (
          <p className="gis-muted" key={d.id}>
            {d.title} · {d.source} · {d.version} · {d.status}
          </p>
        ))}
      </details>
      <details>
        <summary>Riwayat eksekusi AI ({traces.length})</summary>
        {traces
          .slice()
          .reverse()
          .map((t) => (
            <div key={t.id}>
              <strong>
                {statusLabels[t.status]} · {t.entries.length} langkah ·{" "}
                {t.elapsedMs} ms
              </strong>
              <p className="gis-muted">
                {t.id} ·{" "}
                {t.provider.mode === "demo" ? "DEMO" : "provider nyata"}
              </p>
              <ol>
                {t.entries.map((e) => (
                  <li key={e.stepId}>
                    {e.tool} · {e.level} · {e.status}
                  </li>
                ))}
              </ol>
            </div>
          ))}
      </details>
      <details>
        <summary>Aktivitas sesi ({s.log.length})</summary>
        {s.log.map((v, i) => (
          <p className="gis-muted" key={i}>
            {v}
          </p>
        ))}
      </details>
    </section>
  );
}
