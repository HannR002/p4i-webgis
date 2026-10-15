import type {
  AnalysisConfigurationRepository,
  GISAnalysisConfiguration,
  GISAnalysisType,
} from './analysisContracts';
import type { Dataset, GisContext, MapRecipe } from './contracts';
import {
  defaultConfiguration,
  parseAnalysisConfiguration,
  refreshConfigurationSources,
} from './analysisConfiguration';
import { prepareConfigurationApplication } from './analysisApplication';
import { record, text, GisInputError } from './validation';
import { canAccessDataset, GisPermissionError } from './recipe';
import { calculatePreferences } from '../../utils/analysisPreferences';
export type AnalysisConfigurationToolRequest =
  | { tool: 'listAnalysisConfigurations' }
  | { tool: 'selectAnalysisConfiguration'; id: string }
  | {
      tool: 'createAnalysisConfigurationDraft';
      analysisType: GISAnalysisType;
      name?: string;
    }
  | {
      tool: 'proposeAnalysisConfigurationChanges';
      id: string;
      changes: Partial<
        Pick<
          GISAnalysisConfiguration,
          | 'name'
          | 'description'
          | 'notes'
          | 'criteria'
          | 'parameters'
          | 'weights'
          | 'classificationRules'
          | 'selectedAOI'
        >
      >;
    }
  | {
      tool: 'prepareConfiguredAnalysis';
      configuration: GISAnalysisConfiguration;
    };
export const ANALYSIS_CONFIGURATION_TOOLS = [
  'listAnalysisConfigurations',
  'selectAnalysisConfiguration',
  'createAnalysisConfigurationDraft',
  'proposeAnalysisConfigurationChanges',
  'prepareConfiguredAnalysis',
] as const;
// No execution, persistence or remote computations: proposals require an explicit UI apply/save.
export function handleAnalysisConfigurationTool(
  raw: unknown,
  repository: AnalysisConfigurationRepository,
  catalog: readonly Dataset[],
  context: GisContext,
  recipe: MapRecipe,
  mode: 'demo' | 'available' | 'unavailable',
) {
  if (!record(raw) || !ANALYSIS_CONFIGURATION_TOOLS.includes(raw.tool as never))
    throw new GisInputError('Tool konfigurasi tidak dikenal');
  const fields: Record<string, string[]> = {
    listAnalysisConfigurations: [],
    selectAnalysisConfiguration: ['id'],
    createAnalysisConfigurationDraft: ['analysisType', 'name'],
    proposeAnalysisConfigurationChanges: ['id', 'changes'],
    prepareConfiguredAnalysis: ['configuration'],
  };
  if (
    Object.keys(raw).some(
      (k) => k !== 'tool' && !fields[String(raw.tool)].includes(k),
    )
  )
    throw new GisInputError('Parameter tool konfigurasi tidak diizinkan');
  const authorized = (value: unknown) => {
    const c = parseAnalysisConfiguration(value, catalog);
    if (
      c.inputDatasetIds.some(
        (id) =>
          !canAccessDataset(
            catalog.find((d) => d.id === id)!,
            context,
          ),
      )
    )
      throw new GisPermissionError('Akses konfigurasi ditolak');
    return c;
  };
  if (raw.tool === 'listAnalysisConfigurations')
    return {
      kind: 'list' as const,
      configurations: repository
        .list()
        .filter((c) =>
          c.inputDatasetIds.every((id) =>
            canAccessDataset(
              catalog.find((d) => d.id === id)!,
              context,
            ),
          ),
        )
        .map((c) => ({
          id: c.id,
          name: c.name,
          analysisType: c.analysisType,
          version: c.version,
          experimental: true as const,
        })),
    };
  if (raw.tool === 'createAnalysisConfigurationDraft') {
    if (raw.name !== undefined && !text(raw.name, 120))
      throw new GisInputError('Nama draft tidak valid');
    const c = defaultConfiguration(
      raw.analysisType as GISAnalysisType,
      catalog,
      recipe,
    );
    return {
      kind: 'draft' as const,
      configuration: authorized({
        ...c,
        ...(raw.name ? { name: raw.name } : {}),
      }),
    };
  }
  if (raw.tool === 'prepareConfiguredAnalysis')
    return prepareConfigurationApplication(
      authorized(raw.configuration),
      recipe,
      catalog,
      context,
      mode,
    );
  if (!text(raw.id, 100)) throw new GisInputError('ID konfigurasi diperlukan');
  const stored = repository.get(raw.id);
  if (!stored) throw new GisInputError('Konfigurasi tidak ditemukan');
  const c = authorized(stored);
  if (raw.tool === 'selectAnalysisConfiguration')
    return { kind: 'selection' as const, configuration: c };
  if (
    !record(raw.changes) ||
    Object.keys(raw.changes).some(
      (k) =>
        ![
          'name',
          'description',
          'notes',
          'criteria',
          'parameters',
          'weights',
          'classificationRules',
          'selectedAOI',
        ].includes(k),
    )
  )
    throw new GisInputError('Perubahan AI tidak diizinkan');
  const candidate = { ...c, ...raw.changes } as GISAnalysisConfiguration;
  if (candidate.analysisType === 'ahp-smce')
    candidate.weights = {
      ...calculatePreferences(candidate.parameters.pairwise).weights,
    };
  return {
    kind: 'proposal' as const,
    configuration: authorized(refreshConfigurationSources(candidate, catalog)),
  };
}
