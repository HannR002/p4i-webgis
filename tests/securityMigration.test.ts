import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase_migrations/007_security_hardening.sql', import.meta.url),
  'utf8',
);
const executableSql = migration.replace(/^\s*--.*$/gm, '');

describe('security hardening migration', () => {
  it('forces signup role to b2b_client even when metadata requests super_admin', () => {
    const handleNewUser = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user()'),
      migration.indexOf('ALTER FUNCTION public.handle_new_user()'),
    );
    const maliciousMetadata = { full_name: 'Attacker', role: 'super_admin' };

    expect(maliciousMetadata.role).toBe('super_admin');
    expect(handleNewUser).toContain("'b2b_client'::public.user_role");
    expect(handleNewUser).toContain("NEW.raw_user_meta_data->>'full_name'");
    expect(handleNewUser).not.toMatch(/raw_user_meta_data\s*->>\s*'role'/);
  });

  it('uses user_profiles as role source and returns no anonymous fallback role', () => {
    const getRole = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.get_current_user_role()'),
      migration.indexOf('ALTER FUNCTION public.get_current_user_role()'),
    );
    expect(getRole).toContain('FROM public.user_profiles AS profile');
    expect(getRole).toContain('profile.id = (SELECT auth.uid())');
    expect(getRole).not.toMatch(/user_metadata|raw_user_meta_data|app_metadata|auth\.jwt/i);
    expect(getRole).not.toContain("'b2b_client'::public.user_role");
  });

  it('treats the GeoJSON object as a materialized view and removes browser access', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.vw_vector_layers_geojson');
    expect(executableSql).not.toMatch(/ALTER\s+VIEW\s+public\.vw_vector_layers_geojson/i);
    expect(migration).toContain('public.get_project_vector_layers_geojson');
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_project_vector_layers_geojson(UUID) TO service_role',
    );
  });

  it('hardens security-definer functions and preserves service access', () => {
    expect(migration).toContain('SET search_path = pg_catalog');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated',
    );
    expect(migration).toContain('TO service_role');
  });

  it('replaces permissive policies with project-rooted entitlement checks', () => {
    expect(migration).toContain('public.can_access_project(project_id)');
    expect(migration).toContain('FROM public.b2b_entitlements AS entitlement');
    expect(migration).toContain('p4i_projects_delete_by_super_admin');
    expect(executableSql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });
});

function sourceFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => sourceFiles(join(path, entry)));
}

describe('runtime authorization coupling', () => {
  const runtimeFiles = [
    ...sourceFiles(join(process.cwd(), 'app')),
    ...sourceFiles(join(process.cwd(), 'components')),
    ...sourceFiles(join(process.cwd(), 'lib')),
    join(process.cwd(), 'proxy.ts'),
  ].filter((file) => /\.(ts|tsx)$/.test(file));
  const runtimeSource = runtimeFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

  it('does not require the materialized GeoJSON view', () => {
    expect(runtimeSource).not.toContain('vw_vector_layers_geojson');
  });

  it('never derives authorization from editable auth metadata', () => {
    expect(runtimeSource).not.toMatch(/user_metadata|raw_user_meta_data|app_metadata/);
  });
});
