import { describe, expect, it } from 'vitest';
import { WEBMAPS } from '../lib/gis/catalog';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import {
  filterWebmaps,
  filterDatasets,
  webmapStatus,
} from '../lib/gis/presentation';
const datasets = createDemoGisProvider().catalog();
describe('catalog presentation', () => {
  it('combines normalized keyword search and category filtering', () => {
    expect(filterWebmaps('  CURAH  ', 'Iklim').map((m) => m.id)).toEqual([
      'climate',
    ]);
    expect(filterWebmaps('Curah', 'Topografi')).toHaveLength(0);
    expect(filterWebmaps('absent')).toHaveLength(0);
  });
  it('filters dataset type, category and availability together', () => {
    const result = filterDatasets(datasets, {
      query: 'hujan',
      type: 'raster',
      category: 'Iklim',
      status: 'demo',
    });
    expect(result.map((d) => d.id)).toEqual(['demo-rainfall']);
    expect(
      filterDatasets(datasets, {
        query: '',
        type: 'all',
        category: 'all',
        status: 'available',
      }),
    ).toHaveLength(0);
  });
  it('never labels missing, unavailable or mixed fixture layers as real available data', () => {
    const map = WEBMAPS[1];
    expect(webmapStatus(map, [])).toBe('unavailable');
    expect(webmapStatus(map, datasets)).toBe('demo');
    expect(
      webmapStatus(
        map,
        datasets.map((d) => ({ ...d, status: 'available' })),
      ),
    ).toBe('available');
    expect(
      webmapStatus(
        map,
        datasets.map((d) => ({
          ...d,
          status: d.id === 'demo-soil' ? 'unavailable' : 'demo',
        })),
      ),
    ).toBe('unavailable');
  });
});
