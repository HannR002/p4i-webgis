import { afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import {
  getRasterProvider,
  checkedSample,
} from '../lib/server/gis/rasterProvider';
import { authorizeRasterOperands } from '../lib/server/gis/rasterAccess';
import { parseProcessingResult } from '../lib/gis/processingValidation';
import { applyMapAction } from '../lib/gis/recipe';
import { emptyRecipe } from '../lib/gis/catalog';
const gis = createDemoGisProvider();
const provider = getRasterProvider(gis);
const coordinate = { x: 103.545, y: -1.625, crs: 'EPSG:4326' } as const;
const ref = { datasetId: 'demo-rainfall', band: 'rainfall' };
const guest = { role: 'guest' as const, entitledProjectIds: [] };
afterEach(() => vi.useRealTimers());
describe('bounded local raster provider', () => {
  it('preserves async provider-returned values and physical band encoding', async () => {
    const native = await checkedSample(provider, {
      ...ref,
      coordinate,
      resampling: 'nearest',
    });
    const encoded = await checkedSample(provider, {
      ...ref,
      band: 'daily_mean',
      coordinate,
      resampling: 'nearest',
    });
    expect(native.status).toBe('ok');
    expect(encoded.status).toBe('ok');
    if (native.status === 'ok' && encoded.status === 'ok') {
      expect(encoded.data.value).toBeCloseTo(native.data.value! / 365, 8);
      expect(encoded.data.unit).toBe('mm/hari');
      expect(encoded.data.rawValue).toBe(native.data.rawValue);
    }
  });
  it('calculates zonal stats from native centers excluding masked cells', async () => {
    const result = await provider.execute({
      operation: 'zonal-statistics',
      ...ref,
      aoiId: 'demo-aoi-west',
    });
    expect(() => parseProcessingResult(result)).not.toThrow();
    if (result.status !== 'ok' || result.data.kind !== 'statistics')
      throw Error('stats unavailable');
    expect(result.data.statistics).toMatchObject({
      selectedCount: 8,
      count: 7,
      noDataCount: 1,
      demo: true,
      method: expect.stringContaining('native-cell-centers'),
    });
    const cells = [];
    for (const x of [103.545, 103.595])
      for (const y of [-1.525, -1.575, -1.625, -1.675]) {
        const pixel = gis.sample(ref.datasetId, y, x);
        if (pixel.status === 'ok' && pixel.data.value !== null)
          cells.push(pixel.data.value);
      }
    expect(result.data.statistics.mean).toBeCloseTo(
      cells.reduce((sum, value) => sum + value, 0) / cells.length,
      8,
    );
  });
  it('returns categorical histograms without meaningless min/max/mean of codes', async () => {
    const result = await provider.execute({
      operation: 'zonal-statistics',
      datasetId: 'demo-landcover',
      aoiId: 'demo-aoi-west',
    });
    if (result.status !== 'ok' || result.data.kind !== 'statistics')
      throw Error('stats unavailable');
    const stats = result.data.statistics;
    expect(stats).toMatchObject({
      mean: null,
      min: null,
      max: null,
      count: 799,
      noDataCount: 1,
    });
    expect(stats.histogram).toHaveLength(4);
    expect(stats.histogram.reduce((n, c) => n + c.count, 0)).toBe(stats.count);
  });
  it('computes clip and inverse-mask windows without returning full arrays or fabricated files', async () => {
    const clip = await provider.execute({
      operation: 'clip',
      ...ref,
      aoiId: 'demo-aoi-west',
    });
    const mask = await provider.execute({
      operation: 'mask',
      ...ref,
      aoiId: 'demo-aoi-west',
      keep: 'outside',
    });
    if (
      clip.status !== 'ok' ||
      mask.status !== 'ok' ||
      clip.data.kind !== 'subset' ||
      mask.data.kind !== 'subset'
    )
      throw Error('subset unavailable');
    expect(clip.data.subset).toMatchObject({
      window: { column: 0, row: 0, width: 2, height: 4 },
      selectedCount: 8,
      validCount: 7,
      noDataCount: 1,
      artifact: null,
    });
    expect(mask.data.subset).toMatchObject({ selectedCount: 8, validCount: 8 });
    expect(JSON.stringify(clip)).not.toContain('pixels');
  });
  it('normalizes continuous samples and preserves NoData rather than converting it to zero', async () => {
    const result = await provider.execute({
      operation: 'normalize',
      ...ref,
      coordinate,
      min: 1200,
      max: 3000,
    });
    if (result.status !== 'ok' || result.data.kind !== 'value')
      throw Error('value unavailable');
    expect(result.data.result.value).toBeGreaterThanOrEqual(0);
    expect(result.data.result.value).toBeLessThanOrEqual(1);
    const masked = await provider.execute({
      operation: 'normalize',
      ...ref,
      coordinate: { ...coordinate, x: 103.595, y: -1.575 },
      min: 1200,
      max: 3000,
    });
    if (masked.status === 'ok' && masked.data.kind === 'value')
      expect(masked.data.result).toMatchObject({
        value: null,
        noData: true,
        reason: 'source-nodata',
      });
    await expect(
      provider.execute({
        operation: 'normalize',
        datasetId: 'demo-landcover',
        coordinate,
        min: 10,
        max: 80,
      }),
    ).rejects.toThrow(/kategorikal/);
  });
  it('supports whitelist arithmetic, dimensional units and division-by-zero masks', async () => {
    const operation = {
      operation: 'arithmetic' as const,
      left: ref,
      right: { constant: 2, unit: '1' },
      coordinate,
      alignment: { mode: 'native-only' as const },
      operator: 'multiply' as const,
    };
    const result = await provider.execute(operation);
    const native = gis.sample(ref.datasetId, coordinate.y, coordinate.x);
    if (
      result.status === 'ok' &&
      result.data.kind === 'value' &&
      native.status === 'ok'
    )
      expect(result.data.result.value).toBeCloseTo(native.data.value! * 2, 8);
    else throw Error('arithmetic unavailable');
    const zero = await provider.execute({
      ...operation,
      operator: 'divide',
      right: { constant: 0, unit: '1' },
    });
    if (zero.status === 'ok' && zero.data.kind === 'value')
      expect(zero.data.result).toMatchObject({
        value: null,
        reason: 'division-by-zero',
      });
    await expect(
      provider.execute({ ...operation, operator: 'add' }),
    ).rejects.toThrow(/satuan/);
  });
  it('rejects resolution/period/unit mismatch and leaves explicit resampling unavailable', async () => {
    const op = {
      operation: 'arithmetic' as const,
      left: ref,
      right: { datasetId: 'demo-slope' },
      coordinate,
      alignment: { mode: 'native-only' as const },
      operator: 'add' as const,
    };
    await expect(provider.execute(op)).rejects.toThrow(/Resolusi/);
    const metadata = gis.catalog()[1].raster!;
    expect(
      await provider.execute({
        ...op,
        alignment: {
          mode: 'resample',
          grid: metadata.grid,
          crs: 'EPSG:4326',
          method: 'nearest',
        },
      }),
    ).toMatchObject({ status: 'unavailable' });
    await expect(
      provider.execute({
        ...op,
        right: { datasetId: ref.datasetId, band: 'daily_mean' },
      }),
    ).rejects.toThrow(/satuan/);
  });
  it('executes explicit class rules and same-grid weighted overlay only', async () => {
    const result = await provider.execute({
      operation: 'classify',
      ...ref,
      coordinate,
      classes: [{ from: 0, to: 4000, output: 7, label: 'Test fixture class' }],
    });
    if (result.status === 'ok' && result.data.kind === 'value')
      expect(result.data.result).toMatchObject({
        value: 7,
        classification: 'Test fixture class',
      });
    const overlay = await provider.execute({
      operation: 'weighted-overlay',
      inputs: [
        { ...ref, weight: 0.3 },
        { ...ref, weight: 0.7 },
      ],
      coordinate,
      alignment: { mode: 'native-only' },
    });
    const native = gis.sample(ref.datasetId, coordinate.y, coordinate.x);
    if (
      overlay.status === 'ok' &&
      overlay.data.kind === 'value' &&
      native.status === 'ok'
    )
      expect(overlay.data.result.value).toBeCloseTo(native.data.value!, 8);
  });
  it('checks restricted layers before querying and permits only entitled clients', () => {
    const catalog = gis.catalog().map((d) => ({
      ...d,
      accessTier: 'restricted' as const,
      projectId: 'restricted-project',
    }));
    expect(() => authorizeRasterOperands(catalog, guest, [ref])).toThrow(
      /Akses/,
    );
    expect(() =>
      authorizeRasterOperands(
        catalog,
        { role: 'b2b_client', entitledProjectIds: ['restricted-project'] },
        [ref],
      ),
    ).not.toThrow();
  });
  it('persists selected bands and styles in MapRecipe and regenerates legends in their physical units', () => {
    const recipe = applyMapAction(
      emptyRecipe(),
      { tool: 'addLayer', datasetId: ref.datasetId },
      gis.catalog(),
      guest,
    );
    const next = applyMapAction(
      recipe,
      {
        tool: 'styleRasterLayer',
        layerId: recipe.layers[0].id,
        style: {
          band: 'daily_mean',
          min: 1200 / 365,
          max: 3000 / 365,
          palette: ['#000000', '#ffffff'],
        },
      },
      gis.catalog(),
      guest,
    );
    expect(next.layers[0].style).toMatchObject({ band: 'daily_mean' });
    expect(next.legend[0].entries[0].label).toContain('mm/hari');
    expect(() =>
      applyMapAction(
        recipe,
        {
          tool: 'styleRasterLayer',
          layerId: recipe.layers[0].id,
          style: {
            band: 'unknown',
            min: 0,
            max: 1,
            palette: ['#000000', '#ffffff'],
          },
        },
        gis.catalog(),
        guest,
      ),
    ).toThrow();
  });
  it('serializes every scalar result and strips uncontracted arrays/secrets from provider output', async () => {
    for (const operation of [
      {
        operation: 'normalize' as const,
        ...ref,
        coordinate,
        min: 1200,
        max: 3000,
      },
      {
        operation: 'arithmetic' as const,
        left: ref,
        right: { constant: 0, unit: '1' },
        coordinate,
        alignment: { mode: 'native-only' as const },
        operator: 'divide' as const,
      },
      {
        operation: 'classify' as const,
        ...ref,
        coordinate,
        classes: [{ from: 0, to: 4000, output: 1, label: 'Example' }],
      },
    ]) {
      const result = await provider.execute(operation);
      expect(() =>
        parseProcessingResult({ ...result, fullRasterArray: [1, 2, 3] }),
      ).not.toThrow();
      expect(
        JSON.stringify(
          parseProcessingResult({ ...result, fullRasterArray: [1, 2, 3] }),
        ),
      ).not.toContain('fullRasterArray');
    }
    const response = await provider.samplePixel({
      ...ref,
      coordinate,
      resampling: 'nearest',
    });
    if (response.status !== 'ok') throw Error('sample unavailable');
    const sanitized = await checkedSample(
      {
        ...provider,
        samplePixel: async () => ({
          status: 'ok',
          data: {
            ...response.data,
            fullRasterArray: [1, 2, 3],
            credentials: 'never-forward',
          },
        }),
      },
      { ...ref, coordinate, resampling: 'nearest' },
    );
    expect(JSON.stringify(sanitized)).not.toContain('credentials');
    expect(JSON.stringify(sanitized)).not.toContain('fullRasterArray');
  });
  it('fails safely for rejected, malformed, mislocated and timed-out providers', async () => {
    const request = { ...ref, coordinate, resampling: 'nearest' as const };
    await expect(
      checkedSample(
        {
          ...provider,
          samplePixel: async () => {
            throw Error('private provider detail');
          },
        },
        request,
      ),
    ).rejects.toThrow(/provider/);
    const native = await provider.samplePixel(request);
    if (native.status !== 'ok') throw Error('fixture unavailable');
    for (const data of [
      { ...native.data, value: NaN },
      { ...native.data, longitude: 10 },
      { ...native.data, band: 'other' },
      {
        ...native.data,
        requestedCoordinate: { ...coordinate, x: 103.55 },
      },
    ])
      await expect(
        checkedSample(
          { ...provider, samplePixel: async () => ({ status: 'ok', data }) },
          request,
        ),
      ).rejects.toThrow();
    vi.useFakeTimers();
    const pending = checkedSample(
      { ...provider, samplePixel: () => new Promise(() => {}) },
      request,
    );
    const rejection = expect(pending).rejects.toThrow(/waktu/);
    await vi.advanceTimersByTimeAsync(5001);
    await rejection;
  });
  it('rejects incorrect provider class labels and contradictory coverage masks', async () => {
    const request = {
      datasetId: 'demo-landcover',
      coordinate,
      resampling: 'nearest' as const,
    };
    const native = await provider.samplePixel(request);
    if (native.status !== 'ok') throw Error('fixture unavailable');
    for (const data of [
      { ...native.data, classification: 'Incorrect class label' },
      { ...native.data, rawValue: 999, value: 999, classification: 'Unknown' },
      {
        ...native.data,
        rawValue: null,
        value: null,
        classification: null,
        noData: true,
        noDataReason: 'outside-coverage' as const,
      },
    ])
      await expect(
        checkedSample(
          { ...provider, samplePixel: async () => ({ status: 'ok', data }) },
          request,
        ),
      ).rejects.toThrow(/Mask\/kelas/);
  });
  it('reports unavailability without falling back to demo measurements', async () => {
    const unavailable = getRasterProvider({
      ...gis,
      mode: 'unavailable',
      sample: () => ({ status: 'unavailable', reason: 'offline' }),
    });
    expect(
      await checkedSample(unavailable, {
        ...ref,
        coordinate,
        resampling: 'nearest',
      }),
    ).toMatchObject({ status: 'unavailable' });
    expect(
      await unavailable.execute({
        operation: 'zonal-statistics',
        ...ref,
        aoiId: 'demo-aoi-west',
      }),
    ).toMatchObject({ status: 'unavailable' });
  });
});
