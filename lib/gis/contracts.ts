import type { AppRole } from '../authRoles';

export type GisRole = AppRole | 'guest';
export type Bounds = [west: number, south: number, east: number, north: number];
export interface RasterBand {
  id: string;
  unit: string;
  kind: 'continuous' | 'categorical';
}
export interface RasterMetadata {
  crs: string;
  resolution: { x: number; y: number; unit: 'metre' | 'degree' };
  bands: RasterBand[];
  noData: { value: number | null; meaning: string };
  resampling: 'nearest' | 'bilinear';
  period: { start: string; end: string };
  range?: [number, number];
  classes?: { value: number; label: string; color: string }[];
}
export interface Dataset {
  id: string;
  title: string;
  description: string;
  type: 'vector' | 'raster';
  geometryType?: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
  source: string;
  provider: string;
  license: string;
  version: string;
  updatedAt: string;
  crs: string;
  bounds: Bounds;
  tags: string[];
  category: string;
  accessTier: 'public' | 'restricted';
  projectId?: string;
  status: 'demo' | 'unavailable' | 'available';
  formats: string[];
  raster?: RasterMetadata;
  provenance: string;
}
export interface RasterStyle {
  palette: string[];
  min: number;
  max: number;
}
export type RasterDataset = Dataset & { type: 'raster'; raster: RasterMetadata };
export interface RasterStatistics {
  datasetId: string;
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  unit: string;
  method: string;
  version: string;
}
export interface VectorStyle {
  color: string;
  fillColor: string;
  weight: number;
}
export interface MapLayerConfiguration {
  id: string;
  datasetId: string;
  type: Dataset['type'];
  visible: boolean;
  opacity: number;
  style: VectorStyle | RasterStyle;
}
export type RasterLayer = MapLayerConfiguration & { type: 'raster'; style: RasterStyle };
export interface MapViewport {
  center: [latitude: number, longitude: number];
  zoom: number;
}
export interface MapLegend {
  datasetId: string;
  title: string;
  entries: { label: string; color: string }[];
}
export interface MapRecipe {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  basemap: 'osm' | 'none';
  viewport: MapViewport;
  layers: MapLayerConfiguration[];
  aoi: { id: string; name: string; kind: 'administrative' | 'demo' } | null;
  legend: MapLegend[];
  analysis: {
    method: 'ahp-wlc';
    weights: { bencana: number; kesuburan: number; kepadatan: number };
    cr: number;
    provisional: true;
  } | null;
  provenance: 'human' | 'ai';
}
export type MapDocument = MapRecipe;
export interface PixelSample {
  datasetId: string;
  latitude: number;
  longitude: number;
  value: number | null;
  unit: string;
  classification: string | null;
  source: string;
  version: string;
  period: RasterMetadata['period'];
  resolution: RasterMetadata['resolution'];
  crs: string;
  band: string;
  noData: boolean;
  resampling: RasterMetadata['resampling'];
  provenance: string;
  demo: boolean;
}
export type RasterOperation =
  | { operation: 'sample'; datasetIds: string[]; latitude: number; longitude: number }
  | { operation: 'zonal-statistics'; datasetId: string; aoiId: string }
  | { operation: 'clip'; datasetId: string; aoiId: string }
  | {
      operation: 'reclassify';
      datasetId: string;
      classes: { from: number; to: number; output: number }[];
    }
  | { operation: 'normalize'; datasetId: string; min: number; max: number }
  | { operation: 'weighted-overlay'; inputs: { datasetId: string; weight: number }[] };
export type ServiceResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable'; reason: string };
export interface RasterAnalysisService {
  execute(operation: RasterOperation): Promise<ServiceResult<PixelSample[] | RasterStatistics>>;
}
export interface GisContext {
  role: GisRole;
  entitledProjectIds: readonly string[];
}
export type MapAction =
  | { tool: 'createMap'; title: string }
  | { tool: 'setMapTitle'; title: string }
  | { tool: 'setBasemap'; basemap: MapRecipe['basemap'] }
  | { tool: 'setViewport'; center: [number, number]; zoom: number }
  | { tool: 'addLayer'; datasetId: string }
  | { tool: 'removeLayer'; layerId: string }
  | { tool: 'toggleLayer'; layerId: string; visible: boolean }
  | { tool: 'reorderLayer'; layerId: string; index: number }
  | { tool: 'setLayerOpacity'; layerId: string; opacity: number }
  | { tool: 'styleVectorLayer'; layerId: string; style: VectorStyle }
  | { tool: 'styleRasterLayer'; layerId: string; style: RasterStyle }
  | { tool: 'zoomToLayer'; layerId: string }
  | { tool: 'selectAOI'; aoiId: string }
  | { tool: 'generateLegend' };
export type GisReadTool =
  | 'searchDatasetCatalog'
  | 'listAvailableLayers'
  | 'getLayerMetadata'
  | 'samplePixel'
  | 'summarizeCurrentMap';
export interface GisPlan {
  provider: 'deterministic-demo';
  intent: string;
  message: string;
  actions: MapAction[];
  unavailable: string[];
  sources: string[];
}
