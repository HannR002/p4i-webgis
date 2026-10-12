import type { FeatureCollection, MultiPolygon } from 'geojson';
import type { Dataset, PixelSample, ServiceResult } from '../../gis/contracts';

export interface GisDataProvider {
  mode: 'demo' | 'unavailable';
  catalog(): readonly Dataset[];
  vector(datasetId: string): ServiceResult<FeatureCollection<MultiPolygon>>;
  sample(datasetId: string, latitude: number, longitude: number): ServiceResult<PixelSample>;
}
