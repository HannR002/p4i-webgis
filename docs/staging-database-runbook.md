# P4I PostgreSQL/PostGIS staging runbook — Phase 08

Updated 15 October 2026 (Asia/Jakarta). **No external database changes were performed.**
The existing Supabase project was identified as staging in conversation, but that does not
establish permission to erase/rebuild it or that it is disposable. No migrations, users,
fixtures or grants from this phase were sent to that project.

## What can be reproduced now

The repository contains an executable **local synthetic PostgreSQL/PostGIS + PostgREST
rehearsal**. It applies every available historical migration in an explicit order, then
008, and tests actual HTTP authorization with synthetic identities. It creates two fresh
instances and destroys only its own uniquely named containers/networks, including volumes.
It uses no Supabase/GEE credentials, real client data, paid computation or external DB URL.

**A faithful fresh copy of the live schema is still blocked.** No verified foundation DDL
was found in the repository or available prior artifacts. Existing comments record three
historically observed facts (unsafe auth functions and a materialized GeoJSON view); those
facts are not a complete schema dump. The test foundation is clearly labeled and lives under
`tests/database/`, never in the production migration directory or migration plan.

```sh
npm run db:plan
# Expected exit 2 until reviewed, verified foundation DDL is available:
node scripts/database/plan.mjs --require-verified-foundation
# Requires local Docker, Node 22, and image pull access; no external DB argument exists:
npm run test:db -- --output /tmp/p4i-phase08-rehearsal
```

The local runner uses the local Unix Docker socket even if inherited Docker selectors point
elsewhere. Pinned images are `postgis/postgis:16-3.5` and `postgrest/postgrest:v12.2.12`, including
immutable digests in the runner. PostgreSQL has no published port, lives on a unique internal
network and uses disposable trust authentication. PostgREST uses a non-inheriting authenticator
and a random per-run JWT signing secret, exposes only a random **127.0.0.1** port, and joins
both that database network and Docker's bridge for loopback port forwarding. No networked
application operation is executed inside either container. Preserve the managed Docker proxy,
CA trust and registry authentication when pulling images; never disable TLS verification.

Do not reuse trust authentication, the auth fixture, or self-signed test identities for external
staging. This verifies PostgreSQL/PostgREST behavior, not Supabase GoTrue signup/session issuance.
Normal completion/failure cleans containers in `finally`. After machine interruption, inspect
`docker ps -a` for the exact `p4i-db08-<run-id>` resources before removing those specific resources;
never globally prune unrelated work.

## Inventory and missing evidence

| Object | Repository evidence | Reproduction status / dependency |
|---|---|---|
| `user_role` | App roles + 007 casts | Creation DDL absent; enum ownership/defaults not verified |
| `user_profiles` | Runtime columns and ALTERs; 007 role helper | Base columns/FK to auth/constraints/defaults/owner absent |
| `spatial_projects` | Repository contract; historical prose SQL | Verified base DDL absent; prose is not schema evidence |
| `vector_layers` | Runtime geometry/project relationship; ALTER storage size | Verified base DDL, geometry typmod/SRID, FK/index/defaults absent |
| auth signup trigger | 007 replaces function, not trigger binding | Verified trigger creation/ownership missing |
| `b2b_entitlements` | `tugas3_user_management.sql` | UUID FKs, unique client/project, grant actor/time; no expiry/status |
| `sales_leads` | `tugas4_sales_leads.sql` | Complete feature DDL; depends on projects; server-only |
| `audit_logs` | tugas3 then fase5 module1 | Two shapes; later file destructively DROP/CASCADE/recreates; four audit triggers |
| `download_history` | fase5 module3 | Complete feature DDL; references users/projects; no actual asset storage |
| boundaries + import staging | 006 | Complete feature DDL, GiST/btree indexes, parent FK, validity checks, bounded RPC, promotion |
| flood cache | 006 | Complete feature DDL; boundary/user FKs, cache key, period/expiry, score/class, indexes; no project FK |
| reports + SMCE weights | Only optional policies in 007 | Creation DDL and publication semantics unknown; service-only after 008 |
| `vw_vector_layers_geojson` | 007 comment identifies materialized view | Creation query/refresh jobs/dependencies missing; historical 007 requires existence |
| `vw_spatial_projects` | Historical narrative only | Existence/definition unknown; 008 revokes browser access if present |
| `postgis`, `pgcrypto` | 006 | Needed before foundation; historical 007 specifically calls `public.ST_AsGeoJSON` |

Other views, grants, SECURITY DEFINER RPCs, triggers, indexes, owners, default ACLs and extension
schemas may exist externally. They cannot be declared safe from repository inspection alone.
No additional live inventory was performed in Phase 08.

For an **authorized read-only** inventory session, execute:

```sh
# Use a secure libpq service definition / environment, never a password in command history.
psql -X -v ON_ERROR_STOP=1 -f scripts/database/inventory.sql > /tmp/p4i-schema-inventory.txt
psql -X -v ON_ERROR_STOP=1 -f scripts/staging-verification.sql > /tmp/p4i-existing-metadata.txt
# Separately capture schema-only DDL, not user/application records:
pg_dump --schema-only --schema=public --file=/tmp/p4i-public-schema.sql
```

