import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  foundationStatus,
  migrationFiles,
  migrationPlan,
} from '../scripts/database/migration-plan.mjs';

describe('database replay safety and provenance', () => {
  it('blocks external fresh replay while verified foundation is missing', () => {
    expect(foundationStatus.verified).toBe(false);
    const result = spawnSync(
      process.execPath,
      ['scripts/database/plan.mjs', '--require-verified-foundation'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report.foundation.externalReplayAllowed).toBe(false);
    expect(report.foundation.blockers).toHaveLength(4);
  });

  it('records each historical file once, in dependency order, without the synthetic fixture', () => {
    const plan = migrationPlan();
    expect(new Set(plan.map((item) => item.file)).size).toBe(plan.length);
    const position = (name: string) =>
      plan.findIndex((item) => item.file === name);
    expect(position('tugas3_user_management.sql')).toBeLessThan(
      position('fase5_modul1_audit_logs.sql'),
    );
    expect(position('fase5_modul3_portal.sql')).toBeLessThan(
      position('007_security_hardening.sql'),
    );
    expect(position('006_flood_analysis.sql')).toBeLessThan(
      position('007_security_hardening.sql'),
    );
    expect(position('007_security_hardening.sql')).toBeLessThan(
      position('008_staging_security.sql'),
    );
    expect(plan.some((item) => /fixture|foundation/.test(item.file))).toBe(
      false,
    );
    expect(
      JSON.parse(
        execFileSync(process.execPath, ['scripts/database/plan.mjs'], {
          encoding: 'utf8',
        }),
      ).migrations,
    ).toEqual(plan);
  });

  it('detects source changes in the migration evidence hashes and refuses missing SQL', () => {
    const directory = mkdtempSync(join(tmpdir(), 'p4i-migration-plan-'));
    try {
      mkdirSync(join(directory, 'supabase_migrations'));
      for (const file of migrationFiles)
        writeFileSync(
          join(directory, 'supabase_migrations', file),
          readFileSync(
            new URL(`../supabase_migrations/${file}`, import.meta.url),
          ),
        );
      const root = pathToFileURL(directory + '/');
      const before = migrationPlan(root);
      writeFileSync(
        join(directory, 'supabase_migrations', migrationFiles[0]),
        '-- modified',
      );
      expect(migrationPlan(root)[0].sha256).not.toEqual(before[0].sha256);
      rmSync(join(directory, 'supabase_migrations', migrationFiles[0]));
      expect(() => migrationPlan(root)).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects external targets before Docker or database operations', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/database/rehearse.mjs',
        '--database-url',
        'postgres://external.invalid/live',
      ],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
    expect(result.stdout).not.toContain('creating isolated');
  });
});
