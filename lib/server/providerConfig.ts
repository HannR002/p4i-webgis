export type DatabaseProviderName = 'supabase';
export type AuthProviderName = 'supabase';

export function resolveDatabaseProvider(value?: string): DatabaseProviderName {
  const provider = value?.trim().toLowerCase() || 'supabase';
  if (provider !== 'supabase') throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
  return provider;
}

export function resolveAuthProvider(value?: string): AuthProviderName {
  const provider = value?.trim().toLowerCase() || 'supabase';
  if (provider !== 'supabase') throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
  return provider;
}
