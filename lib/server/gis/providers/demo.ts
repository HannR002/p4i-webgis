import type { FeatureCollection, MultiPolygon } from 'geojson';
import { DATASET_DEFINITIONS } from '../../../gis/catalog';
import type { PixelSample } from '../../../gis/contracts';
import {
  coordinates,
  GisInputError,
  validatePixelSample,
  validateRasterMetadata,
} from '../../../gis/validation';
import type { GisDataProvider } from '../contracts';

export const DEMO_AREAS: FeatureCollection<MultiPolygon> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'demo-aoi-west',
      properties: { id: 'demo-aoi-west', name: 'Area contoh Barat', demo: true },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [103.52, -1.7],
              [103.62, -1.7],
              [103.62, -1.5],
              [103.52, -1.5],
              [103.52, -1.7],
            ],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'demo-aoi-east',
      properties: { id: 'demo-aoi-east', name: 'Area contoh Timur', demo: true },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [103.62, -1.7],
              [103.72, -1.7],
              [103.72, -1.5],
              [103.62, -1.5],
              [103.62, -1.7],
            ],
          ],
        ],
      },
    },
  ],
};
export function createDemoGisProvider(): GisDataProvider {
  const catalog = DATASET_DEFINITIONS.map((d) => ({
    ...structuredClone(d),
    status: 'demo' as const,
  }));
  return {
    mode: 'demo',
    catalog: () => catalog,
    vector(id) {
      return id === 'demo-boundaries'
        ? { status: 'ok', data: structuredClone(DEMO_AREAS) }
        : { status: 'unavailable', reason: 'Dataset vektor tidak dikenal' };
    },
    sample(id, latitude, longitude) {
      if (!coordinates([latitude, longitude])) throw new GisInputError('Koordinat tidak valid');
      const d = catalog.find((d) => d.id === id);
      const m = d?.raster;
      if (!d || !m) return { status: 'unavailable', reason: 'Raster belum tersedia' };
      validateRasterMetadata(m);
      const [w, s, e, n] = d.bounds;
      const noData = longitude < w || longitude > e || latitude < s || latitude > n;
      const x = Math.floor((longitude - w) / m.resolution.x),
        y = Math.floor((latitude - s) / m.resolution.y);
      const fraction = ((((x * 13 + y * 7 + 3) % 101) + 101) % 101) / 100;
      const value = noData
        ? null
        : m.classes
          ? m.classes[Math.floor(fraction * (m.classes.length - 1))].value
          : Number(
              (
                (m.range?.[0] ?? 0) +
                fraction * ((m.range?.[1] ?? 1) - (m.range?.[0] ?? 0))
              ).toFixed(2),
            );
      const sample: PixelSample = {
        datasetId: id,
        latitude,
        longitude,
        value,
        unit: m.bands[0].unit,
        classification: m.classes?.find((c) => c.value === value)?.label ?? null,
        source: d.source,
        version: d.version,
        period: m.period,
        resolution: m.resolution,
        crs: m.crs,
        band: m.bands[0].id,
        noData,
        resampling: m.resampling,
        provenance: d.provenance,
        demo: true,
      };
      validatePixelSample(sample);
      return { status: 'ok', data: sample };
    },
  };
}
