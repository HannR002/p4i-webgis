import { describe, expect, it } from 'vitest';
import { resolveAuthProvider, resolveDatabaseProvider } from '../lib/server/providerConfig';

describe('provider selection', () => {
  it('uses Supabase as the explicit current default', () => {
    expect(resolveDatabaseProvider()).toBe('supabase');
    expect(resolveAuthProvider()).toBe('supabase');
    expect(resolveDatabaseProvider(' SUPABASE ')).toBe('supabase');
  });

  it('fails closed for an adapter that has not been implemented', () => {
    expect(() => resolveDatabaseProvider('neon')).toThrow('Unsupported DATABASE_PROVIDER');
    expect(() => resolveAuthProvider('nhost')).toThrow('Unsupported AUTH_PROVIDER');
  });
});
