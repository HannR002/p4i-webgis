'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useMapStore } from '../../store/useMapStore';
import type {
  GISAnalysisConfiguration,
  GISAnalysisType,
  ClassificationMapping,
} from '../../lib/gis/analysisContracts';
import type { RasterProcessingResult } from '../../lib/gis/contracts';
import {
  ANALYSIS_TYPES,
  UNSUPPORTED_CONFIGURATION_TYPES,
  defaultConfiguration,
  parseAnalysisConfiguration,
  refreshConfigurationSources,
  MAX_CONFIGURATION_BYTES,
} from '../../lib/gis/analysisConfiguration';
import { createAnalysisConfigurationRepository } from '../../lib/gis/analysisRepository';
import { prepareConfigurationApplication } from '../../lib/gis/analysisApplication';
import { parseProcessingResult } from '../../lib/gis/processingValidation';
import { record } from '../../lib/gis/validation';
import { transformCoordinate } from '../../lib/gis/raster';
import { DEMO_AOIS } from '../../lib/gis/catalog';
import {
  calculateLegacyWLC,
  calculatePreferences,
  DEFAULT_PAIRWISE,
  PREFERENCE_CRITERIA,
} from '../../utils/analysisPreferences';
import { DEFAULT_FLOOD_WEIGHTS } from '../../config/floodRiskModel';

