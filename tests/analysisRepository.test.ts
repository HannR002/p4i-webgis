import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
import { defaultConfiguration } from '../lib/gis/analysisConfiguration';
import {
  ANALYSIS_STORAGE_KEY,
  createAnalysisConfigurationRepository,
} from '../lib/gis/analysisRepository';
const catalog = createDemoGisProvider().catalog();
const date = '2026-01-01T00:00:00.000Z';
function setup() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  return {
    data,
    storage,
    repo: createAnalysisConfigurationRepository(
      storage,
      catalog,
      () => '2026-02-01T00:00:00.000Z',
    ),
  };
}
describe('local configuration repository', () => {
  it('saves, reloads, versions, duplicates and deletes named drafts without aliasing', () => {
    const { repo, storage } = setup();
    expect(repo.list()).toEqual([]);
    const c = defaultConfiguration('ahp-smce', catalog, undefined, date);
    const saved = repo.save({ ...c, name: 'Scenario A' });
    expect(saved.version).toBe(1);
    const changed = repo.save({ ...saved, notes: 'Updated' });
    expect(changed.version).toBe(2);
    expect(changed.createdAt).toBe(date);
    const reopened = createAnalysisConfigurationRepository(
      storage,
      catalog,
    ).get(c.id);
    expect(reopened).toEqual(changed);
    changed.name = 'Mutated outside';
    expect(repo.get(c.id)?.name).toBe('Scenario A');
    const copy = repo.duplicate(repo.get(c.id)!);
    expect(copy.id).not.toBe(c.id);
    expect(copy.version).toBe(1);
    expect(copy.parameters).toEqual(c.parameters);
    repo.delete(copy.id, copy.version);
    expect(repo.list()).toHaveLength(1);
  });
  it('detects stale revisions from another repository instance before writes/deletes', () => {
    const { repo, storage, data } = setup();
    const saved = repo.save(
      defaultConfiguration('wlc', catalog, undefined, date),
    );
    const second = createAnalysisConfigurationRepository(
      storage,
      catalog,
      () => '2026-03-01T00:00:00.000Z',
    );
    second.save({ ...saved, name: 'Changed elsewhere' });
    const before = data.get(ANALYSIS_STORAGE_KEY);
    expect(() => repo.save(saved)).toThrow(/tab lain/);
    expect(() => repo.delete(saved.id, 1)).toThrow(/berubah/);
    expect(data.get(ANALYSIS_STORAGE_KEY)).toBe(before);
  });
  it('preserves corrupt/future/invalid saved data and surfaces storage failures', () => {
    const { repo, data } = setup();
    const c = defaultConfiguration('ahp-smce', catalog, undefined, date);
    for (const raw of [
      '{broken',
      JSON.stringify({ schemaVersion: 2, configurations: [] }),
      JSON.stringify({
        schemaVersion: 1,
        configurations: [{ ...c, experimental: false }],
      }),
    ]) {
      data.set(ANALYSIS_STORAGE_KEY, raw);
      expect(() => repo.list()).toThrow();
      expect(() => repo.save(c)).toThrow();
      expect(data.get(ANALYSIS_STORAGE_KEY)).toBe(raw);
    }
    const blocked = createAnalysisConfigurationRepository(
      {
        getItem: () => null,
        setItem: () => {
          throw Error('Quota exceeded');
        },
      },
      catalog,
    );
    expect(() => blocked.save(c)).toThrow(/Quota/);
  });
  it('bounds library size and retains imported historical revision', () => {
    const { repo } = setup();
    const c = defaultConfiguration('ahp-smce', catalog, undefined, date);
    expect(repo.save({ ...c, version: 4 }).version).toBe(4);
    for (let i = 1; i < 30; i++) repo.save({ ...c, id: `scenario-${i}` });
    expect(repo.list()).toHaveLength(30);
    expect(() => repo.duplicate(c)).toThrow(/30/);
  });
});
