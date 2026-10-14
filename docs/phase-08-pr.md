# Phase 08: reproducible local PostGIS security rehearsal and staging gates

Historical migrations cannot reproduce a faithful Supabase database because verified foundation
DDL is missing. This change adds an explicit ordered/hash-recorded migration plan, metadata
capture and fail-closed prerequisite checks, plus two disposable local PostgreSQL/PostGIS +
PostgREST replays using clearly labeled synthetic fixtures. It does not represent the fixture
as recovered live schema or apply any external database changes.

Migration 008 closes inherited PUBLIC grants, protects schema CREATE/import sequences, keeps
legacy reports private pending verified publication semantics, enforces current identity/project
access for download metadata, handles disabled entitlement identities, fixes modern JWT audit
attribution and hardens future grants. Historical SQL remains unchanged. Supabase remains the
active adapter; no speculative tables or methodology-validation states are added.

Validation: lint, typecheck, 230 tests/33 files and build passed. Two real local PostgREST cycles
pass 170 checks each across Guest, Clients A/B, Analyst, Admin and disabled/missing identities,
including exact row isolation, mutation denial, private reports/download metadata, JWT/role
forgery, entitlement revocation, internal RPC permissions and trusted service PostGIS output.

Review the [runbook](staging-database-runbook.md), [architecture](backend-provider-architecture.md)
and [evidence](evidence/phase-08/verification-summary.json). External replay remains blocked by
verified foundation/view/auth-trigger DDL, provider namespace/ownership reconciliation and
explicit disposable target scope. GoTrue/external staging integration is not claimed tested.
No production or external staging mutation, deployment, paid service use, merge or real client
publication occurred.

Stacked on Phase 07 (`feat/consulting-workflow-phase07`, PR #3); review this delta against that
branch. Earlier phase PRs remain open/draft.