const subscribeToBrowser = () => () => {};
export default function AnalysisConfigurationPanel() {
  const browserReady = useSyncExternalStore(
    subscribeToBrowser,
    () => true,
    () => false,
  );
  const s = useWorkspaceStore();
  const map = useMapStore();
  const [draft, setDraft] = useState<GISAnalysisConfiguration>(
    () =>
      s.analysisDraft ?? defaultConfiguration('ahp-smce', s.catalog, s.recipe),
  );
  const [rulesText, setRulesText] = useState(() =>
    JSON.stringify(draft.classificationRules, null, 2),
  );
  const [saved, setSaved] = useState<GISAnalysisConfiguration[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RasterProcessingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const repository = useMemo(
    () =>
      typeof window === 'undefined' || s.mode === 'loading'
        ? null
        : createAnalysisConfigurationRepository(
            {
              getItem: (key) => window.localStorage.getItem(key),
              setItem: (key, value) => window.localStorage.setItem(key, value),
            },
            s.catalog,
          ),
    [s.catalog, s.mode],
  );
  useEffect(() => {
    let active = true;
    async function read() {
      await Promise.resolve();
      try {
        const list = repository?.list() ?? [];
        if (active) setSaved(list);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : 'Penyimpanan tidak tersedia',
          );
      }
    }
    void read();
    const refresh = () => {
      void read();
    };
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      controller.current?.abort();
      window.removeEventListener('storage', refresh);
    };
  }, [repository]);
  function edit(next: GISAnalysisConfiguration, resetRules = false) {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setDraft(next);
    s.setAnalysisDraft(next);
    setResult(null);
    setMessage(null);
    setError(null);
    if (resetRules)
      setRulesText(JSON.stringify(next.classificationRules, null, 2));
  }
  let validated: GISAnalysisConfiguration | null = null,
    validationError: string | null = null;
  try {
    validated = parseAnalysisConfiguration(
      { ...draft, classificationRules: JSON.parse(rulesText) },
      s.catalog,
    );
  } catch (e) {
    validationError =
      e instanceof Error ? e.message : 'Konfigurasi tidak valid';
  }
  let ahp: ReturnType<typeof calculatePreferences> | null = null;
  if (draft.analysisType === 'ahp-smce')
    try {
      ahp = calculatePreferences(draft.parameters.pairwise);
    } catch {}
  let scenario: number | null = null;
  if (draft.analysisType === 'wlc' && validated)
    scenario = calculateLegacyWLC(
      draft.parameters.scores,
      {
        bencana: draft.weights.bencana,
        kesuburan: draft.weights.kesuburan,
        kepadatan: draft.weights.kepadatan,
      },
      draft.parameters.constraint,
    );
  const isPreferences =
    draft.analysisType === 'ahp-smce' || draft.analysisType === 'wlc';
  const isFlood = draft.analysisType === 'flood-susceptibility';
  const hasRules = isFlood || draft.analysisType === 'raster-reclassification';
  function attempt(action: () => void) {
    try {
      action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operasi konfigurasi gagal');
    }
  }
  function fresh(type: GISAnalysisType) {
    attempt(() => {
      edit(defaultConfiguration(type, s.catalog, s.recipe), true);
      setSelected('');
    });
  }
  function load() {
    attempt(() => {
      if (!repository) throw Error('Penyimpanan lokal tidak tersedia');
      const c = repository.get(selected);
      if (!c) throw Error('Pilih konfigurasi tersimpan');
      edit(c, true);
      setMessage(`Dimuat: ${c.name} · v${c.version}`);
    });
  }
  function save() {
    attempt(() => {
      if (!validated || !repository)
        throw Error(validationError ?? 'Penyimpanan tidak tersedia');
      const c = repository.save(validated);
      edit(c, true);
      setSaved(repository.list());
      setSelected(c.id);
      setMessage(`Tersimpan lokal: ${c.name} · v${c.version}`);
    });
  }
  function duplicate() {
    attempt(() => {
      if (!validated || !repository)
        throw Error(validationError ?? 'Penyimpanan tidak tersedia');
      const c = repository.duplicate(validated);
      edit(c, true);
      setSaved(repository.list());
      setSelected(c.id);
      setMessage('Salinan disimpan sebagai konfigurasi baru.');
    });
  }
  function remove() {
    attempt(() => {
      if (!repository) throw Error('Penyimpanan tidak tersedia');
      const c = repository.get(selected);
      if (!c) throw Error('Pilih konfigurasi untuk dihapus');
      repository.delete(c.id, c.version);
      setSaved(repository.list());
      setSelected('');
      setMessage(
        'Konfigurasi lokal dihapus; draft sesi dan konfigurasi peta tetap tersedia.',
      );
    });
  }
  function exportConfig() {
    attempt(() => {
      if (!validated) throw Error(validationError ?? 'Konfigurasi tidak valid');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(validated, null, 2)], {
          type: 'application/json',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${validated.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function importConfig(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > MAX_CONFIGURATION_BYTES)
        throw Error('File konfigurasi maksimal 64 KiB');
      const c = parseAnalysisConfiguration(
        JSON.parse(await file.text()),
        s.catalog,
      );
      edit(c, true);
      setSelected(c.id);
      setMessage('JSON dimuat ke draft; belum disimpan atau dijalankan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impor gagal');
    }
  }
  function resetWeights() {
    if (draft.analysisType === 'ahp-smce')
      edit({
        ...draft,
        parameters: { pairwise: { ...DEFAULT_PAIRWISE } },
        weights: { ...calculatePreferences(DEFAULT_PAIRWISE).weights },
      });
    else if (draft.analysisType === 'wlc')
      edit({
        ...draft,
        weights: { ...calculatePreferences(DEFAULT_PAIRWISE).weights },
      });
    else if (isFlood) edit({ ...draft, weights: { ...DEFAULT_FLOOD_WEIGHTS } });
  }
  function chooseDataset(index: number, id: string) {
    attempt(() => {
      const d = s.catalog.find((d) => d.id === id);
      const criteria = draft.criteria.map((c, i) =>
        i === index
          ? {
              ...c,
              datasetId: id || null,
              band: d?.raster?.bands[0].id ?? null,
            }
          : c,
      );
      edit(refreshConfigurationSources({ ...draft, criteria }, s.catalog));
    });
  }
  async function apply() {
    if (!validated || busy) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const currentGeneration = ++generation.current;
    const base = s.recipe;
    setError(null);
    setResult(null);
    setMessage(null);
    try {
      const plan = prepareConfigurationApplication(
        validated,
        base,
        s.catalog,
        s.context,
        s.mode,
      );
      if (plan.kind === 'configuration-only') {
        setMessage(plan.reason);
        return;
      }
      if (plan.kind === 'preferences') {
        s.replace(
          plan.recipe,
          `Konfigurasi ${validated.name} v${validated.version}`,
          base,
          'edit',
        );
        setMessage(
          'Konfigurasi diterapkan ke resep dan bobot sesi. Tidak ada hasil spasial yang dibuat.',
        );
        return;
      }
      setBusy(true);
      const response = await fetch('/api/gis/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan.operation),
        signal: active.signal,
      });
      const raw: unknown = await response.json();
      if (!response.ok)
        throw Error(
          record(raw) && typeof raw.error === 'string'
            ? raw.error
            : record(raw) && typeof raw.reason === 'string'
              ? raw.reason
              : 'Analisis tidak tersedia',
        );
      const data = parseProcessingResult(raw);
      if (active.signal.aborted || generation.current !== currentGeneration)
        return;
      s.replace(
        plan.recipe,
        `Analisis konfigurasi ${validated.name} v${validated.version}`,
        base,
        'edit',
      );
      setResult(data);
      setMessage(
        'Operasi provider lokal selesai · DEMO. Konfigurasi tercatat di MapRecipe.',
      );
    } catch (e) {
      if (!active.signal.aborted)
        setError(e instanceof Error ? e.message : 'Penerapan gagal');
    } finally {
      if (generation.current === currentGeneration) setBusy(false);
    }
  }
  const point =
    'coordinate' in draft.parameters ? draft.parameters.coordinate : null;
  const resultData =
    result?.status === 'ok' && s.recipe.analysisConfiguration?.id === draft.id
      ? result.data
      : null;
  if (!browserReady)
    return (
      <section role="status" className="gis-analysis-configuration">
        Memuat konfigurasi analisis…
      </section>
    );
  return (
    <section
      className="gis-analysis-configuration"
      aria-labelledby="analysis-config-title"
    >
      <div className="gis-config-heading">
        <h2 id="analysis-config-title">Konfigurasi analisis GIS</h2>
        <span className="gis-tag">EKSPERIMENTAL</span>
      </div>
      <p className="gis-context">
        Konfigurasi di resep:{' '}
        {s.recipe.analysisConfiguration
          ? `${s.recipe.analysisConfiguration.name} · v${s.recipe.analysisConfiguration.version}`
          : 'belum diterapkan'}
        . Editor di bawah adalah draft sesi.
      </p>
      <p className="gis-muted">
        Simpan dan gunakan ulang pengaturan. Tidak ada ranking atau persetujuan
        metodologi ilmiah. Nilai DEMO dan skenario bukan pengukuran nyata.
      </p>
      <div className="gis-config-library">
        <label>
          Konfigurasi tersimpan
          <select
            aria-label="Konfigurasi tersimpan"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">
              {saved.length
                ? 'Pilih konfigurasi'
                : 'Belum ada konfigurasi lokal'}
            </option>
            {saved.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · v{c.version}
              </option>
            ))}
          </select>
        </label>
        <div className="gis-config-actions">
          <button
            className="gis-button secondary"
            disabled={!selected || busy}
            onClick={load}
          >
            Muat konfigurasi
          </button>
          <button
            className="gis-button secondary"
            disabled={!selected || busy}
            onClick={remove}
          >
            Hapus konfigurasi lokal
          </button>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Jenis analisis
          <select
            aria-label="Jenis konfigurasi analisis"
            value={draft.analysisType}
            onChange={(e) => fresh(e.target.value as GISAnalysisType)}
          >
            {ANALYSIS_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <p className="gis-muted">
          {
            ANALYSIS_TYPES.find((t) => t.type === draft.analysisType)
              ?.capability
          }
        </p>
        <label>
          Nama konfigurasi
          <input
            aria-label="Nama konfigurasi"
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => edit({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Deskripsi
          <textarea
            aria-label="Deskripsi konfigurasi"
            maxLength={2000}
            rows={2}
            value={draft.description}
            onChange={(e) => edit({ ...draft, description: e.target.value })}
          />
        </label>
        <p className="gis-muted">
          Versi konfigurasi {draft.version} · skema 1 · versi meningkat saat
          disimpan ulang.
        </p>
        <fieldset className="gis-config-criteria">
          <legend>Kriteria dan sumber input</legend>
          {draft.criteria.map((c, i) => {
            const d = s.catalog.find((d) => d.id === c.datasetId);
            const band = d?.raster?.bands.find((b) => b.id === c.band) ?? null;
            return (
              <div className="gis-config-criterion" key={c.id}>
                <h3>{c.label}</h3>
                <label>
                  Dataset
                  <select
                    aria-label={`Dataset ${c.label}`}
                    value={c.datasetId ?? ''}
                    onChange={(e) => chooseDataset(i, e.target.value)}
                  >
                    {(isPreferences || isFlood) && (
                      <option value="">Belum ditautkan</option>
                    )}
                    {s.catalog
                      .filter((d) => isPreferences || d.type === 'raster')
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} ·{' '}
                          {d.status === 'demo'
                            ? 'DEMO'
                            : d.status === 'unavailable'
                              ? 'belum tersedia'
                              : 'tersedia'}
                        </option>
                      ))}
                  </select>
                </label>
                {d?.raster && (
                  <label>
                    Band
                    <select
                      aria-label={`Band konfigurasi ${c.label}`}
                      value={c.band ?? ''}
                      onChange={(e) =>
                        attempt(() =>
                          edit(
                            refreshConfigurationSources(
                              {
                                ...draft,
                                criteria: draft.criteria.map((row, j) =>
                                  j === i
                                    ? { ...row, band: e.target.value }
                                    : row,
                                ),
                              },
                              s.catalog,
                            ),
                          ),
                        )
                      }
                    >
                      {d.raster.bands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.id} · {b.unit} · {b.kind}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!!Object.keys(draft.weights).length && (
                  <label>
                    Bobot (%)
                    <input
                      aria-label={`Bobot konfigurasi ${c.label}`}
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      required
                      readOnly={draft.analysisType === 'ahp-smce'}
                      value={Number((draft.weights[c.id] * 100).toFixed(8))}
                      onChange={(e) =>
                        edit({
                          ...draft,
                          weights: {
                            ...draft.weights,
                            [c.id]: Number(e.target.value) / 100,
                          },
                        })
                      }
                    />
                  </label>
                )}
                {d && (
                  <p className="gis-muted">
                    {d.source} · {d.version}
                    {band && d.raster
                      ? ` · ${band.unit} · ${d.raster.crs} · ${d.raster.resolution.x} × ${d.raster.resolution.y} ${d.raster.resolution.unit} · ${d.raster.period.start}–${d.raster.period.end}`
                      : ''}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>
        {draft.analysisType === 'ahp-smce' && (
          <fieldset className="gis-config-criteria">
            <legend>Matriks AHP · rasio 1/9–9</legend>
            {Object.entries(draft.parameters.pairwise).map(([key, value]) => (
              <label key={key}>
                {key}
                <input
                  aria-label={`Rasio konfigurasi ${key}`}
                  type="number"
                  min={1 / 9}
                  max={9}
                  step="any"
                  value={value}
                  onChange={(e) => {
                    const pairwise = {
                      ...draft.parameters.pairwise,
                      [key]: Number(e.target.value),
                    };
                    let weights = draft.weights;
                    try {
                      weights = { ...calculatePreferences(pairwise).weights };
                    } catch {}
                    edit({ ...draft, parameters: { pairwise }, weights });
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              className="gis-button secondary"
              onClick={() =>
                edit({
                  ...draft,
                  parameters: { pairwise: { ...map.pairwiseValues } },
                  weights: {
                    ...calculatePreferences(map.pairwiseValues).weights,
                  },
                })
              }
            >
              Ambil matriks AHP aktif
            </button>
            {ahp && (
              <p className="gis-context">
                Bobot terhitung:{' '}
                {PREFERENCE_CRITERIA.map(
                  (k) => `${k} ${(ahp!.weights[k] * 100).toFixed(2)}%`,
                ).join(' · ')}
                <br />
                CR {(ahp.cr * 100).toFixed(2)}% ·{' '}
                {ahp.isValid
                  ? 'preferensi konsisten'
                  : 'konsistensi rendah; informasi, bukan blokir penyimpanan/penerapan'}
              </p>
            )}
          </fieldset>
        )}
        {draft.analysisType === 'wlc' && (
          <fieldset className="gis-config-criteria">
            <legend>Skenario input WLC · bukan pengukuran</legend>
            <p className="gis-muted">
              Rumus lama: (6 − bencana) × bobot + kesuburan × bobot + kepadatan
              × bobot. Dataset tertaut hanya provenance; skor tidak diturunkan
              otomatis dari raster.
            </p>
            {PREFERENCE_CRITERIA.map((k) => (
              <label key={k}>
                Skor {k} (1–5)
                <input
                  aria-label={`Skor skenario ${k}`}
                  type="number"
                  min={1}
                  max={5}
                  step="any"
                  value={draft.parameters.scores[k] ?? ''}
                  onChange={(e) =>
                    edit({
                      ...draft,
                      parameters: {
                        ...draft.parameters,
                        scores: {
                          ...draft.parameters.scores,
                          [k]:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
            <label>
              Constraint
              <select
                aria-label="Constraint skenario WLC"
                value={draft.parameters.constraint}
                onChange={(e) =>
                  edit({
                    ...draft,
                    parameters: {
                      ...draft.parameters,
                      constraint: Number(e.target.value) as 0 | 1,
                    },
                  })
                }
              >
                <option value={1}>1 · disertakan</option>
                <option value={0}>0 · dikecualikan</option>
              </select>
            </label>
            <p className="gis-context">
              Hasil skenario input:{' '}
              {scenario === null
                ? 'belum tersedia; lengkapi ketiga skor'
                : scenario.toFixed(4)}
            </p>
          </fieldset>
        )}
        {!!Object.keys(draft.weights).length && (
          <div className="gis-config-actions">
            <span>
              Total bobot{' '}
              {(
                Object.values(draft.weights).reduce((a, b) => a + b, 0) * 100
              ).toFixed(2)}
              %
            </span>
            <button
              type="button"
              className="gis-button secondary"
              onClick={resetWeights}
            >
              Reset bobot konfigurasi
            </button>
          </div>
        )}
        <label>
          AOI konfigurasi
          <select
            aria-label="AOI konfigurasi"
            value={draft.selectedAOI?.id ?? ''}
            onChange={(e) =>
              edit({
                ...draft,
                selectedAOI:
                  DEMO_AOIS.find((a) => a.id === e.target.value) ?? null,
              })
            }
          >
            <option value="">Belum dipilih</option>
            {DEMO_AOIS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · DEMO
              </option>
            ))}
          </select>
        </label>
        {point && (
          <fieldset className="gis-config-criteria">
            <legend>Titik analisis tersimpan</legend>
            <label>
              CRS
              <select
                aria-label="CRS titik konfigurasi"
                value={point.crs}
                onChange={(e) =>
                  attempt(() => {
                    const crs = e.target.value as typeof point.crs;
                    const [x, y] = transformCoordinate(point, crs);
                    edit({
                      ...draft,
                      parameters: {
                        ...draft.parameters,
                        coordinate: { x, y, crs },
                      },
                    } as GISAnalysisConfiguration);
                  })
                }
              >
                <option>EPSG:4326</option>
                <option>EPSG:3857</option>
              </select>
            </label>
            {(['x', 'y'] as const).map((key) => (
              <label key={key}>
                {key.toUpperCase()} (
                {point.crs === 'EPSG:4326'
                  ? key === 'x'
                    ? 'bujur'
                    : 'lintang'
                  : 'metre'}
                )
                <input
                  aria-label={`${key.toUpperCase()} titik konfigurasi`}
                  type="number"
                  step="any"
                  value={point[key]}
                  onChange={(e) =>
                    edit({
                      ...draft,
                      parameters: {
                        ...draft.parameters,
                        coordinate: { ...point, [key]: Number(e.target.value) },
                      },
                    } as GISAnalysisConfiguration)
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="gis-button secondary"
              onClick={() =>
                edit({
                  ...draft,
                  parameters: {
                    ...draft.parameters,
                    coordinate: {
                      x: s.recipe.viewport.center[1],
                      y: s.recipe.viewport.center[0],
                      crs: 'EPSG:4326',
                    },
                  },
                } as GISAnalysisConfiguration)
              }
            >
              Ambil titik pusat peta
            </button>
          </fieldset>
        )}
        {draft.analysisType === 'raster-normalization' && (
          <div className="gis-config-row">
            {(['min', 'max'] as const).map((key) => (
              <label key={key}>
                {key}
                <input
                  aria-label={`Kalibrasi konfigurasi ${key}`}
                  type="number"
                  step="any"
                  value={draft.parameters[key]}
                  onChange={(e) =>
                    edit({
                      ...draft,
                      parameters: {
                        ...draft.parameters,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        )}
        {draft.analysisType === 'raster-arithmetic' && (
          <fieldset className="gis-config-criteria">
            <legend>Operasi titik</legend>
            <label>
              Operator
              <select
                aria-label="Operator konfigurasi"
                value={draft.parameters.operator}
                onChange={(e) =>
                  edit({
                    ...draft,
                    parameters: {
                      ...draft.parameters,
                      operator: e.target
                        .value as typeof draft.parameters.operator,
                    },
                  })
                }
              >
                <option value="add">Tambah</option>
                <option value="subtract">Kurangi</option>
                <option value="multiply">Kalikan</option>
                <option value="divide">Bagi</option>
              </select>
            </label>
            <label>
              Konstanta
              <input
                aria-label="Konstanta konfigurasi"
                type="number"
                step="any"
                value={draft.parameters.constant}
                onChange={(e) =>
                  edit({
                    ...draft,
                    parameters: {
                      ...draft.parameters,
                      constant: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Satuan konstanta
              <input
                aria-label="Satuan konstanta konfigurasi"
                maxLength={100}
                value={draft.parameters.unit}
                onChange={(e) =>
                  edit({
                    ...draft,
                    parameters: { ...draft.parameters, unit: e.target.value },
                  })
                }
              />
            </label>
          </fieldset>
        )}
        {draft.analysisType === 'mask' && (
          <label>
            Pertahankan
            <select
              aria-label="Aturan mask konfigurasi"
              value={draft.parameters.keep}
              onChange={(e) =>
                edit({
                  ...draft,
                  parameters: { keep: e.target.value as 'inside' | 'outside' },
                })
              }
            >
              <option value="inside">Di dalam AOI</option>
              <option value="outside">Di luar AOI</option>
            </select>
          </label>
        )}
        {isFlood && (
          <>
            <p className="gis-warning">
              Model {draft.parameters.modelVersion} · mapping eksperimental dari
              foundation lama, bukan ambang resmi P4I. Resolusi antar-kriteria
              berbeda; tidak ada harmonisasi/komputasi GEE di panel ini.
            </p>
            <div className="gis-config-row">
              {(['start', 'end'] as const).map((key) => (
                <label key={key}>
                  Periode {key}
                  <input
                    aria-label={`Periode flood ${key}`}
                    type="date"
                    value={draft.analysisPeriod?.[key] ?? ''}
                    onChange={(e) =>
                      edit({
                        ...draft,
                        analysisPeriod: {
                          start: draft.analysisPeriod?.start ?? '',
                          end: draft.analysisPeriod?.end ?? '',
                          [key]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </>
        )}
        {hasRules && (
          <details className="gis-config-rules" open>
            <summary>Aturan klasifikasi · preview dan JSON</summary>
            <p className="gis-muted">
              Interval [from, to); upper-bounds ≤ maxInclusive (null = +∞);
              categories memakai kode identitas. Edit JSON hanya data, bukan
              kode.
            </p>
            <textarea
              aria-label="Aturan klasifikasi konfigurasi JSON"
              rows={8}
              maxLength={20000}
              value={rulesText}
              spellCheck={false}
              onChange={(e) => {
                generation.current++;
                controller.current?.abort();
                setBusy(false);
                setRulesText(e.target.value);
                setResult(null);
                setMessage(null);
                try {
                  const rules = JSON.parse(e.target.value) as Record<
                    string,
                    ClassificationMapping
                  >;
                  setDraft({ ...draft, classificationRules: rules });
                  s.setAnalysisDraft({ ...draft, classificationRules: rules });
                } catch {}
              }}
            />
            {validated &&
              Object.entries(validated.classificationRules).map(([key, m]) => (
                <div key={key}>
                  <h3>{key}</h3>
                  <ul>
                    {m.rules.map((r, i) => (
                      <li key={i}>
                        {'from' in r
                          ? `[${r.from}, ${r.to})`
                          : 'input' in r
                            ? `Kode ${r.input}`
                            : `≤ ${r.maxInclusive ?? '+∞'}`}{' '}
                        → {r.output} · {r.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </details>
        )}
        <label>
          Catatan
          <textarea
            aria-label="Catatan konfigurasi"
            rows={2}
            maxLength={4000}
            value={draft.notes}
            onChange={(e) => edit({ ...draft, notes: e.target.value })}
          />
        </label>
        {validationError && (
          <p className="gis-warning" role="status">
            {validationError}
          </p>
        )}
        <div className="gis-config-actions">
          <button className="gis-button" disabled={!validated || busy}>
            Simpan konfigurasi
          </button>
          <button
            type="button"
            className="gis-button secondary"
            disabled={!validated || busy}
            onClick={duplicate}
          >
            Duplikasi konfigurasi
          </button>
          <button
            type="button"
            className="gis-button secondary"
            disabled={!validated || busy}
            onClick={exportConfig}
          >
            Ekspor konfigurasi JSON
          </button>
        </div>
        <label className="gis-config-import">
          Impor konfigurasi JSON
          <input
            aria-label="Impor konfigurasi JSON"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void importConfig(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <div className="gis-config-actions">
          <button
            type="button"
            className="gis-button secondary"
            onClick={() => fresh(draft.analysisType)}
          >
            Draft konfigurasi baru
          </button>
          <button
            type="button"
            className="gis-button"
            disabled={!validated || busy}
            onClick={() => void apply()}
          >
            {busy
              ? 'Memproses konfigurasi…'
              : isFlood
                ? 'Tinjau kesiapan konfigurasi'
                : isPreferences
                  ? 'Terapkan konfigurasi ke peta'
                  : 'Jalankan konfigurasi lokal'}
          </button>
        </div>
      </form>
      {error && (
        <p className="gis-warning" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="gis-context" role="status">
          {message}
        </p>
      )}
      {resultData && (
        <div className="gis-config-result" aria-live="polite">
          <h3>Hasil konfigurasi · DEMO</h3>
          {resultData.kind === 'value' ? (
            <p>
              {resultData.result.noData
                ? `NoData · ${resultData.result.reason}`
                : `${resultData.result.value} ${resultData.result.unit}${resultData.result.classification ? ` · ${resultData.result.classification}` : ''}`}
            </p>
          ) : resultData.kind === 'statistics' ? (
            <>
              <p>
                Sel valid {resultData.statistics.count} · NoData{' '}
                {resultData.statistics.noDataCount}
              </p>
              <p>
                {resultData.statistics.kind === 'categorical'
                  ? 'Histogram kode kelas; mean tidak dihitung'
                  : `Mean ${resultData.statistics.mean} ${resultData.statistics.unit}`}
              </p>
              {resultData.statistics.histogram.map((c) => (
                <p key={c.value}>
                  {c.label}: {c.count}
                </p>
              ))}
            </>
          ) : resultData.kind === 'subset' ? (
            <p>
              Sel dipilih {resultData.subset.selectedCount} · artifact:null ·
              file GeoTIFF belum dibuat.
            </p>
          ) : null}
        </div>
      )}
      <details>
        <summary>Provenance dan keterbatasan konfigurasi</summary>
        <p className="gis-muted">
          {draft.createdAt} · {draft.updatedAt}
          <br />
          Resolusi:{' '}
          {draft.spatialResolution
            ? `${draft.spatialResolution.crs} · ${draft.spatialResolution.resolution.x} × ${draft.spatialResolution.resolution.y} ${draft.spatialResolution.resolution.unit}`
            : 'tidak ditetapkan / grid berbeda'}
          <br />
          Periode:{' '}
          {draft.analysisPeriod
            ? `${draft.analysisPeriod.start}–${draft.analysisPeriod.end}`
            : 'tidak ditetapkan'}
        </p>
        {draft.sourceMetadata.map((m) => (
          <p className="gis-muted" key={m.datasetId}>
            {m.datasetId} · {m.version} · {m.source}
            <br />
            {m.provenance}
          </p>
        ))}
        <p className="gis-muted">
          {UNSUPPORTED_CONFIGURATION_TYPES.join(', ')} belum memiliki mesin dan
          tidak ditawarkan untuk eksekusi. Metodologi ilmiah, grading dan
          ranking di luar cakupan. Penyimpanan hanya browser ini; tidak
          tersinkron ke server.
        </p>
        <button
          className="gis-button secondary"
          onClick={() =>
            attempt(() =>
              edit(refreshConfigurationSources(draft, s.catalog), true),
            )
          }
        >
          Perbarui metadata dari katalog
        </button>
      </details>
    </section>
  );
}
