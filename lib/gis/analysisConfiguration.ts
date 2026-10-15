import type { Dataset, MapRecipe, RasterCoordinate } from './contracts';
import type {
  GISAnalysisConfiguration,
  GISAnalysisType,
  AnalysisSourceMetadata,
  ClassificationMapping,
  AnalysisCriterion,
} from './analysisContracts';
import {
  record,
  finite,
  text,
  GisInputError,
  validateRasterMetadata,
} from './validation';
import { bandRange, getBand } from './raster';
import { parseCoordinate, parseRasterOperation } from './rasterValidation';
import { DEMO_AOIS } from './catalog';
import {
  calculatePreferences,
  DEFAULT_PAIRWISE,
  PREFERENCE_CRITERIA,
  validatePreferenceWeights,
} from '../../utils/analysisPreferences';
import {
  canonicalizeFloodWeights,
  DEFAULT_FLOOD_WEIGHTS,
  FLOOD_MODEL_VERSION,
  RAINFALL_SUSCEPTIBILITY,
  SLOPE_SUSCEPTIBILITY,
  SOIL_CLASS_SUSCEPTIBILITY,
  LAND_COVER_SUSCEPTIBILITY,
  validateAnalysisPeriod,
} from '../../config/floodRiskModel';
import { FLOOD_CRITERIA } from '../../types/flood';