`inventory.sql` records columns/types/defaults, enum labels, extensions and their schema,
constraints/FKs, indexes, owners, RLS, policies, function signatures/config/ACL, auth trigger
bindings, default privileges, view dependencies and grants. It excludes function bodies and
application/auth rows. It is wrapped in READ ONLY. Schema-only dumps can contain sensitive
embedded literals, comments or foreign-server options: inspect/redact locally before committing
or sharing. Capture the relevant auth trigger definition from inventory without dumping auth
user data. Record source project, capture time, PostgreSQL/PostGIS versions and file SHA256.
A reviewer must reconcile captured DDL with runtime contracts and existing objects before it
becomes a numbered foundation migration. Do not copy the synthetic fixture as that migration.

## Exact migration order and prerequisites

For a **fresh, explicitly authorized disposable target only**, after verified foundation DDL:

0. Provider bootstrap: managed auth schema/UID helper and roles (`anon`, `authenticated`,
   `service_role`, `postgres`); PostGIS in `public` and pgcrypto; verified foundation tables,
   enum, signup trigger, and the materialized-view dependency of historical 007.
1. `supabase_migrations/tugas3_user_management.sql`
2. `supabase_migrations/tugas4_sales_leads.sql`
3. `supabase_migrations/fase5_modul1_audit_logs.sql`
4. `supabase_migrations/fase5_modul2_storage.sql`
5. `supabase_migrations/fase5_modul3_portal.sql`
6. `supabase_migrations/006_flood_analysis.sql`
7. `supabase_migrations/007_security_hardening.sql`
8. `supabase_migrations/008_staging_security.sql`

`migration-plan.mjs` is the shared ordered manifest; `db:plan` records source hashes. Do not
sort names, skip to 006, replay historical audit DDL on an existing database, or edit an already
applied migration silently. Historical files remain byte-for-byte unchanged in this phase.
The obsolete materialized view is not invented or silently dropped to bypass missing metadata.
Existing-database upgrades require a separate reviewed delta based on captured DDL/data counts.

Before replay, verify explicit target/operation authorization, disposable lifecycle, absence of
client data, reviewed foundation evidence/hashes, compatible owners/roles/PostGIS namespace and
no concurrent application access. `scripts/database/preflight.sql` fails on missing/incompatible
prerequisites, populated foundation tables, missing signup trigger, non-materialized view or
existing audit table. This is a technical gate, **not** external authorization or proof of DDL
provenance. An extension in `extensions` instead of `public` is a real blocker for the current
historical SQL: do not relocate it blindly; prepare a reviewed namespace-compatible migration.

After authorization and all gates are satisfied, use `psql -X -v ON_ERROR_STOP=1` with one file
at a time in the order above. Wrap files 1–5 in `--single-transaction`; 006–008 contain their own
BEGIN/COMMIT. Keep the target inaccessible to application traffic until 008 and all checks pass.
Record file hash, timestamp, target and exit status. Stop at the first failure. The repository
intentionally has **no automated external migration command** while the foundation is missing.

## Additional security migration 008

- Revoke inherited `PUBLIC` and named browser grants on all known sensitive relations, including
  optional views; restore only explicit reads protected by existing RLS.
- Remove browser CREATE in `public`, protecting the remaining PostGIS search paths.
- Keep legacy reports/weights service-only: project membership does not authorize release of a
  draft. 007's project-only report policy cannot prove Phase 07 publication eligibility.
- Download history reads require the current actor, active profile and current project access.
  This table holds event metadata; it is not a report file or a publication registry.
- Disabled/missing profiles cannot read entitlement metadata. Public project data remains public.
- Restrict import sequence access; retain service-role privileges.
- Audit trigger resolves actor through `auth.uid()` (modern PostgREST JSON claims), fixed search
  path, qualified references and revoked public EXECUTE. Unattributed service writes stay NULL;
  service-key requests do not prove which end user initiated an action.
- Harden default ACLs for future postgres-created tables/sequences/functions. Future migrations
  must grant their intended roles explicitly. PostGIS existing functions remain operational.

All browser roles, including an authenticated super-admin, remain unable to perform direct table
mutations. Administrative mutations use trusted, independently authorized Next.js server APIs.
The service role bypasses RLS: it must never be exposed to the browser or treated as an end-user
role. No new methodology status, scientific ranking or approval table was added.

## Integration QA and direct PostgREST expectations

The local suite exercises real HTTP against PostgREST, not mocks or Next.js UI filtering. It uses
Guest, Client A, Client B, Analyst, Super Admin, a disabled user and a missing-profile identity.
Each client has only one restricted-project entitlement; all data are synthetic.

| Actor | Public project/layers | Restricted A | Restricted B | Direct flood cache | Direct private report |
|---|---|---|---|---|---|
| Guest | yes | no | no | denied | denied |
| Client A | yes | yes | no | empty | denied |
| Client B | yes | no | yes | empty | denied |
| Analyst | yes | yes | yes | yes | denied |
| Super Admin | yes | yes | yes | yes | denied |
| Disabled/missing profile | yes | no | no | empty | denied |

