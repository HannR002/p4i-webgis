import 'server-only';
import { createDemoGisProvider } from './demo';
import type { GisDataProvider } from '../contracts';
/** Explicit synthetic adapter; no external DB, auth, filesystem or cloud transport. */
export function createAcademicGisProvider(): GisDataProvider {
  const fixture = createDemoGisProvider();
  const catalog = fixture.catalog().filter((d) => d.accessTier === 'public' && d.id.startsWith('demo-'));
  const allowed = new Set(catalog.map((d) => d.id));
  return {
    mode: 'demo',
    catalog: () => structuredClone(catalog),
    vector: (id) => allowed.has(id) ? fixture.vector(id) : { status: 'unavailable', reason: 'Dataset tidak tersedia dalam preview akademik' },
    sample: (id, latitude, longitude, options) => allowed.has(id) ? fixture.sample(id, latitude, longitude, options) : { status: 'unavailable', reason: 'Dataset tidak tersedia dalam preview akademik' },
  };
}
