import type { SketchLayer, VectorAction } from './vectorEditing';
import type { AnalysisMapResult } from './computeContracts';
import type { AppRole } from '../authRoles';
import type { GISAnalysisConfiguration } from './analysisContracts';

export type GisRole = AppRole | 'guest';
export type Bounds = [west: number, south: number, east: number, north: number];
export interface RasterBand {
  id: string;
  unit: string;
  kind: 'continuous' | 'categorical';
  scale: number;
  offset: number;
  range?: [number, number];
}
export type RasterCrs = 'EPSG:4326' | 'EPSG:3857';
export interface RasterCoordinate {
  x: number;
  y: number;
  crs: RasterCrs;
}
export interface RasterGrid {
  origin: [x: number, y: number];
  pixelSize: [width: number, height: number];
  width: number;
  height: number;
  pixelReference: 'area';
}
export interface RasterMetadata {
  crs: string;
  grid: RasterGrid;
  scale: number;
  version: string;
  provenance: string;
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
  band?: string;
  palette: string[];
  min: number;
  max: number;
}
export type RasterDataset = Dataset & {
  type: 'raster';
  raster: RasterMetadata;
};
export interface RasterStatistics {
  datasetId: string;
  band: string;
  kind: RasterBand['kind'];
  count: number;
  noDataCount: number;
  aoiAreaSquareMetres: number;
  areaMethod: 'spherical approximation';
  selectedCount: number;
  histogram: { value: number; label: string; count: number }[];
  demo: boolean;
  crs: string;
  resolution: RasterMetadata['resolution'];
  provenance: string;
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
export type RasterLayer = MapLayerConfiguration & {
  type: 'raster';
  style: RasterStyle;
};
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
  sketchLayers?: SketchLayer[];
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
    weightMethod?: 'ahp' | 'manual-wlc';
  } | null;
  analysisConfiguration?: GISAnalysisConfiguration;
  analysisResults?: AnalysisMapResult[];
  provenance: 'human' | 'ai';
}
export type MapDocument = MapRecipe;
export interface PixelSample {
  datasetId: string;
  latitude: number;
  longitude: number;
  value: number | null;
  rawValue: number | null;
  bandKind: RasterBand['kind'];
  encoding: { scale: number; offset: number };
  requestedCoordinate: RasterCoordinate;
  cell: { column: number; row: number; center: [number, number] } | null;
  noDataReason: 'outside-coverage' | 'masked' | 'invalid-neighborhood' | null;
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
export interface RasterOperand {
  datasetId: string;
  band?: string;
}
export type RasterAlignment =
  | { mode: 'native-only' }
  | {
      mode: 'resample';
      grid: RasterGrid;
      method: 'nearest' | 'bilinear';
      crs: RasterCrs;
    };
export type RasterOperation =
  | {
      operation: 'sample';
      datasetIds: string[];
      latitude: number;
      longitude: number;
    }
  | ({ operation: 'zonal-statistics'; aoiId: string } & RasterOperand)
  | ({ operation: 'clip'; aoiId: string } & RasterOperand)
  | ({
      operation: 'mask';
      aoiId: string;
      keep: 'inside' | 'outside';
    } & RasterOperand)
  | ({
      operation: 'classify';
      coordinate: RasterCoordinate;
      classes: { from: number; to: number; output: number; label: string }[];
    } & RasterOperand)
  | ({
      operation: 'normalize';
      coordinate: RasterCoordinate;
      min: number;
      max: number;
    } & RasterOperand)
  | {
      operation: 'arithmetic';
      coordinate: RasterCoordinate;
      operator: 'add' | 'subtract' | 'multiply' | 'divide';
      left: RasterOperand;
      right: RasterOperand | { constant: number; unit: string };
      alignment: RasterAlignment;
    }
  | {
      operation: 'weighted-overlay';
      coordinate: RasterCoordinate;
      inputs: (RasterOperand & { weight: number })[];
      alignment: RasterAlignment;
    };
export interface RasterValueResult {
  value: number | null;
  unit: string;
  noData: boolean;
  reason: 'source-nodata' | 'division-by-zero' | 'unclassified' | null;
  classification: string | null;
  coordinate: RasterCoordinate;
  sources: RasterOperand[];
  demo: boolean;
}
export interface RasterSubset {
  datasetId: string;
  band: string;
  version: string;
  crs: string;
  nativeGrid: RasterGrid;
  window: { column: number; row: number; width: number; height: number } | null;
  aoiId: string;
  rule: 'cell-center';
  keep: 'inside' | 'outside';
  selectedCount: number;
  validCount: number;
  noDataCount: number;
  artifact: null; // A computed window/mask descriptor is not a downloadable raster file.
}
export type RasterProcessingResult =
  | {
      status: 'ok';
      operation: RasterOperation['operation'];
      demo: boolean;
      provenance: string;
      data:
        | { kind: 'samples'; samples: PixelSample[] }
        | { kind: 'value'; result: RasterValueResult }
        | { kind: 'statistics'; statistics: RasterStatistics }
        | { kind: 'subset'; subset: RasterSubset };
    }
  | { status: 'unavailable'; reason: string };
export type ServiceResult<T> =
  { status: 'ok'; data: T } | { status: 'unavailable'; reason: string };
export interface RasterAnalysisService {
  execute(
    operation: RasterOperation,
    options?: { signal?: AbortSignal },
  ): Promise<RasterProcessingResult>;
}
export interface RasterProvider extends RasterAnalysisService {
  id: string;
  mode: 'demo' | 'available' | 'unavailable';
  catalog(): readonly Dataset[];
  samplePixel(request: {
    datasetId: string;
    band?: string;
    coordinate: RasterCoordinate;
    resampling: 'nearest' | 'bilinear';
    signal?: AbortSignal;
  }): Promise<ServiceResult<PixelSample>>;
}
export interface GisContext {
  role: GisRole;
  entitledProjectIds: readonly string[];
}
export type MapAction =
  | VectorAction
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
