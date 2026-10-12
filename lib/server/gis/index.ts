import 'server-only';
import { DATASET_DEFINITIONS } from '../../gis/catalog';
import { demoEnabled } from '../../gis/mode';
import type { GisDataProvider } from './contracts';
import { createDemoGisProvider } from './providers/demo';

export function getGisProvider(): GisDataProvider {
  if (demoEnabled(process.env)) return createDemoGisProvider();
  return {
    mode: 'unavailable',
    catalog: () => DATASET_DEFINITIONS,
    vector: () => ({ status: 'unavailable', reason: 'Adapter dataset belum dikonfigurasi' }),
    sample: () => ({ status: 'unavailable', reason: 'Sampling raster belum dikonfigurasi' }),
  };
}
