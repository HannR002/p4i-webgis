import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/server/database/providers/supabase/client', () => ({
  createSupabaseServiceClient: vi.fn(),
}));
import { createSupabaseRepositories } from '../lib/server/database/providers/supabase/repositories';

// Characterizes the existing two-request adapter. No database or network is used.
function adapter({
  projectError,
  layerError,
  layerThrows,
  cleanupError,
}: {
  projectError?: Error;
  layerError?: Error;
  layerThrows?: Error;
  cleanupError?: Error;
} = {}) {
  const cleanup = vi.fn().mockResolvedValue({ error: cleanupError ?? null });
  const remove = vi.fn(() => ({ eq: cleanup }));
  const insertLayers = layerThrows
    ? vi.fn().mockRejectedValue(layerThrows)
    : vi.fn().mockResolvedValue({ error: layerError ?? null });
  const insertProject = vi.fn(() => ({
    select: () => ({
      single: async () => ({
        data: projectError ? null : { id: 'new-synthetic-id' },
        error: projectError ?? null,
      }),
    }),
  }));
  const from = vi.fn((table: string) =>
    table === 'spatial_projects'
      ? { insert: insertProject, delete: remove }
      : { insert: insertLayers },
  );
  const client = { from } as unknown as Parameters<
    typeof createSupabaseRepositories
  >[0];
  return {
    repository: createSupabaseRepositories(client).projects,
    insertLayers,
    remove,
    cleanup,
  };
}
const project = {
  title: 'Synthetic',
  category: null,
  description: null,
  accessTier: 'public' as const,
};
const layers = [
  {
    layerName: 'A',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: {},
    fileSizeBytes: 10,
  },
];
describe('existing legacy project persistence limitations (not transaction certification)', () => {
  it('does not insert layers or delete records after rejected project creation', async () => {
    const error = Error('project denied'),
      s = adapter({ projectError: error });
    await expect(s.repository.createWithLayers(project, layers)).rejects.toBe(
      error,
    );
    expect(s.insertLayers).not.toHaveBeenCalled();
    expect(s.remove).not.toHaveBeenCalled();
  });
  it('historically compensates a reported layer error only against its newly returned project ID', async () => {
    const error = Error('layers denied'),
      s = adapter({ layerError: error });
    await expect(s.repository.createWithLayers(project, layers)).rejects.toBe(
      error,
    );
    expect(s.cleanup).toHaveBeenCalledWith('id', 'new-synthetic-id');
    expect(s.remove).toHaveBeenCalledOnce();
  });
  it('cannot guarantee rollback when compensating deletion reports failure', async () => {
    const error = Error('layers denied'),
      s = adapter({ layerError: error, cleanupError: Error('delete failed') });
    await expect(s.repository.createWithLayers(project, layers)).rejects.toBe(
      error,
    );
    expect(s.cleanup).toHaveBeenCalledOnce(); // Existing adapter ignores cleanup error.
  });
  it('does not compensate an ambiguous thrown layer transport failure', async () => {
    const error = Error('unknown commit outcome'),
      s = adapter({ layerThrows: error });
    await expect(s.repository.createWithLayers(project, layers)).rejects.toBe(
      error,
    );
    expect(s.remove).not.toHaveBeenCalled(); // No automatic retry/deletion is safe to infer here.
  });
});
