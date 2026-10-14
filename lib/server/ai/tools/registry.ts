// Provider-neutral policy is shared with client response validation; no SDK or secret imports.
export { GIS_TOOL_REGISTRY } from '../../../gis/copilotRegistry';
export type {
  GISToolDefinition,
  GISToolRegistry,
} from '../../../gis/copilotContracts';
export const READ_TOOLS = [
  'searchDatasetCatalog',
  'listAvailableLayers',
  'getDatasetMetadata',
  'inspectPixel',
  'summarizeCurrentMap',
  'listAnalysisConfigurations',
  'prepareAnalysis',
] as const;
export const REMOTE_TOOLS = ['runFloodAnalysis', 'publishMap'] as const;