export const ANALYSIS_TYPES: readonly {
  type: GISAnalysisType;
  label: string;
  capability: string;
}[] = [
  {
    type: 'ahp-smce',
    label: 'AHP / SMCE',
    capability:
      'Matriks 3×3 dan bobot lokal; CR sebagai informasi konsistensi.',
  },
  {
    type: 'wlc',
    label: 'Weighted Linear Combination',
    capability:
      'Bobot langsung dan skenario input 1–5; data lengkap diperlukan untuk hasil peta.',
  },
  {
    type: 'flood-susceptibility',
    label: 'Flood susceptibility · konfigurasi',
    capability:
      'Simpan empat kriteria eksperimental; adapter data/GEE belum tersedia, tidak dieksekusi di sini.',
  },
  {
    type: 'raster-reclassification',
    label: 'Reklasifikasi raster · titik',
    capability: 'Kelas interval memakai provider lokal DEMO.',
  },
  {
    type: 'zonal-statistics',
    label: 'Statistik zonal',
    capability: 'Pusat sel native; NoData dikecualikan; DEMO lokal.',
  },
  {
    type: 'raster-normalization',
    label: 'Normalisasi raster · titik',
    capability: 'Kalibrasi min/max eksplisit; DEMO lokal.',
  },
  {
    type: 'raster-arithmetic',
    label: 'Aritmetika raster · titik',
    capability: 'Operator terbatas dengan konstanta bersatuan; DEMO lokal.',
  },
  {
    type: 'clip',
    label: 'Clip · deskripsi window',
    capability: 'Window/count native; belum menghasilkan GeoTIFF.',
  },
  {
    type: 'mask',
    label: 'Mask · deskripsi window',
    capability: 'Inside/outside native; belum menghasilkan file raster.',
  },
];
export const UNSUPPORTED_CONFIGURATION_TYPES = [
  'Buffer',
  'Vector overlay',
] as const;
export const MAX_CONFIGURATION_BYTES = 64 * 1024;
export function configurationId(): string {
  return `analysis-${crypto.randomUUID()}`;
}
function only(v: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(v).some((key) => !keys.includes(key)))
    throw new GisInputError('Field konfigurasi tidak diizinkan');
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (record(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function analysisSources(
  ids: readonly string[],
  catalog: readonly Dataset[],
): AnalysisSourceMetadata[] {
  return ids.map((id) => {
    const d = catalog.find((d) => d.id === id);
    if (!d) throw new GisInputError('Dataset konfigurasi tidak dikenal');
    if (d.raster) validateRasterMetadata(d.raster);
    return {
      datasetId: d.id,
      source: d.source,
      provider: d.provider,
      license: d.license,
      version: d.version,
      provenance: d.provenance,
      raster: d.raster ? structuredClone(d.raster) : null,
    };
  });
}
export function refreshConfigurationSources<T extends GISAnalysisConfiguration>(
  config: T,
  catalog: readonly Dataset[],
): T {
  const inputDatasetIds = [
    ...new Set(
      config.criteria.flatMap((c) => (c.datasetId ? [c.datasetId] : [])),
    ),
  ];
  const sourceMetadata = analysisSources(inputDatasetIds, catalog);
  const rasters = sourceMetadata.flatMap((s) => (s.raster ? [s.raster] : []));
  const first = rasters[0];
  const spatialResolution =
    first &&
    rasters.every(
      (r) =>
        stable({ crs: r.crs, resolution: r.resolution }) ===
        stable({ crs: first.crs, resolution: first.resolution }),
    )
      ? { crs: first.crs, resolution: { ...first.resolution } }
      : null;
  const analysisPeriod =
    first && rasters.every((r) => stable(r.period) === stable(first.period))
      ? { ...first.period }
      : config.analysisType === 'flood-susceptibility'
        ? config.analysisPeriod
        : null;
  return {
    ...config,
    inputDatasetIds,
    sourceMetadata,
    spatialResolution,
    analysisPeriod,
  };
}
export function experimentalFloodRules(): Record<
  string,
  ClassificationMapping
> {
  const upper = (
    rows: readonly { output: number; max: number }[],
  ): ClassificationMapping => ({
    kind: 'upper-bounds',
    rules: rows.map((row) => ({
      maxInclusive: Number.isFinite(row.max) ? row.max : null,
      output: row.output,
      label: 'Eksperimental',
    })),
  });
  const categories = (
    values: Readonly<Record<number, number>>,
  ): ClassificationMapping => ({
    kind: 'categories',
    rules: Object.entries(values).map(([input, output]) => ({
      input: Number(input),
      output,
      label: 'Eksperimental',
    })),
  });
  return {
    rainfall: upper(
      RAINFALL_SUSCEPTIBILITY.map((row) => ({
        max: row.maxMm,
        output: row.value,
      })),
    ),
    slope: upper(
      SLOPE_SUSCEPTIBILITY.map((row) => ({
        max: row.maxDegrees,
        output: row.value,
      })),
    ),
    soil: categories(SOIL_CLASS_SUSCEPTIBILITY),
    land_cover: categories(LAND_COVER_SUSCEPTIBILITY),
  };
}
export function defaultConfiguration(
  type: GISAnalysisType,
  catalog: readonly Dataset[],
  recipe?: MapRecipe,
  now = new Date().toISOString(),
): GISAnalysisConfiguration {
  if (!ANALYSIS_TYPES.some((t) => t.type === type))
    throw new GisInputError('Jenis analisis belum didukung');
  const base = {
    schemaVersion: 1 as const,
    id: configurationId(),
    name: ANALYSIS_TYPES.find((t) => t.type === type)!.label,
    description: '',
    version: 1,
    inputDatasetIds: [] as string[],
    criteria: [] as AnalysisCriterion[],
    weights: {} as Record<string, number>,
    classificationRules: {} as Record<string, ClassificationMapping>,
    selectedAOI: recipe?.aoi ?? null,
    spatialResolution: null,
    analysisPeriod: null,
    sourceMetadata: [] as AnalysisSourceMetadata[],
    createdAt: now,
    updatedAt: now,
    notes: '',
    experimental: true as const,
  };
  let config: GISAnalysisConfiguration;
  if (type === 'ahp-smce' || type === 'wlc') {
    const criteria = PREFERENCE_CRITERIA.map((id) => ({
      id,
      label: {
        bencana: 'Bencana',
        kesuburan: 'Kesuburan',
        kepadatan: 'Kepadatan',
      }[id],
      datasetId: null,
      band: null,
    }));
    const weights = { ...calculatePreferences(DEFAULT_PAIRWISE).weights };
    config =
      type === 'ahp-smce'
        ? {
            ...base,
            criteria,
            weights,
            analysisType: type,
            parameters: { pairwise: { ...DEFAULT_PAIRWISE } },
          }
        : {
            ...base,
            criteria,
            weights,
            analysisType: type,
            parameters: {
              scores: { bencana: null, kesuburan: null, kepadatan: null },
              constraint: 1,
            },
          };
  } else if (type === 'flood-susceptibility') {
    const ids = {
      rainfall: 'demo-rainfall',
      slope: 'demo-slope',
      soil: 'demo-soil',
      land_cover: 'demo-landcover',
    };
    const criteria = FLOOD_CRITERIA.map((id) => {
      const d = catalog.find((d) => d.id === ids[id]);
      return {
        id,
        label: {
          rainfall: 'Curah hujan',
          slope: 'Kemiringan',
          soil: 'Tanah',
          land_cover: 'Tutupan lahan',
        }[id],
        datasetId: d?.id ?? null,
        band: d?.raster?.bands[0].id ?? null,
      };
    });
    config = {
      ...base,
      analysisType: type,
      criteria,
      weights: { ...DEFAULT_FLOOD_WEIGHTS },
      classificationRules: experimentalFloodRules(),
      parameters: { modelVersion: FLOOD_MODEL_VERSION },
    };
  } else {
    const d =
      catalog.find(
        (d) => d.raster && recipe?.layers.some((l) => l.datasetId === d.id),
      ) ?? catalog.find((d) => d.raster);
    if (!d?.raster)
      throw new GisInputError('Belum ada metadata raster untuk konfigurasi');
    const layer = recipe?.layers.find((l) => l.datasetId === d.id);
    const band = getBand(
      d.raster,
      layer && 'band' in layer.style ? layer.style.band : undefined,
    );
    const coordinate: RasterCoordinate = {
      x: recipe?.viewport.center[1] ?? 103.545,
      y: recipe?.viewport.center[0] ?? -1.625,
      crs: 'EPSG:4326',
    };
    const criteria = [
      { id: 'value', label: 'Raster', datasetId: d.id, band: band.id },
    ];
    if (type === 'raster-reclassification') {
      const range = bandRange(d.raster, band.id),
        mid = (range[0] + range[1]) / 2;
      const rules =
        band.kind === 'categorical'
          ? d.raster.classes!.map((c) => ({
              from: c.value,
              to: c.value + 1,
              output: c.value,
              label: c.label,
            }))
          : [
              { from: range[0], to: mid, output: 1, label: 'Kelas contoh 1' },
              {
                from: mid,
                to: range[1] + 1,
                output: 2,
                label: 'Kelas contoh 2',
              },
            ];
      config = {
        ...base,
        criteria,
        analysisType: type,
        parameters: { coordinate },
        classificationRules: { value: { kind: 'intervals', rules } },
      };
    } else if (type === 'zonal-statistics')
      config = {
        ...base,
        criteria,
        analysisType: type,
        parameters: { method: 'native-cell-centers' },
      };
    else if (type === 'clip')
      config = {
        ...base,
        criteria,
        analysisType: type,
        parameters: { rule: 'cell-center' },
      };
    else if (type === 'mask')
      config = {
        ...base,
        criteria,
        analysisType: type,
        parameters: { keep: 'inside' },
      };
    else if (type === 'raster-normalization') {
      const [min, max] = bandRange(d.raster, band.id);
      config = {
        ...base,
        criteria,
        analysisType: type,
        parameters: { coordinate, min, max },
      };
    } else
      config = {
        ...base,
        criteria,
        analysisType: 'raster-arithmetic',
        parameters: {
          coordinate,
          operator: 'multiply',
          constant: 1,
          unit: '1',
        },
      };
  }
  return refreshConfigurationSources(config, catalog);
}
function parseMapping(value: unknown): ClassificationMapping {
  if (
    !record(value) ||
    !Array.isArray(value.rules) ||
    !value.rules.length ||
    value.rules.length > 20
  )
    throw new GisInputError('Aturan klasifikasi tidak valid');
  only(value, ['kind', 'rules']);
  if (value.kind === 'intervals') {
    let previous = -Infinity;
    for (const r of value.rules) {
      if (
        !record(r) ||
        !finite(r.from, -1e9, 1e9) ||
        !finite(r.to, -1e9, 1e9) ||
        r.from >= r.to ||
        r.from < previous ||
        !finite(r.output, -1e9, 1e9) ||
        !text(r.label)
      )
        throw new GisInputError('Interval harus terurut dan tidak bertumpuk');
      only(r, ['from', 'to', 'output', 'label']);
      previous = r.to;
    }
  } else if (value.kind === 'categories') {
    const seen = new Set<number>();
    for (const r of value.rules) {
      if (
        !record(r) ||
        !finite(r.input, -1e9, 1e9) ||
        seen.has(r.input) ||
        !finite(r.output, 0, 1) ||
        !text(r.label)
      )
        throw new GisInputError('Mapping kategori tidak valid');
      only(r, ['input', 'output', 'label']);
      seen.add(r.input);
    }
  } else if (value.kind === 'upper-bounds') {
    let previous = -Infinity;
    for (let i = 0; i < value.rules.length; i++) {
      const r = value.rules[i];
      if (
        !record(r) ||
        !finite(r.output, 0, 1) ||
        !text(r.label) ||
        !(
          (r.maxInclusive === null && i === value.rules.length - 1) ||
          (finite(r.maxInclusive, -1e9, 1e9) && r.maxInclusive > previous)
        )
      )
        throw new GisInputError('Batas klasifikasi eksperimental tidak valid');
      only(r, ['maxInclusive', 'output', 'label']);
      previous = r.maxInclusive === null ? Infinity : r.maxInclusive;
    }
    if (value.rules.at(-1).maxInclusive !== null)
      throw new GisInputError('Batas terakhir harus null (+∞)');
  } else throw new GisInputError('Jenis klasifikasi tidak didukung');
  return structuredClone(value) as unknown as ClassificationMapping;
}
export function parseAnalysisConfiguration(
  value: unknown,
  catalog: readonly Dataset[],
): GISAnalysisConfiguration {
  let size = Infinity;
  try {
    size = new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {}
  if (size > MAX_CONFIGURATION_BYTES || !record(value))
    throw new GisInputError('Konfigurasi tidak valid atau terlalu besar');
  only(value, [
    'schemaVersion',
    'id',
    'name',
    'description',
    'analysisType',
    'version',
    'inputDatasetIds',
    'parameters',
    'criteria',
    'weights',
    'classificationRules',
    'selectedAOI',
    'spatialResolution',
    'analysisPeriod',
    'createdAt',
    'updatedAt',
    'sourceMetadata',
    'notes',
    'experimental',
  ]);
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.version) ||
    !finite(value.version, 1, 1e6)
  )
    throw new GisInputError('Versi konfigurasi tidak didukung');
  if (
    !text(value.id, 100) ||
    !/^[a-zA-Z0-9_-]+$/.test(value.id) ||
    !text(value.name, 120) ||
    typeof value.description !== 'string' ||
    value.description.length > 2000 ||
    typeof value.notes !== 'string' ||
    value.notes.length > 4000 ||
    value.experimental !== true
  )
    throw new GisInputError(
      'Identitas konfigurasi tidak valid; label eksperimental wajib dipertahankan',
    );
  if (!ANALYSIS_TYPES.some((t) => t.type === value.analysisType))
    throw new GisInputError('Jenis analisis belum didukung');
  const iso = (v: unknown) =>
    typeof v === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v;
  if (
    !iso(value.createdAt) ||
    !iso(value.updatedAt) ||
    String(value.updatedAt) < String(value.createdAt)
  )
    throw new GisInputError('Waktu konfigurasi tidak valid');
  if (
    !Array.isArray(value.inputDatasetIds) ||
    value.inputDatasetIds.length > 8 ||
    !value.inputDatasetIds.every(
      (id) => text(id, 100) && catalog.some((d) => d.id === id),
    ) ||
    new Set(value.inputDatasetIds).size !== value.inputDatasetIds.length ||
    !Array.isArray(value.criteria) ||
    value.criteria.length > 8 ||
    !record(value.weights) ||
    !record(value.parameters) ||
    !record(value.classificationRules)
  )
    throw new GisInputError('Input/kriteria konfigurasi tidak valid');
  const type = value.analysisType as GISAnalysisType;
  const expected =
    type === 'ahp-smce' || type === 'wlc'
      ? PREFERENCE_CRITERIA
      : type === 'flood-susceptibility'
        ? FLOOD_CRITERIA
        : ['value'];
  const criteria = value.criteria;
  if (
    criteria.length !== expected.length ||
    !expected.every((id, i) => record(criteria[i]) && criteria[i].id === id)
  )
    throw new GisInputError('Kriteria analisis tidak sesuai engine');
  for (const c of value.criteria) {
    if (
      !record(c) ||
      !text(c.label) ||
      !(c.datasetId === null || text(c.datasetId, 100)) ||
      !(c.band === null || text(c.band, 100))
    )
      throw new GisInputError('Kriteria tidak valid');
    only(c, ['id', 'label', 'datasetId', 'band']);
    if (c.datasetId === null && c.band !== null)
      throw new GisInputError('Band tanpa dataset');
    if (c.datasetId !== null) {
      const d = catalog.find((d) => d.id === c.datasetId);
      if (!d) throw new GisInputError('Dataset konfigurasi tidak dikenal');
      if (d.raster) {
        if (!c.band) throw new GisInputError('Band diperlukan');
        getBand(d.raster, String(c.band));
      } else if (c.band !== null || !['ahp-smce', 'wlc'].includes(type))
        throw new GisInputError('Jenis dataset tidak sesuai analisis');
    } else if (!['ahp-smce', 'wlc', 'flood-susceptibility'].includes(type))
      throw new GisInputError('Pilih dataset raster');
  }
  const used = [
    ...new Set(
      value.criteria.flatMap((c) => (c.datasetId ? [c.datasetId] : [])),
    ),
  ];
  if (stable(used) !== stable(value.inputDatasetIds))
    throw new GisInputError('Daftar dataset harus sesuai kriteria');
  const sources = analysisSources(used, catalog);
  if (stable(value.sourceMetadata) !== stable(sources))
    throw new GisInputError(
      'Metadata raster/sumber berubah atau tidak sesuai katalog; buat ulang sumber secara eksplisit',
    );
  if (value.selectedAOI !== null) {
    const a = value.selectedAOI;
    if (
      !record(a) ||
      a.kind !== 'demo' ||
      !DEMO_AOIS.some((d) => d.id === a.id && d.name === a.name)
    )
      throw new GisInputError('Identitas AOI belum didukung');
    only(a, ['id', 'name', 'kind']);
  }
  if (value.analysisPeriod !== null) {
    only(record(value.analysisPeriod) ? value.analysisPeriod : {}, [
      'start',
      'end',
    ]);
    validateAnalysisPeriod(value.analysisPeriod);
  }
  const c = value as unknown as GISAnalysisConfiguration;
  const refreshed = refreshConfigurationSources(c, catalog);
  if (
    stable(value.spatialResolution) !== stable(refreshed.spatialResolution) ||
    (type !== 'flood-susceptibility' &&
      stable(value.analysisPeriod) !== stable(refreshed.analysisPeriod))
  )
    throw new GisInputError('Resolusi/periode harus sesuai sumber native');
  for (const [key, mapping] of Object.entries(value.classificationRules)) {
    if (!expected.includes(key as never))
      throw new GisInputError('Kriteria klasifikasi tidak dikenal');
    parseMapping(mapping);
  }
  const p = value.parameters;
  if (type === 'ahp-smce') {
    only(p, ['pairwise']);
    const derived = calculatePreferences(p.pairwise);
    validatePreferenceWeights(value.weights);
    if (
      !PREFERENCE_CRITERIA.every(
        (k) =>
          Math.abs(
            (value.weights as Record<string, number>)[k] - derived.weights[k],
          ) < 1e-9,
      )
    )
      throw new GisInputError('Bobot AHP tidak sesuai matriks');
  } else if (type === 'wlc') {
    only(p, ['scores', 'constraint']);
    validatePreferenceWeights(value.weights);
    if (
      !record(p.scores) ||
      Object.keys(p.scores).length !== 3 ||
      !PREFERENCE_CRITERIA.every(
        (k) =>
          p.scores &&
          record(p.scores) &&
          (p.scores[k] === null || finite(p.scores[k], 1, 5)),
      ) ||
      ![0, 1].includes(Number(p.constraint)) ||
      typeof p.constraint !== 'number'
    )
      throw new GisInputError(
        'Skenario WLC harus 1–5, atau null; constraint 0/1',
      );
  } else if (type === 'flood-susceptibility') {
    only(p, ['modelVersion']);
    if (p.modelVersion !== FLOOD_MODEL_VERSION)
      throw new GisInputError('Versi model flood belum didukung');
    canonicalizeFloodWeights(value.weights);
    if (
      !FLOOD_CRITERIA.every(
        (key) =>
          record(value.classificationRules) && value.classificationRules[key],
      )
    )
      throw new GisInputError('Empat mapping flood diperlukan');
    for (const key of FLOOD_CRITERIA) {
      const m = value.classificationRules[key] as ClassificationMapping;
      if (
        m.kind !==
          (['rainfall', 'slope'].includes(key)
            ? 'upper-bounds'
            : 'categories') ||
        m.rules.some((r) => r.output < 0 || r.output > 1)
      )
        throw new GisInputError(
          'Mapping flood harus susceptibilitas 0–1 dan tipe yang sesuai',
        );
      const criterion = c.criteria.find((row) => row.id === key)!;
      if (criterion.datasetId) {
        const band = getBand(
          catalog.find((d) => d.id === criterion.datasetId)!.raster!,
          criterion.band!,
        );
        if (
          ['rainfall', 'slope'].includes(key)
            ? band.kind !== 'continuous' ||
              band.unit !== (key === 'rainfall' ? 'mm/tahun' : 'derajat')
            : band.kind !== 'categorical'
        )
          throw new GisInputError(
            'Band/unit flood tidak sesuai mapping eksperimental saat ini',
          );
      }
    }
  } else {
    if (Object.keys(value.weights).length)
      throw new GisInputError('Operasi ini tidak memakai bobot');
    const ref = {
      datasetId: c.criteria[0].datasetId!,
      band: c.criteria[0].band!,
    };
    if (type === 'raster-reclassification') {
      only(p, ['coordinate']);
      const m = c.classificationRules.value;
      if (!m || m.kind !== 'intervals')
        throw new GisInputError('Reklasifikasi membutuhkan interval eksplisit');
      parseRasterOperation({
        operation: 'classify',
        ...ref,
        coordinate: p.coordinate,
        classes: m.rules,
      });
    } else if (type === 'raster-normalization') {
      only(p, ['coordinate', 'min', 'max']);
      if (
        getBand(catalog.find((d) => d.id === ref.datasetId)!.raster!, ref.band)
          .kind === 'categorical'
      )
        throw new GisInputError('Kode kategorikal tidak dapat dinormalisasi');
      parseRasterOperation({
        operation: 'normalize',
        ...ref,
        coordinate: p.coordinate,
        min: p.min,
        max: p.max,
      });
    } else if (type === 'raster-arithmetic') {
      only(p, ['coordinate', 'operator', 'constant', 'unit']);
      const band = getBand(
        catalog.find((d) => d.id === ref.datasetId)!.raster!,
        ref.band,
      );
      if (band.kind === 'categorical')
        throw new GisInputError('Kode kategorikal bukan besaran aritmetika');
      parseRasterOperation({
        operation: 'arithmetic',
        left: ref,
        right: { constant: p.constant, unit: p.unit },
        coordinate: p.coordinate,
        operator: p.operator,
        alignment: { mode: 'native-only' },
      });
      if (
        ['add', 'subtract'].includes(String(p.operator)) &&
        p.unit !== band.unit
      )
        throw new GisInputError('Satuan konstanta harus sama dengan band');
    } else if (type === 'zonal-statistics') {
      only(p, ['method']);
      if (p.method !== 'native-cell-centers')
        throw new GisInputError('Metode zonal belum didukung');
    } else if (type === 'clip') {
      only(p, ['rule']);
      if (p.rule !== 'cell-center')
        throw new GisInputError('Aturan clip belum didukung');
    } else {
      only(p, ['keep']);
      if (!['inside', 'outside'].includes(String(p.keep)))
        throw new GisInputError('Mask tidak valid');
    }
  }
  if (
    !['flood-susceptibility', 'raster-reclassification'].includes(type) &&
    Object.keys(value.classificationRules).length
  )
    throw new GisInputError('Analisis ini tidak memakai aturan klasifikasi');
  return structuredClone(c);
}
export function configurationCoordinate(
  config: GISAnalysisConfiguration,
): RasterCoordinate | null {
  return 'coordinate' in config.parameters
    ? parseCoordinate(config.parameters.coordinate)
    : null;
}
