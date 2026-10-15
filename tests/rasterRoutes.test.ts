import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/server/gis', () => ({ getGisProvider: vi.fn() }));
vi.mock('../lib/server/gis/context', () => ({
  getGisContext: vi.fn(async () => ({ role: 'guest', entitledProjectIds: [] })),
}));
import { getGisProvider } from '../lib/server/gis';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { POST as pixel } from '../app/api/gis/pixel/route';
import { POST as processRaster } from '../app/api/gis/process/route';
import { GET as tile } from '../app/api/gis/tiles/[id]/[z]/[x]/[y]/route';
import { transformCoordinate } from '../lib/gis/raster';
const coordinate = { x: 103.545, y: -1.625, crs: 'EPSG:4326' } as const;
function request(body: unknown) {
  return new Request('http://localhost/api/gis/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() =>
  vi.mocked(getGisProvider).mockReturnValue(createDemoGisProvider()),
);
describe('raster API boundary', () => {
  it('accepts projected coordinates and selected bands, returning provider values without a fabricated real label', async () => {
    const [x, y] = transformCoordinate(coordinate, 'EPSG:3857');
    const response = await pixel(
      request({
        coordinate: { x, y, crs: 'EPSG:3857' },
        datasetIds: ['demo-rainfall'],
        bands: { 'demo-rainfall': 'daily_mean' },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const result = await response.json();
    expect(result.samples[0]).toMatchObject({
      band: 'daily_mean',
      unit: 'mm/hari',
      demo: true,
      requestedCoordinate: { x, y, crs: 'EPSG:3857' },
    });
    expect(result.samples[0].longitude).toBeCloseTo(coordinate.x, 8);
  });
  it('rejects unknown bands and categorical interpolation before valid values are returned', async () => {
    expect(
      (
        await pixel(
          request({
            coordinate,
            datasetIds: ['demo-rainfall'],
            bands: { 'demo-rainfall': 'unknown' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await pixel(
          request({
            coordinate,
            datasetIds: ['demo-landcover'],
            resampling: 'bilinear',
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('checks every layer permission before any provider query', async () => {
    const gis = createDemoGisProvider(),
      sample = vi.fn(gis.sample),
      catalog = [
        ...gis.catalog(),
        {
          ...gis.catalog()[1],
          id: 'private',
          accessTier: 'restricted' as const,
          projectId: 'private-project',
        },
      ];
    vi.mocked(getGisProvider).mockReturnValue({
      ...gis,
      catalog: () => catalog,
      sample,
    });
    expect(
      (
        await pixel(
          request({ coordinate, datasetIds: ['demo-rainfall', 'private'] }),
        )
      ).status,
    ).toBe(403);
    expect(sample).not.toHaveBeenCalled();
    expect(
      (
        await processRaster(
          request({
            operation: 'zonal-statistics',
            datasetId: 'private',
            aoiId: 'demo-aoi-west',
          }),
        )
      ).status,
    ).toBe(403);
  });
  it('returns safe 502 for provider exceptions/malformed values and 503 for unavailability', async () => {
    const gis = createDemoGisProvider();
    vi.mocked(getGisProvider).mockReturnValue({
      ...gis,
      sample: () => {
        throw Error('do not disclose provider details');
      },
    });
    const response = await pixel(
      request({ coordinate, datasetIds: ['demo-rainfall'] }),
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(
      'do not disclose',
    );
    vi.mocked(getGisProvider).mockReturnValue({
      ...gis,
      sample: () => ({ status: 'unavailable', reason: 'offline' }),
    });
    expect(
      (await pixel(request({ coordinate, datasetIds: ['demo-rainfall'] })))
        .status,
    ).toBe(503);
  });
  it('executes native statistics and reports unavailability when processing is not enabled', async () => {
    const response = await processRaster(
      request({
        operation: 'zonal-statistics',
        datasetId: 'demo-rainfall',
        aoiId: 'demo-aoi-west',
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.statistics.count).toBe(7);
    const gis = createDemoGisProvider();
    vi.mocked(getGisProvider).mockReturnValue({ ...gis, mode: 'unavailable' });
    expect(
      (
        await processRaster(
          request({
            operation: 'zonal-statistics',
            datasetId: 'demo-rainfall',
            aoiId: 'demo-aoi-west',
          }),
        )
      ).status,
    ).toBe(503);
  });
  it('rejects mixed grids, code operators and oversized requests', async () => {
    expect(
      (
        await processRaster(
          request({
            operation: 'arithmetic',
            left: { datasetId: 'demo-rainfall' },
            right: { datasetId: 'demo-slope' },
            coordinate,
            operator: 'add',
            alignment: { mode: 'native-only' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await processRaster(
          request({
            operation: 'arithmetic',
            left: { datasetId: 'demo-rainfall' },
            right: { constant: 1, unit: '1' },
            coordinate,
            operator: 'eval',
            alignment: { mode: 'native-only' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await pixel(
          new Request('http://localhost/api/gis/pixel', {
            method: 'POST',
            body: 'x'.repeat(65537),
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('renders selected-band tiles through the same native provider and rejects style injection', async () => {
    const params = Promise.resolve({
      id: 'demo-rainfall',
      z: '12',
      x: '3227',
      y: '2066',
    });
    const response = await tile(
      new Request(
        'http://localhost/api/gis/tiles/demo-rainfall/12/3227/2066?band=daily_mean&min=3&max=9',
      ),
      { params },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response.text()).toContain('<rect');
    expect(
      (
        await tile(
          new Request(
            'http://localhost/api/gis/tiles/demo-rainfall/12/3227/2066?palette=javascript:evil,%23ffffff',
          ),
          { params },
        )
      ).status,
    ).toBe(400);
  });
});
