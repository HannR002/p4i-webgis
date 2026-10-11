# P4I WebGIS staging database runbook

## A. Purpose and safety boundary

This runbook prepares a disposable Supabase staging environment for P4I WebGIS. Staging must never
contain production data, client data, production credentials, production service-account keys, or
production Earth Engine assets. Use synthetic projects, synthetic user identities, and a dedicated
staging GEE asset where flood analysis is exercised.

This repository does **not yet contain a complete foundational database migration**. Do not attempt a
fresh replay until the missing live-schema history listed below has been captured from verified DDL
and reviewed. The order below is exact for the files that exist, but it has an explicit prerequisite
that is currently absent.

## B. Recommended staging project

- Project name: **P4I Spatial Staging**
- Preferred region: **Singapore / Southeast Asia**, when offered by Supabase.
- Lifecycle: disposable; recreation is preferred over manual repair after an uncertain migration.
- Accounts: dedicated staging users only. Never reuse production passwords or access tokens.

## C. Required extensions

Enable and verify these before the foundational schema is installed:

| Extension | Reason |
|---|---|
| `postgis` | `geometry`, spatial indexes, validation, intersection, simplification, and GeoJSON conversion |
| `pgcrypto` | UUID generation expected by repository migrations; migration 006 also declares it |

Migration 006 contains `CREATE EXTENSION IF NOT EXISTS` for both, but it runs too late to serve as a
foundation for the currently missing base schema. Extension installation should eventually live in a
numbered foundational migration.

## D. Migration order

### Blocking prerequisite not present in the repository

Create and review a foundational migration from verified live DDL. Do not infer it from TypeScript or
documentation. It must precede every file below and must define at least the required base objects,
constraints, ownership, and initial auth trigger identified in the reproducibility audit.

Once that verified prerequisite exists, execute the current files one at a time in this order:

1. `supabase_migrations/tugas3_user_management.sql`
   - Requires `public.user_profiles` and `public.spatial_projects`.
   - Adds `user_profiles.is_disabled`.
   - Creates `b2b_entitlements` and an initial legacy `audit_logs` shape.
2. `supabase_migrations/tugas4_sales_leads.sql`
   - Requires `public.spatial_projects`.
   - Creates `sales_leads`.
3. `supabase_migrations/fase5_modul1_audit_logs.sql`
   - Requires `user_profiles`, `spatial_projects`, `vector_layers`, and `b2b_entitlements`.
   - Drops/recreates the legacy `audit_logs` table and attaches four audit triggers.
   - Safe only on a fresh disposable database or after an explicit audit-data backup.
4. `supabase_migrations/fase5_modul2_storage.sql`
   - Requires `public.vector_layers`.
   - Adds `file_size_bytes`; it does not configure object storage.
5. `supabase_migrations/fase5_modul3_portal.sql`
   - Requires `user_profiles` and `spatial_projects`.
   - Adds onboarding state and creates `download_history` plus its initial RLS policy.
6. `supabase_migrations/006_flood_analysis.sql`
   - Requires `public.user_profiles`, PostGIS, and UUID support.
   - Creates administrative boundaries, import staging, flood cache, functions, indexes, policies,
     and grants.
7. `supabase_migrations/007_security_hardening.sql`
   - Must be last.
   - Requires the base enum/tables, the materialized view in the current live-derived path, the
     final audit table, and functions created by migration 006.
   - Replaces unsafe auth functions, rebuilds project-rooted RLS, removes browser access to the
     materialized view, and installs the service-only current-row GeoJSON function.

Do not sort these files lexicographically. The historical filenames are not a reliable migration
sequence.

## E. Pre-migration checks

1. Confirm the target project name and region and verify it is not production.
2. Confirm the database contains no production/client records.
3. Record PostgreSQL and Supabase platform versions.
4. Verify `postgis` and `pgcrypto` are installed.
5. Confirm the verified foundational migration exists; stop if it does not.
6. Compare foundational object ownership and signatures with the captured live metadata.
7. Confirm `.env.local` remains ignored. Populate staging values from `.env.example` without copying
   production secrets.
