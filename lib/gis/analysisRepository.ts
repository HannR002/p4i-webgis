import type {
  AnalysisConfigurationRepository,
  GISAnalysisConfiguration,
} from './analysisContracts';
import type { Dataset } from './contracts';
import {
  configurationId,
  parseAnalysisConfiguration,
} from './analysisConfiguration';
import { record, GisInputError } from './validation';
export const ANALYSIS_STORAGE_KEY = 'p4i-analysis-configurations-v1';
export const MAX_SAVED_CONFIGURATIONS = 30;
export interface ConfigurationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
// Inject browser localStorage or an in-memory implementation. No production tables or secrets.
export function createAnalysisConfigurationRepository(
  storage: ConfigurationStorage,
  catalog: readonly Dataset[],
  clock = () => new Date().toISOString(),
): AnalysisConfigurationRepository {
  const read = (): GISAnalysisConfiguration[] => {
    const raw = storage.getItem(ANALYSIS_STORAGE_KEY);
    if (raw === null) return [];
    if (raw.length > 512 * 1024)
      throw new GisInputError('Bibliotek konfigurasi terlalu besar');
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new GisInputError(
        'Penyimpanan konfigurasi rusak; data tidak ditimpa',
      );
    }
    if (
      !record(value) ||
      value.schemaVersion !== 1 ||
      Object.keys(value).some(
        (k) => !['schemaVersion', 'configurations'].includes(k),
      ) ||
      !Array.isArray(value.configurations) ||
      value.configurations.length > MAX_SAVED_CONFIGURATIONS
    )
      throw new GisInputError(
        'Versi/bentuk penyimpanan tidak didukung; data tidak ditimpa',
      );
    const configs = value.configurations.map((v) =>
      parseAnalysisConfiguration(v, catalog),
    );
    if (new Set(configs.map((c) => c.id)).size !== configs.length)
      throw new GisInputError('ID konfigurasi tersimpan ganda');
    return configs;
  };
  const write = (configs: GISAnalysisConfiguration[]) => {
    const raw = JSON.stringify({ schemaVersion: 1, configurations: configs });
    if (raw.length > 512 * 1024)
      throw new GisInputError('Bibliotek konfigurasi terlalu besar');
    storage.setItem(ANALYSIS_STORAGE_KEY, raw);
  };
  const repository: AnalysisConfigurationRepository = {
    list: () => read(),
    get: (id) => read().find((c) => c.id === id) ?? null,
    save: (input) => {
      const config = parseAnalysisConfiguration(input, catalog),
        configs = read(),
        index = configs.findIndex((c) => c.id === config.id),
        previous = configs[index];
      if (previous && previous.version !== config.version)
        throw new GisInputError(
          'Konfigurasi berubah di tab lain; muat ulang sebelum menyimpan',
        );
      if (!previous && configs.length >= MAX_SAVED_CONFIGURATIONS)
        throw new GisInputError('Maksimal 30 konfigurasi lokal');
      const saved = parseAnalysisConfiguration(
        {
          ...config,
          version: previous ? previous.version + 1 : config.version,
          createdAt: previous?.createdAt ?? config.createdAt,
          updatedAt: clock(),
        },
        catalog,
      );
      if (index < 0) configs.push(saved);
      else configs[index] = saved;
      write(configs);
      return structuredClone(saved);
    },
    duplicate: (input) => {
      const config = parseAnalysisConfiguration(input, catalog),
        now = clock();
      return repository.save({
        ...config,
        id: configurationId(),
        name: `${config.name.slice(0, 100)} (salinan)`,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    },
    delete: (id, expectedVersion) => {
      const configs = read(),
        current = configs.find((c) => c.id === id);
      if (!current || current.version !== expectedVersion)
        throw new GisInputError(
          'Konfigurasi berubah; muat ulang sebelum menghapus',
        );
      write(configs.filter((c) => c.id !== id));
    },
  };
  return repository;
}
