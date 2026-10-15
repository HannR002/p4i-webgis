import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestIdentity } from '../lib/server/auth/contracts';
import type { DownloadRecord } from '../lib/server/database/contracts';
const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  listForUser: vi.fn(),
  findAccess: vi.fn(),
  has: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../lib/server/auth', () => {
  class AuthorizationError extends Error {
    constructor(
      message: string,
      readonly status: 401 | 403,
    ) {
      super(message);
    }
  }
  return { requireRole: mocks.requireRole, AuthorizationError };
});
vi.mock('../lib/server/database', () => ({
  getDatabaseRepositories: () => ({
    downloads: { listForUser: mocks.listForUser },
    projects: { findAccess: mocks.findAccess },
    entitlements: { has: mocks.has },
  }),
}));
import { GET } from '../app/api/downloads/route';
import { AuthorizationError } from '../lib/server/auth';
const identity: RequestIdentity = {
  user: { id: 'client-a', email: null },
  role: 'b2b_client',
};
const rows: DownloadRecord[] = ['public', 'restricted', 'missing'].map(
  (id) => ({
    id: `history-${id}`,
    project_id: id,
    file_type: 'pdf_report',
    downloaded_at: '2026-10-15T00:00:00Z',
    spatial_projects: { title: `Project ${id}` },
  }),
);
const request = () => new Request('http://localhost/api/downloads');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue(identity);
  mocks.listForUser.mockResolvedValue(rows);
  mocks.findAccess.mockImplementation(async (id: string) =>
    id === 'missing'
      ? null
      : { id, accessTier: id === 'public' ? 'public' : 'restricted' },
  );
  mocks.has.mockResolvedValue(false);
});
describe('download history authorization with service-role repositories', () => {
  it('removes revoked restricted project metadata and deleted projects', async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual([rows[0]]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.listForUser).toHaveBeenCalledWith('client-a');
    expect(mocks.has).toHaveBeenCalledWith('client-a', 'restricted');
  });
  it('rechecks entitlement on each request after revocation', async () => {
    mocks.has.mockResolvedValue(true);
    expect(await (await GET(request())).json()).toEqual(rows.slice(0, 2));
    mocks.has.mockResolvedValue(false);
    expect(await (await GET(request())).json()).toEqual([rows[0]]);
  });
  it('keeps staff access to their own history without borrowing client entitlement', async () => {
    mocks.requireRole.mockResolvedValue({
      ...identity,
      role: 'managerial_analyst',
    });
    expect(await (await GET(request())).json()).toEqual(rows.slice(0, 2));
    expect(mocks.has).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated access before the history repository', async () => {
    mocks.requireRole.mockRejectedValue(
      new AuthorizationError('Authentication required', 401),
    );
    expect((await GET(request())).status).toBe(401);
    expect(mocks.listForUser).not.toHaveBeenCalled();
  });
  it('fails closed and redacts an entitlement-provider failure', async () => {
    mocks.findAccess.mockRejectedValue(
      new Error('private-provider-error-marker'),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await GET(request());
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain(
        'private-provider-error-marker',
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'private-provider-error-marker',
      );
    } finally {
      log.mockRestore();
    }
  });
});