8. Use a dedicated GEE staging project/service account and synthetic soil asset if flood tests are
   required.
9. Review every migration for the intended target. In particular, acknowledge that
   `fase5_modul1_audit_logs.sql` drops and recreates `audit_logs`.
10. Apply one file at a time and record success/failure and timestamp. Stop on the first error.

## F. Post-migration read-only verification

Run [`scripts/staging-verification.sql`](../scripts/staging-verification.sql) using a read-only
inspection session. It checks extensions, enum labels, tables/materialized views, RLS flags,
functions, fixed search paths, policies, grants, triggers, and foreign keys without changing
database state. Representative queries from that verification set are:

```sql
SELECT extension.extname, extension.extversion
FROM pg_catalog.pg_extension AS extension
WHERE extension.extname IN ('postgis', 'pgcrypto')
ORDER BY extension.extname;

SELECT relation.relname, relation.relkind, relation.relrowsecurity, relation.relacl
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname IN (
      'user_profiles',
      'spatial_projects',
      'vector_layers',
      'b2b_entitlements',
      'flood_analysis_results',
      'vw_vector_layers_geojson'
  )
ORDER BY relation.relname;

SELECT namespace.nspname, relation.relname, trigger.tgname,
       pg_catalog.pg_get_triggerdef(trigger.oid, TRUE) AS trigger_definition
FROM pg_catalog.pg_trigger AS trigger
JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE trigger.tgisinternal = FALSE
  AND (namespace.nspname = 'public'
       OR (namespace.nspname = 'auth' AND relation.relname = 'users'))
ORDER BY namespace.nspname, relation.relname, trigger.tgname;
```

Minimum expected outcomes:

- `public.user_role` exists with the reviewed role labels.
- All required base and feature tables exist with RLS enabled where specified.
- `handle_new_user`, `get_current_user_role`, `can_access_project`, `audit_trigger_fn`, boundary RPCs,
  and `get_project_vector_layers_geojson` have the expected security-definer/search-path state.
- `anon` and `authenticated` have no materialized-view grant.
- Browser roles have no direct mutation grants on protected tables.
- Audit and auth triggers are attached to the intended tables.

The verification script reports metadata only. It does not prove row-level behavior; complete the
role matrix below as separate manual tests.

## G. RBAC test matrix

Create synthetic projects:

- `PUBLIC-01` with `access_tier=public`
- `RESTRICTED-A` with `access_tier=restricted`
- `RESTRICTED-B` with `access_tier=restricted`

Create synthetic users for each role. Give Client A an entitlement only to `RESTRICTED-A`; give
Client B an entitlement only to `RESTRICTED-B`.

| Actor | PUBLIC-01 | RESTRICTED-A | RESTRICTED-B | Administrative mutations |
|---|---:|---:|---:|---|
| Guest | Yes | No | No | None |
| B2B Client A | Yes | Yes, only while entitled | No | None |
| B2B Client B | Yes | No | Yes, only while entitled | None |
| Managerial Analyst | Yes | Yes | Yes | Project create/update only where exposed by trusted server APIs; no user-role, entitlement, or destructive super-admin action |
| Super Admin | Yes | Yes | Yes | Full administrative access through protected server APIs |

Exercise the matrix twice: through Next.js APIs and directly through PostgREST with the matching
staging identity. A UI result alone is not an authorization test.

## H. Child-resource tests

For each project, create uniquely identifiable synthetic child records and verify:

- `vector_layers`: follows `project_id`; public/entitled/admin reads only. B2B users cannot mutate.
- `analysis_reports`: must follow `project_id`. If the live table lacks that column, migration 007
  leaves it fail-closed; stop and design a verified related-project mapping before granting access.
