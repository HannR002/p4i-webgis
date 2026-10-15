import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Order is explicit: the historical filenames are not lexically sortable.
export const migrationFiles = Object.freeze([
  'tugas3_user_management.sql',
  'tugas4_sales_leads.sql',
  'fase5_modul1_audit_logs.sql',
  'fase5_modul2_storage.sql',
  'fase5_modul3_portal.sql',
  '006_flood_analysis.sql',
  '007_security_hardening.sql',
  '008_staging_security.sql',
]);
export function migrationPlan(root = new URL('../../', import.meta.url)) {
  return migrationFiles.map((file, index) => {
    const sql = readFileSync(
      new URL(`supabase_migrations/${file}`, root),
      'utf8',
    );
    return {
      order: index + 1,
      file,
      sha256: createHash('sha256').update(sql).digest('hex'),
    };
  });
}
export const foundationStatus = Object.freeze({
  verified: false,
  externalReplayAllowed: false,
  blockers: [
    'Verified DDL for user_role, user_profiles, spatial_projects and vector_layers',
    'Verified auth.users trigger binding and provider ownership/grants',
    'Verified materialized-view DDL/dependencies required by historical 007',
    'Legacy analysis_reports/smce_criteria_weights DDL and report publication mapping',
  ],
});
