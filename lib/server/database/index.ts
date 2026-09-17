import 'server-only';

import type { DatabaseRepositories } from './contracts';
import { resolveDatabaseProvider } from '../providerConfig';
import { createSupabaseRepositories } from './providers/supabase/repositories';

export { resolveDatabaseProvider } from '../providerConfig';

let repositories: DatabaseRepositories | undefined;

export function getDatabaseRepositories(): DatabaseRepositories {
  if (repositories) return repositories;
  switch (resolveDatabaseProvider(process.env.DATABASE_PROVIDER)) {
    case 'supabase':
      repositories = createSupabaseRepositories();
      return repositories;
  }
}