- `smce_criteria_weights`: same rule and fail-closed behavior as `analysis_reports`.
- `flood_analysis_results`: migration 006 has no `project_id`. Direct table reads are analyst and
  super-admin only; a B2B user receives only the scoped response produced by the authenticated flood
  API, not arbitrary table rows.
- `administrative_boundaries`: public boundary data is obtained through `GET /api/boundaries`.
  Browser roles must not read the base/staging tables or invoke the database RPC directly after 007.

For every project-linked child, repeat the cross-project negative case: Client A must not read a
child of `RESTRICTED-B`, and Client B must not read a child of `RESTRICTED-A`.

## I. Malicious signup regression

Using a disposable staging identity, attempt signup with user-editable metadata containing:

```json
{ "full_name": "Security Test", "role": "super_admin" }
```

Expected result after the auth trigger completes:

- `user_profiles.full_name` may be `Security Test`.
- `user_profiles.role` must be `b2b_client`.
- `get_current_user_role()` must return the stored profile role, never the submitted/JWT metadata.

Delete/recreate the disposable staging project rather than using production identities for this test.

## J. Direct PostgREST tests

Use staging-only anon and user tokens. Do not place tokens in shell history, screenshots, fixtures, or
the repository.

Verify that direct PostgREST requests cannot bypass Next.js authorization:

- Guest receives public projects/children only.
- Each B2B client receives only public and specifically entitled restricted projects/children.
- Browser roles cannot mutate protected tables.
- Browser roles cannot read `audit_logs` or `user_profiles` directly.
- Browser roles cannot execute administrative boundary import, boundary viewport, or internal
  GeoJSON RPCs directly.
- Analyst tokens cannot administer roles/entitlements or perform super-admin deletion.

Treat an unexpected `200` with protected rows as a release blocker. A `200` with an empty RLS-filtered
array may be the expected denial shape; verify both status and response rows.

## K. Materialized-view verification

`public.vw_vector_layers_geojson` is a materialized view, not a normal view. Runtime code must not
reference it; the application uses `get_project_vector_layers_geojson(UUID)` through the trusted
server repository. After migration 007:

- `anon` and `authenticated` cannot select it.
- Browser roles cannot refresh it.
- Inventory any external refresh job or dependency before considering removal.
- Do not rely on underlying `vector_layers` RLS to protect already materialized rows.

## L. Rollback and recovery

Staging is disposable. If a foundational or security migration fails or its state becomes uncertain:

1. Stop applying subsequent files and preserve the error plus migration log.
2. Do not improvise `DROP`, privilege changes, or data repairs in a shared environment.
3. Export only non-sensitive diagnostic metadata if needed.
4. Delete and recreate **P4I Spatial Staging** through the approved Supabase administrative process.
5. Correct the migration in Git, review it, and replay from the verified foundation.
6. Re-run the read-only verification script and complete the entire RBAC matrix.

Application rollback is a deployment of a previously verified commit; it is separate from database
recovery. Never apply this disposable-staging recovery procedure to production.

## Reproducibility audit: missing migration history

A fresh Supabase database **cannot currently be built from this repository alone**. The repository
does not contain verified creation DDL for:

- `public.user_role` enum;
- base `public.user_profiles` table and its relationship to `auth.users`;
- base `public.spatial_projects` table;
- base `public.vector_layers` PostGIS table and foreign key to projects;
- the auth-users trigger that invokes `public.handle_new_user()`;
- live `analysis_reports` and `smce_criteria_weights` tables, if staging must include them;
- `public.vw_vector_layers_geojson` materialized view, although migration 007 currently expects the
  live-derived object so it can revoke access;
- any still-required `vw_spatial_projects` object mentioned by historical documentation.

Do not reconstruct these objects from UI types or old narrative documents. Capture verified live DDL
without data or secrets, review ownership/RLS/defaults/constraints/indexes/triggers, and add a numbered
foundational migration before claiming fresh-database reproducibility.
