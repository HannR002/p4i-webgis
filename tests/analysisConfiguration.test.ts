import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import {
  ANALYSIS_TYPES,
  defaultConfiguration,
  parseAnalysisConfiguration,
  refreshConfigurationSources,
} from '../lib/gis/analysisConfiguration';
import {
  DEFAULT_FLOOD_WEIGHTS,
  FLOOD_MODEL_VERSION,
} from '../config/floodRiskModel';
import { calculateAHP } from '../utils/ahpCalculator';
import {
  calculatePreferences,
  calculateLegacyWLC,
} from '../utils/analysisPreferences';
const catalog = createDemoGisProvider().catalog();
const now = '2026-01-01T00:00:00.000Z';
const make = (
  type:
    | 'ahp-smce'
    | 'wlc'
    | 'flood-susceptibility'
    | 'raster-reclassification' = 'ahp-smce',
) => defaultConfiguration(type, catalog, undefined, now);
describe('analysis configuration validation and compatibility', () => {
  it.each(ANALYSIS_TYPES)(
    'supplies valid, serializable defaults for $type',
    ({ type }) => {
      const c = defaultConfiguration(type, catalog, undefined, now);
      expect(
        parseAnalysisConfiguration(JSON.parse(JSON.stringify(c)), catalog),
      ).toEqual(c);
      expect(c.experimental).toBe(true);
      expect(c.version).toBe(1);
      expect(c.schemaVersion).toBe(1);
    },
  );
  it('rejects unsupported engines, approval/status fields and invented IDs', () => {
    for (const value of [
      { ...make(), analysisType: 'buffer' },
      { ...make(), analysisType: 'vector-overlay' },
      { ...make(), status: 'VALIDATED' },
      { ...make(), experimental: false },
      { ...make(), inputDatasetIds: ['invented'] },
      { ...make(), credentials: 'private' },
      {
        ...make(),
        parameters: {
          pairwise: {
            bencanaVsKesuburan: 1,
            bencanaVsKepadatan: 1,
            kesuburanVsKepadatan: 1,
          },
          code: 'eval',
        },
      },
    ])
      expect(() => parseAnalysisConfiguration(value, catalog)).toThrow();
  });
  it.each([
    { bencana: 0.5, kesuburan: 0.5, kepadatan: 0.5 },
    { bencana: -0.1, kesuburan: 0.5, kepadatan: 0.6 },
    { bencana: NaN, kesuburan: 0.5, kepadatan: 0.5 },
    { bencana: 0.5, kesuburan: 0.5 },
    { bencana: 0.2, kesuburan: 0.3, kepadatan: 0.5, other: 0 },
  ])('rejects malformed weights %#', (weights) => {
    expect(() =>
      parseAnalysisConfiguration({ ...make('wlc'), weights }, catalog),
    ).toThrow();
  });
  it('keeps the existing AHP mathematics and treats high CR as information', () => {
    const c = make();
    if (c.analysisType !== 'ahp-smce') throw Error('type');
    const pairwise = {
      bencanaVsKesuburan: 9,
      bencanaVsKepadatan: 1 / 9,
      kesuburanVsKepadatan: 9,
    };
    const result = calculatePreferences(pairwise);
    expect(result).toEqual(
      calculateAHP([
        [1, 9, 1 / 9],
        [1 / 9, 1, 9],
        [9, 1 / 9, 1],
      ]),
    );
    expect(result.isValid).toBe(false);
    const high = {
      ...c,
      parameters: { pairwise },
      weights: { ...result.weights },
    };
    expect(() => parseAnalysisConfiguration(high, catalog)).not.toThrow();
    expect(() =>
      parseAnalysisConfiguration(
        { ...high, weights: { bencana: 0.2, kesuburan: 0.3, kepadatan: 0.5 } },
        catalog,
      ),
    ).toThrow(/matriks/);
    expect(() =>
      calculatePreferences({ ...pairwise, bencanaVsKesuburan: 0 }),
    ).toThrow();
  });
  it('shares cost/benefit WLC formula without filling missing measurements', () => {
    const weights = { bencana: 0.2, kesuburan: 0.3, kepadatan: 0.5 };
    expect(
      calculateLegacyWLC({ bencana: 1, kesuburan: 2, kepadatan: 3 }, weights),
    ).toBeCloseTo(3.1);
    expect(
      calculateLegacyWLC(
        { bencana: 1, kesuburan: 2, kepadatan: 3 },
        weights,
        0,
      ),
    ).toBe(0);
    expect(
      calculateLegacyWLC(
        { bencana: null, kesuburan: 2, kepadatan: 3 },
        weights,
      ),
    ).toBeNull();
    const c = make('wlc');
    if (c.analysisType !== 'wlc') throw Error('type');
    expect(() =>
      parseAnalysisConfiguration(
        {
          ...c,
          parameters: {
            ...c.parameters,
            scores: { bencana: 6, kesuburan: 2, kepadatan: 3 },
          },
        },
        catalog,
      ),
    ).toThrow(/1–5/);
  });
  it('captures four flood sources, experimental mappings, native units and versions', () => {
    const c = make('flood-susceptibility');
    expect(c.weights).toEqual(DEFAULT_FLOOD_WEIGHTS);
    expect(c.parameters).toEqual({ modelVersion: FLOOD_MODEL_VERSION });
    expect(c.sourceMetadata).toHaveLength(4);
    expect(c.spatialResolution).toBeNull();
    expect(c.analysisPeriod).toEqual({
      start: '2025-01-01',
      end: '2025-12-31',
    });
    expect(c.classificationRules.rainfall.kind).toBe('upper-bounds');
    expect(JSON.stringify(c)).not.toContain('Infinity');
    const bad = refreshConfigurationSources(
      {
        ...c,
        criteria: c.criteria.map((row) =>
          row.id === 'rainfall' ? { ...row, band: 'daily_mean' } : row,
        ),
      },
      catalog,
    );
    expect(() => parseAnalysisConfiguration(bad, catalog)).toThrow(
      /Band\/unit/,
    );
    expect(() =>
      parseAnalysisConfiguration(
        { ...c, parameters: { modelVersion: 'invented-v2' } },
        catalog,
      ),
    ).toThrow(/Versi model/);
  });
  it('rejects inconsistent source units, versions, native resolution, period and bands', () => {
    const c = make('raster-reclassification');
    const changed = structuredClone(c);
    changed.sourceMetadata[0].raster!.bands[0].unit = 'invented';
    expect(() => parseAnalysisConfiguration(changed, catalog)).toThrow(
      /Metadata/,
    );
    const updatedCatalog = catalog.map((d) => ({
      ...d,
      version: `${d.version}-updated`,
    }));
    expect(() => parseAnalysisConfiguration(c, updatedCatalog)).toThrow(
      /Metadata/,
    );
    expect(() =>
      parseAnalysisConfiguration(
        {
          ...c,
          spatialResolution: {
            crs: 'EPSG:4326',
            resolution: { x: 10, y: 10, unit: 'metre' },
          },
        },
        catalog,
      ),
    ).toThrow(/Resolusi/);
    expect(() =>
      parseAnalysisConfiguration(
        { ...c, analysisPeriod: { start: '2024-01-01', end: '2024-12-31' } },
        catalog,
      ),
    ).toThrow(/periode/);
    expect(() =>
      parseAnalysisConfiguration(
        {
          ...c,
          criteria: c.criteria.map((row) => ({ ...row, band: 'invented' })),
        },
        catalog,
      ),
    ).toThrow(/Band/);
  });
  it('rejects overlapping intervals, classification code and unknown AOIs', () => {
    const c = make('raster-reclassification');
    expect(() =>
      parseAnalysisConfiguration(
        {
          ...c,
          classificationRules: {
            value: {
              kind: 'intervals',
              rules: [
                { from: 0, to: 10, output: 1, label: 'A' },
                { from: 5, to: 20, output: 2, label: 'B' },
              ],
            },
          },
        },
        catalog,
      ),
    ).toThrow(/bertumpuk/);
    expect(() =>
      parseAnalysisConfiguration(
        {
          ...c,
          selectedAOI: { id: 'invented', name: 'Unknown', kind: 'demo' },
        },
        catalog,
      ),
    ).toThrow(/AOI/);
    expect(() =>
      parseAnalysisConfiguration(
        { ...c, parameters: { coordinate: { x: 1, y: 2, crs: 'EPSG:32748' } } },
        catalog,
      ),
    ).toThrow();
  });
  it('handles versions, dates and payload size explicitly', () => {
    for (const value of [
      { ...make(), schemaVersion: 2 },
      { ...make(), version: 0 },
      { ...make(), version: 1.5 },
      { ...make(), updatedAt: '2026-02-30T00:00:00.000Z' },
      { ...make(), notes: 'x'.repeat(70000) },
    ])
      expect(() => parseAnalysisConfiguration(value, catalog)).toThrow();
    expect(
      parseAnalysisConfiguration({ ...make(), version: 17 }, catalog).version,
    ).toBe(17);
  });
});
