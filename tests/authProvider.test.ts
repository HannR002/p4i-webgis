import { describe, expect, it, vi } from 'vitest';
import { resolveIdentityWith } from '../lib/server/auth/identity';
import type { AuthProvider } from '../lib/server/auth/contracts';

const TOKEN = 'provider-token-that-is-long-enough';

describe('provider-neutral identity resolution', () => {
  it('combines provider verification with the application role profile', async () => {
    const provider: AuthProvider = {
      verifyAccessToken: vi.fn(async () => ({ id: 'user-1', email: 'user@example.test' })),
    };
    const identity = await resolveIdentityWith(TOKEN, provider, async () => ({
      role: 'managerial_analyst',
      is_disabled: false,
    }));
    expect(identity).toEqual({
      user: { id: 'user-1', email: 'user@example.test' },
      role: 'managerial_analyst',
    });
  });

  it('rejects disabled, missing, or provider-invalid identities', async () => {
    const validProvider: AuthProvider = {
      verifyAccessToken: async () => ({ id: 'user-1', email: null }),
    };
    await expect(resolveIdentityWith(TOKEN, validProvider, async () => ({
      role: 'b2b_client',
      is_disabled: true,
    }))).resolves.toBeNull();
    await expect(resolveIdentityWith(TOKEN, validProvider, async () => null)).resolves.toBeNull();
    await expect(resolveIdentityWith(TOKEN, { verifyAccessToken: async () => null }, async () => ({
      role: 'super_admin',
      is_disabled: false,
    }))).resolves.toBeNull();
  });
});
