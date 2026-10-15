import type { FeatureCollection, MultiPolygon } from 'geojson';
import { DATASET_DEFINITIONS } from '../../../gis/catalog';
import type { RasterDataset, RasterMetadata } from '../../../gis/contracts';
import { sampleGrid } from '../../../gis/raster';
import {
  finite,
  GisInputError,
  validatePixelSample,
} from '../../../gis/validation';
import type { GisDataProvider } from '../contracts';

export const DEMO_AREAS: FeatureCollection<MultiPolygon> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'demo-aoi-west',
      properties: {
        id: 'demo-aoi-west',
        name: 'Area contoh Barat',
        demo: true,
      },
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
      properties: {
        id: 'demo-aoi-east',
        name: 'Area contoh Timur',
        demo: true,
      },
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
    sample(id, latitude, longitude, options) {
      if (!finite(latitude, -90, 90) || !finite(longitude, -180, 180))
        throw new GisInputError('Koordinat tidak valid');
      const dataset = catalog.find((dataset) => dataset.id === id);
      if (!dataset?.raster || dataset.type !== 'raster')
        return { status: 'unavailable', reason: 'Raster belum tersedia' };
      const sample = sampleGrid(
        dataset as RasterDataset,
        { x: longitude, y: latitude, crs: 'EPSG:4326' },
        options?.band,
        options?.resampling ?? 'nearest',
        fixtureReader(dataset.raster),
      );
      validatePixelSample(sample);
      return { status: 'ok', data: sample };
    },
  };
}

export function fixtureReader(metadata: RasterMetadata) {
  return (column: number, row: number): number | null => {
    if (column === 1 && row === 1) return null;
    if (metadata.classes)
      return metadata.classes[
        (column * 13 + row * 7 + 3) % metadata.classes.length
      ].value;
    const fraction = ((column * 13 + row * 7 + 3) % 101) / 100;
    return Number(
      (
        (metadata.range?.[0] ?? 0) +
        fraction * ((metadata.range?.[1] ?? 1) - (metadata.range?.[0] ?? 0))
      ).toFixed(2),
    );
  };
}
