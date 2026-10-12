import { describe, it, expect, vi, afterEach } from 'vitest';
import { demoEnabled } from '../lib/gis/mode';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { validateRasterMetadata, validatePixelSample } from '../lib/gis/validation';
vi.mock('server-only', () => ({}));
import { getGisProvider } from '../lib/server/gis';
describe('raster pixels and fixture isolation', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('requires an explicit development flag and rejects production demo', () => {
    expect(demoEnabled({ NODE_ENV: 'development', GIS_DEMO_MODE: 'true' })).toBe(true);
    for (const NODE_ENV of ['test', 'production', undefined])
      expect(demoEnabled({ NODE_ENV, GIS_DEMO_MODE: 'true' })).toBe(false);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GIS_DEMO_MODE', 'true');
    const p = getGisProvider();
    expect(p.mode).toBe('unavailable');
    expect(p.sample('demo-rainfall', -1.6, 103.6).status).toBe('unavailable');
    expect(p.vector('demo-boundaries').status).toBe('unavailable');
  });
  it('validates positive resolution and nearest resampling for categories', () => {
    const m = createDemoGisProvider()
      .catalog()
      .find((d) => d.id === 'demo-landcover')!.raster!;
    expect(() => validateRasterMetadata(m)).not.toThrow();
    expect(() => validateRasterMetadata({ ...m, resampling: 'bilinear' })).toThrow();
    expect(() => validateRasterMetadata({ ...m, resolution: { ...m.resolution, x: 0 } })).toThrow();
  });
  it('samples deterministically on the native grid with provenance and units', () => {
    const p = createDemoGisProvider();
    const a = p.sample('demo-rainfall', -1.61, 103.58);
    const b = p.sample('demo-rainfall', -1.611, 103.581);
    expect(a.status).toBe('ok');
    if (a.status === 'ok' && b.status === 'ok') {
      expect(a.data.value).toBe(b.data.value);
      expect(a.data.demo).toBe(true);
      expect(a.data.unit).toBe('mm/tahun');
      expect(a.data.resolution.unit).toBe('degree');
      expect(() => validatePixelSample(a.data)).not.toThrow();
    }
  });
  it('marks outside-coverage samples as NoData, rejects invalid coordinates', () => {
    const p = createDemoGisProvider();
    const sample = p.sample('demo-rainfall', 0, 0);
    if (sample.status === 'ok') {
      expect(sample.data.noData).toBe(true);
      expect(sample.data.value).toBeNull();
      expect(() => validatePixelSample({ ...sample.data, value: 42 })).toThrow();
    } else throw new Error('sample did not execute');
    expect(() => p.sample('demo-rainfall', NaN, 0)).toThrow();
  });
  it('returns valid categorical classes and excludes unknown datasets', () => {
    const p = createDemoGisProvider();
    const s = p.sample('demo-landcover', -1.6, 103.6);
    expect(s.status).toBe('ok');
    if (s.status === 'ok') {
      expect([10, 40, 50, 80]).toContain(s.data.value);
      expect(s.data.classification).not.toBeNull();
      expect(s.data.resampling).toBe('nearest');
    }
    expect(p.sample('invented', 0, 0).status).toBe('unavailable');
  });
});