Tests assert exact row sets, not just status codes. RLS denial may be 200 with an empty array;
missing privileges are 401/403. Profile/audit/leads/materialized views/raw boundaries/import
staging/internal RPCs are denied to browser identities. Additional cases include project
POST/PATCH/DELETE, role/entitlement/vector/download mutation denial, malicious signup metadata,
JWT role forgery, expired/invalid JWT, immediate entitlement revocation, restricted download
history, trusted service RPC geometry and service mutations with audit actor attribution.
`verify-security.sql` also asserts catalog RLS/ACL/owner/search-path/sequence invariants.

For later authorized external staging QA, create only dedicated synthetic users via the real
Auth provider and obtain their actual access tokens securely. Repeat the matrix directly on
`/rest/v1/<table>` and `/rest/v1/rpc/<function>` using anon key + each user's Authorization token;
never use the service key as a client identity. Compare both status and exact seeded project IDs.
Also run protected Next.js admin/download routes and the Phase 07 publication workflow after a
real persistence adapter exists. The local self-signed tokens/auth fixture are not usable in
Supabase. No Supabase GoTrue or external five-user test is claimed complete here.

## GIS storage decisions

| Domain | Phase 08 decision |
|---|---|
| Administrative boundaries/vector layers | Reuse existing tables and PostGIS provider; no national raster arrays or duplicate project table |
| Raster metadata | Existing typed catalog/provider contracts remain authoritative; no database consumer needs a new table yet |
| GIS analysis configuration/MapRecipe | Existing validated local drafts; future owner/project ACL + versioned JSON snapshots required before persistence |
| Analysis runs/job tracking | Phase 06 process-local adapter remains development-only; future atomic state/idempotency/approval transactions required |
| Deliverables/revisions/review/publication | Phase 07 versioned repository contracts retained; explicit reviewer/publisher grants + immutable evidence required for future DB adapter |
| Legacy `analysis_reports` | Unknown relation to modern deliverables; keep private until verified, never repurpose by guessing columns |

No speculative tables were created for these future adapters. Client-deliverable review remains
separate from the postponed scientific methodology validation/ranking module.

## Rollback and recovery

1. Stop on any SQL/test error and keep diagnostic logs/source hashes. Never continue into a
   partially configured target or restore broad browser grants to make a test pass.
2. The local runner removes only its own resources and recreates from zero on rerun. Temporary
   secrets, synthetic records and DB files are discarded; summary/inventory evidence remains.
3. For an explicitly authorized disposable external target, preserve metadata-only diagnostics
   and recreate through its approved admin process, then replay the reviewed foundation/order.
   Destruction itself requires explicit scope; do not infer it from the word “staging”.
4. On an existing/shared database, do not run historical DROP/CASCADE or a destructive “down”.
   Preserve audit/client data; recover from a separately verified backup or use a reviewed
   forward correction. 008 intentionally has no insecure privilege-restoring rollback script.
5. Application rollback and database recovery are separate. Reverting Git alone does not undo
   RLS/grants. No deployment or database rollback was executed during this phase.

Remaining external blockers: verified foundational DDL/owners/relationships/view dependencies;
compatible extension namespace; explicit disposable target scope; secure DB connection and
synthetic Auth identities for full Supabase staging integration. Complete those before calling
external fresh-database reproduction or real-client authorization verified.

## Phase 15 addendum — isolated editable-vector persistence

`database/proposals/009_vector_persistence.LOCAL_ONLY.sql` is **not** in the migration plan.
It requires the disposable database `p4i_phase15_local` and an explicit synthetic-fixture marker.
Do not copy its foundation fixture or remove the local guard to migrate an external project.
Historical migrations 006/007/008 are unchanged. External application remains **BLOCKED** until
verified DDL, ownership, auth trigger/RLS/grants, project-owner mapping, legacy layer mapping,
backup/restore and explicit staging authorization are supplied and reviewed.

Reproduce with Node 22 and the local Docker Unix socket:

```sh
mkdir -p /workspace/artifacts/phase-15
node scripts/database/vector-local.mjs start
P4I_VECTOR_TEST_STATE=/workspace/artifacts/phase-15/local-state.json npm test -- tests/vectorPostgis.integration.test.ts
# Stop only this runner's uniquely named containers/network and owned anonymous volume:
node scripts/database/vector-local.mjs stop
```

The state file contains ephemeral synthetic test sessions and must stay outside Git. Do not
print/copy its tokens into reports. The runner uses pinned PostGIS/PostgREST image digests,
an internal database network with no database port, and a random loopback HTTP port. Its own
volume survives database/container restart until explicit fixture cleanup; it is not a managed
backup or production durability guarantee. Synthetic signed JWT/PostgREST verification is
separate from real Supabase Auth/GoTrue verification, which remains pending.

Rollback of the local proposal is disposal of the runner's own fixture. No destructive external
rollback or DROP/CASCADE is prescribed. Future staging needs a separately reviewed additive
migration, feature-disable plan, verified backups and retention of immutable revision evidence.
