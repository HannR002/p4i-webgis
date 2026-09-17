export type GeoJsonPosition = number[];

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: GeoJsonPosition[][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: GeoJsonPosition[][][];
}

export type SupportedPolygonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export interface GeoJsonFeature<
  TGeometry = SupportedPolygonGeometry,
  TProperties extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'Feature';
  id?: string;
  geometry: TGeometry;
  properties: TProperties;
}

export interface GeoJsonFeatureCollection<
  TGeometry = SupportedPolygonGeometry,
  TProperties extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'FeatureCollection';
  features: Array<GeoJsonFeature<TGeometry, TProperties>>;
}
