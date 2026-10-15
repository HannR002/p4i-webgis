# Phase 10 — Integration audit and release-candidate assessment

Date: **15 October 2026 (Asia/Jakarta)**. Repository: `HannR002/p4i-webgis`.
Audited Phase 09: `11b5f9ade32f1b39c8cad5f3616f4db3d7999728`.
Audited main: `dfe412c81c1254707cbd16083791dc009cf90643`.
Integration branch: `integration/p4i-webgis-phase01-09`.

## 1. Decision

**NO-GO for merging the current candidate into main. NO-GO for production deployment.**
Git integration is straightforward and the local functional baseline is reproducible, but the
fresh dependency audit reports unresolved high/critical advisories. A passing build and historical
test counts do not resolve those findings. This is a technical recommendation for review, not
an assertion that every advisory is exploitable in this application or a claim of penetration testing.

Phase 10 fixes one independently reproduced application authorization defect and repairs stale
browser-test assumptions. It adds no product feature, new engine, database migration or provider.
The cumulative draft PR is an audit/remediation review vehicle, **not merge approval**. Existing
PRs #1–#5 are left intact. No merge, deployment, external DB operation, paid computation, visibility
change or destructive Git operation was performed.

Conditions to reconsider merge: remediate or explicitly disposition the dependency advisories
with evidence and accountable security review; review the download authorization fix; rerun affected
checks on the final lockfile/head; then obtain normal code-review approval. Production additionally
requires all external/data/persistence/UAT gates in section 10. Merging a development baseline would
not authorize deployment, migrations, real analysis, billing or client publication.

## 2. Repository visibility and secret/data review

GitHub API reports **public**, `private=false`, default branch `main`. The main branch endpoint
reports `protected=false`; no tracked GitHub Actions workflow was found. Visibility/protection
were inspected, not changed. Owners should configure their intended review/required-check policies.
Public visibility is a product/owner decision, not permission to publish confidential client data.

The checkout is non-shallow. All advertised remote heads were fetched; all reachable refs were
scanned: **20 commits, 584 unique blobs**, including the pre-Phase01 baseline. Checks covered
private-key headers, GitHub/API/Supabase key formats, service-account JSON, JWTs, database credential
URLs, sensitive filenames and literal credential assignments. No real secret candidate was found.
The only literal-token assignment candidate is a deliberately invalid token in `tests/authProvider.test.ts`.
The only sensitive-name candidates were three revisions of `.env.example`, all empty credential
slots/public configuration defaults. No tracked real `.env`, key file, credential JSON, database
dump, SHP/ZIP upload or confidential client dataset was identified.

The two tracked client PDFs explicitly say DEMO/EXPERIMENTAL, simulated publication and no official
client publication; text extraction confirmed synthetic client/project labels. SQL files are
migrations/assertions or explicitly synthetic test seeds, not production dumps. Binary inventory
contains PNG/ICO assets and browser captures; report PDFs are text-based PDF blobs. Screenshot and
report evidence is developmental. Static branding/team assets still require owner confirmation of
publication/licensing rights; automated scanning cannot establish their legal provenance.

Scope limits: these are pattern/manual repository checks, not an exhaustive high-entropy secret
scanner, OCR review of every image, or a scan of forks, deleted/unreachable remote history, releases,
GitHub attachments, external storage or former repositories. No credential files/environment values
were printed or used to test live services. A public Supabase hostname/asset identifier is not an
administrative credential. No credential rotation is currently indicated by this evidence. If a
real key is subsequently found: stop release, revoke/rotate it at the issuing provider, audit access,
replace the secure binding and have the owner coordinate cache/fork cleanup; deleting a file or
rewriting history alone is not remediation. No history rewrite was attempted.

Evidence: [history scan](evidence/phase-10/history-scan.json),
[literal assignment scan](evidence/phase-10/assignment-scan.json),
[GitHub snapshot](evidence/phase-10/github-inventory.json).

## 3. Git ancestry, stacked PRs and cumulative inventory

Phase09 is still **18 commits ahead, zero behind main**. Every requested phase head is an ancestor
of Phase09, with zero missing commits. The remote Phase01 branch name is absent; the local Phase01
head `35f9848` is included in the fetched Phase02/Phase09 histories. An absent branch label does not
mean its changes are missing. No stable duplicate patch IDs or unresolved index conflicts were found.

| Ref | Audited head | Included in Phase09 | Remote status |
|---|---|---|---|
| main | dfe412c | yes | present |
| feat/phase-01-stabilization | 35f9848 | yes | local label; commit reachable remotely |
| feat/phase-02-geoportal-ux | 4d40a8e | yes | present |
| feat/phase-03-raster-engine | 8f7243c | yes | present |
| feat/gis-analysis-config-phase04 | 22cf04c | yes | present |
| feat/ai-gis-copilot-phase05 | 989ff92 | yes | present |
| feat/ai-gis-analysis-phase06 | 0481801 | yes | present |
| feat/consulting-workflow-phase07 | 20cbf54 | yes | present |
| feat/postgis-staging-phase08 | 5e9d651 | yes | present |
| feat/production-readiness-phase09 | 11b5f9a | yes | present |

PR #1 targets Phase04 from Phase05; #2 targets Phase05 from Phase06; #3 targets Phase06 from Phase07;
#4 targets Phase07 from Phase08; #5 targets Phase08 from Phase09. All five were open/draft/unmerged,
with GitHub reporting clean mergeability at inspection. These PRs do **not** individually target main.
GitHub mergeability is not code/security approval.

Main → Phase09 changes **340 files: 316 added, 24 modified**, with 36,042 insertions and 631 deletions
(including documentation/evidence). Exact paths and statuses:
[cumulative inventory](evidence/phase-10/cumulative-files.txt).
Migrations 006, 007 and all five earlier SQL files are byte-for-byte unchanged from main. The sole
added migration is Phase08 `008_staging_security.sql`; Phase10 adds no SQL. Hashes and every ancestry
check are recorded in [ancestry evidence](evidence/phase-10/ancestry.json).

The integration branch was created directly at Phase09; no cherry-pick, synthetic merge, duplicated
commit, rebase or history rewrite was needed. Phase10 commits contain only the security correction,
regression/QA maintenance and audit evidence/documentation. See the separate
[Phase10 delta inventory](evidence/phase-10/changed-files.txt).

## 4. Architecture reconciliation

| Area | Verified relationship and limitation |
|---|---|
| MapRecipe / workspace | `lib/gis/contracts.ts` defines MapRecipe; MapDocument is an alias. `useWorkspaceStore` drives MapWorkspace; viewer/analysis/AI routes reuse it. |
| Renderer / legacy viewer | WorkspaceMap wraps the existing SpatialMap; `components/Map.tsx` re-exports it. Legacy `/spatial` remains. Two route/state surfaces are intentional, not independent GIS engines. |
| Raster / Pixel | One RasterProvider contract, shared raster/grid/NoData validators and native fixture processing; real adapter unavailable. No nationwide array is loaded. |
| AHP/WLC / configuration | `analysisContracts` reuses AHP result weights; `analysisPreferences` delegates to the existing AHP calculator/shared WLC formula. Configuration apply and legacy store share those utilities. CR remains advisory for experimental drafts. |
| Flood | Existing four-criterion experimental model/legacy graph retained; route/service/initializer reject external execution pending governed commercial integration. No automatic method ranking. |
| AI | Current GISExecutionPlan/registry/provider uses the same recipe reducer and dataset/config validators. Older GisPlan/GisPlanner contracts remain for compatibility/tests; the workspace uses the controlled Copilot path. `/api/gis/actions` only reduces validated map actions, not arbitrary compute. |
| Legacy recommendation | `/api/ai-recommendation` is explicitly deterministic DEMO and refuses production; its example score is not a real GIS measurement or active LLM provider. |
| Controlled compute | ComputeService validates ownership, access, request/estimate/recipe hash, expiry, approval and retry. Actual adapter supports bounded local operations only. Jobs/usage are process-local, not durable billing. |
| Consulting | ConsultingProject extends existing ProjectSummary; AnalysisRun/Result reference ComputeJob/result. Independent review/publication grants and immutable revisions are development adapters, not duplicate production project tables. |
| DB/auth abstraction | Domain repository interfaces do not import Supabase SDK types; only the active adapter uses Supabase. Identity derives role from stored profile after token verification. Neon/Nhost remain future adapter work. |
| Exports | Existing workspace PNG/PDF/recipe exports remain; consulting PDF uses a bounded schematic and released revision DTO, not another map renderer. |
| Errors | Server generic errors and external raster/planner exceptions are redacted. Input errors remain user-readable. Process/body limits are partial containment, not a complete abuse-control system. |

No incompatible duplicate domain model/engine was found in the inspected execution paths. Legacy
compatibility contracts, local stores and framework/domain validation helpers remain technical debt;
this audit did not remove them or assert whole-program formal equivalence.

## 5. Security regression findings

| ID | Finding / evidence | Disposition |
|---|---|---|
| SEC-01 | GET `/api/downloads` returned service-role history rows and joined project titles after a B2B entitlement was revoked. Direct SQL RLS did not protect this server bypass. | **Fixed** using existing `resolveProjectLayerAccess` per row, missing-project denial and `private, no-store`. New regression: 4 failures/1 pass before, all 5 pass after. No report bytes or other-client rows were demonstrated exposed. |
| SEC-02 | Lockfile dependency advisories: 22 affected packages overall; 12 with dev dependencies omitted. | **Open merge blocker** pending remediation or explicit evidence-based disposition; details below. |
| SEC-03 | Authenticated project multipart upload reads formData before the 25 MiB file check and passes ZIP to shpjs without the offline importer's expansion/PRJ controls. | **Open production blocker**: bound request/expanded bytes before parsing and require explicit CRS/topology review. Admin/analyst gate reduces exposure; it does not remove DoS/data-quality risk. No exploit or upload executed. |
| SEC-04 | Only boundary/Copilot routes have process-wide rate/concurrency budgets; other public/legacy endpoints and multipart/body deadlines need containment. | **Open production blocker**: edge/identity/project quotas and abuse tests. Current 429 checks pass; limits reset per process and are not durable tenant quotas. |
| SEC-05 | Development consulting personas, jobs and approvals are in-memory. | Production gates verified; **not a live authorization/persistence implementation**. Requires durable identity/grants, worker/ledger and restart tests. |
| SEC-06 | Live auth trigger/view/foundation and external RLS behavior remain unverified. | Local synthetic rehearsal passes; no claim of live Supabase validation. |

Other reviewed controls:

- Signup function in 007 assigns `b2b_client` irrespective of user-supplied role metadata. Actual
  GoTrue trigger binding remains a live-schema prerequisite. Trusted role is `user_profiles.role`;
  disabled/missing profiles deny identity. No claim of a tested live signup workflow.
- Project lists/vector access enforce current role/entitlement server-side; guests receive public
  access. Downloads POST checks restricted entitlement; GET now does too. Service role bypass
  remains an explicit architectural trust boundary, not a substitute for permission checks.
- 007/008 fix SECURITY DEFINER ownership/search_path/EXECUTE, PUBLIC inherited grants, materialized
  view privileges, schema CREATE and legacy private report access. Direct PostgREST tests cover
  Guest, Clients A/B, Analyst, Admin, disabled and missing identities.
- AI schema/tool/argument/result validation and preflight authorize known datasets and configuration
  snapshots. No arbitrary SQL/code/URL execution is exposed by the tool registry. Unknown real AI
  selection fails closed. The typed real transport is not wired to paid HTTP calls.
- Compute approval binds owner/snapshot/estimate/expiry; retry requires fresh approval. Cross-origin
  mutation is rejected. Human-origin checks are not scientific qualifications or standalone identity.
- AI cannot approve/publish deliverables; admin has no implicit review grant. Review is tied to an
  independent reviewer and revision hash. Client DTOs exclude drafts/internal notes; download names
  are bounded and responses have no-store/nosniff/sandbox headers.
- Strict NoData/numeric/grid/categorical/permission validation remains tested. Source masks and real
  provider scales/periods still need authorized real-data evidence.

## 6. Dependency security and version consistency

Node **22.23.3**, npm **10.9.9**. `npm ci` installed 591 packages successfully from the existing
lockfile; package/lock root declarations match. No package or lockfile was changed in Phase10.
Installed Next/eslint-config-next both 16.3.5, React/react-dom both 19.2.8, proj4 2.21.0; duplicate
incompatible direct versions were not observed. `@types/node` still targets 20 and there is no
repository engines/.node-version pin: add explicit supported-runtime policy in the remediation work.

`npm audit` exited 1: **3 critical, 15 high, 3 moderate, 1 low (22 packages)**.
`npm audit --omit=dev` exited 1: **1 critical, 8 high, 2 moderate, 1 low (12 packages)**.
Counts are affected packages, including transitive/derived severity, not distinct reachable exploits.

| Component | Relevant reported advisory / reachability assessment | Next action |
|---|---|---|
| Next 16.3.5 | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), critical next/og RCE; no app next/og/ImageResponse call found. Additional cache, metadata, dev MCP and image-optimization advisories affect this version; app does use next/image. Exploitability not proven. | Registry confirms 16.3.8 exists and supports Node22; review upgrade to at least a version fixing all listed ranges, align eslint-config-next and rerun full QA. |
| Vitest 3.2.4 / mocker | [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp), critical exposed UI server; our execution is `vitest run`, not UI. Additional mocker traversal advisory. | Registry confirms 4.1.11/Node22 support; review migration rather than assume a major upgrade is drop-in. |
| Tinypool 1.1.1 | [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), prototype-pollution gadget to RCE; preconditions not demonstrated. | Resolve through compatible test-worker dependency upgrade; rerun tests. |
| sharp 0.35.4 | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), vulnerable image dependency. | Registry confirms 0.35.5/Node22 support; verify parent resolution and image tests. |
| Earth Engine dependency tree | node-forge/google-auth-library/googleapis/gtoken/uuid findings; real GEE execution is guarded, but packages remain installed. | Review maintained compatible SDK/dependencies and reachable code. Audit suggests an old breaking SDK downgrade; **do not apply that suggestion blindly**. |
| Remaining build/runtime transitive packages | brace-expansion, braces, micromatch, js-yaml, source-map-js, dompurify and derived findings. | Review every entry and patched range in saved JSON; do not collapse them into “dev-only” or claim zero risk. |

See [full audit](evidence/phase-10/npm-audit.json),
[production audit](evidence/phase-10/npm-audit-production.json),
[dependency summary](evidence/phase-10/dependency-summary.json).
No `npm audit fix --force`, unreviewed override, disabled assertion or TLS bypass was used.

## 7. Consolidated execution evidence

All commands ran locally; child process configuration overrides Supabase URL to a non-serving
loopback address with dummy keys, empties GEE configuration and uses explicit DEMO flags. No
external DB endpoint or paid provider is exercised. HTTP proxy and TLS trust remained enabled
for dependency/GitHub access. Browser servers bind loopback. Browser basemap/font requests may
contact public services; those are not authenticated GIS/DB analyses.

| Check | Result |
|---|---|
| Clean `npm ci` | PASS; dependency files unchanged |
| Baseline `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | PASS; **257 tests / 36 files**, confirms Phase09 historical application count |
| Download regression before correction | **4 FAIL, 1 PASS**; establishes the security defect |
| Download regression after correction | **5 PASS** |
| Final lint/typecheck/test/build after API fix | PASS; **262 tests / 37 files** |
| Browser Phase02 smoke/accessibility, Phase03 raster, Phase04 config, Phase05 Copilot, Phase06 compute, Phase07 deliverables | PASS; original scripts, synthetic providers/personas |
| Phase01 smoke/regression | **Both PASS** after QA compatibility repairs; all nine browser suites pass |
| Automated accessibility | **39 audits, zero violations** in tested states; not an accessibility certification |
| Local `next start` API security/rate checks | **12 PASS**, including refusal of DEMO in production mode even with flags set |
| Local PostgreSQL16.9/PostGIS3.5.2/PostgREST12.2.12 rehearsal | **2 fresh cycles × 170 = 340 PASS**; pinned images, disposable synthetic data |
| Dependency security | **FAIL/open advisories**, distinct from functional suite success |
| Human UAT / real providers / production hosting | **NOT RUN** |

Browser suites exercise five widths (320/390/768/1024/1480), actual PNG/PDF/JSON/Markdown downloads,
layer/order/style/drafts/Undo, native pixel and NoData, configuration scenarios, stale-request
handling, approval/cancel/retry, client redaction and isolated simulated releases. The capture-only
`capture-webmap-previews.mjs` is not a smoke/assertion suite and was not used to regenerate product assets.

Original Phase01 smoke asserted catalog counts before async hydration and left Chromium open on
failure (harness timeout 180s); explicit readiness waits/final cleanup correct this. Both older
scripts assumed pre-Phase05 manual Copilot and `/api/gis/actions`; tests now explicitly choose
preview and intercept the actual `/api/gis/copilot`. An arbitrary map click can correctly hit NoData;
a known native fixture coordinate is used for the numeric-unit assertion. The provider-failure test
now asserts its explicit injected API error. Finally, the old CR-disabled assertion contradicted the
approved Phase04 advisory-CR behavior: tests now require the inconsistency warning, editable draft,
and saved provisional evidence. These are QA corrections, not UI/engine changes or hidden failures.

Evidence and machine-readable outcome: [verification summary](evidence/phase-10/verification-summary.json).
The legacy suite also probes real-data list/boundary routes against the inert local provider: those
return 500 as expected without a database and do not establish data availability.
A production build on localhost is not a deployment/hosting test. No full penetration, load, soak,
fuzzing, national raster benchmark, actual commercial accuracy or human acceptance is claimed.

## 8. Database and provider readiness

Foundation metadata remains explicitly unverified in `scripts/database/migration-plan.mjs`.
Migration replay order remains: verified foundation → tugas3_user_management → tugas4_sales_leads →
fase5_modul1_audit_logs → fase5_modul2_storage → fase5_modul3_portal → 006 → 007 → 008.
Synthetic-foundation.sql is only a test fixture and must not replace missing live DDL. Known missing
items include core enum/tables, auth trigger binding/ownership, materialized-view dependencies and
legacy report/weight DDL/publication semantics. Exact gates/rollback:
[staging runbook](staging-database-runbook.md).

Two local replays confirm the migration/security behavior on that fixture, including current
entitlement revocation, private report denial, malicious/expired JWTs, service-only mutation and
PostGIS geometry output. They do not verify external GoTrue/RLS/schema parity. The existing Supabase
project's staging classification does not authorize destructive recreation. No external changes.

AI real-provider selection remains disabled; the structured transport contract is ready for an
approved implementation. GEE route/service/initializer remain fail-closed; commercial registration,
billing scope, IAM/assets, real-data CRS/masks/scales/periods, governed adapter and durable budget
are prerequisites. Readiness flags/credentials alone do not satisfy these requirements.

## 9. Precise merge recommendation

1. Keep this cumulative PR **draft / do not merge** while SEC-02 is unresolved. Preserve PRs #1–#5.
2. Apply reviewed dependency/security remediation as new commits on the integration branch (or a
   reviewed child branch), without rewriting the existing phase chain. Fix or disposition every
   advisory with applicability evidence; the current audit is not a waiver.
3. Repeat clean installation, lint/typecheck/tests/build, all affected browser/API checks and audit;
   rerun DB rehearsal if SQL/auth/DB behavior changes. Attach results to the final commit.
4. Fetch main and Phase09 again. If main advances, review changes and use a normal reviewed merge
   into integration, resolving conflicts explicitly; never force-push or assume today's 0-behind holds.
5. Obtain reviewer approval for the cumulative main delta, SEC-01 fix, schema gates and limitations.
6. **Only after approval**, prefer one ordinary **merge commit** from integration into main. This
   preserves the ancestry of all 18 phase commits and the audit fixes. Avoid squash/rebase merging
   this stack if preserving the existing PR relationship is desired. Nothing is merged by this audit.
7. After the approved cumulative merge, inspect PRs #1–#5 and mark/close superseded work as appropriate
   with links to the cumulative merge; do not merge them a second time or delete their branches now.

Alternative if reviewers insist on separate merges: first review/merge Phase01–04 into main through
a new cumulative prerequisite PR, then retarget and review #1, #2, #3, #4, #5 to main in that order,
using ancestry-preserving merges and rerunning checks on each target. Simply merging the currently
stacked PRs into their existing feature-branch bases does not integrate everything into main.

## 10. Release blockers, UAT and exact next actions

| Gate | Owner / next action | Status |
|---|---|---|
| Merge M1 | Engineering/security: remediate or explicitly disposition all dependency advisories, including runtime Next and toolchain risks; validate a compatible lockfile. | OPEN / NO-GO |
| Merge M2 | Reviewer: approve cumulative delta plus download metadata fix; verify final tested head. | PENDING |
| Production R1 | DBA: obtain verified foundation/auth/view DDL and authorize disposable external rehearsal; run direct five-role PostgREST/GoTrue tests. | BLOCKED |
| Production R2 | GIS/data owner: supply licensed P4I boundaries/soil metadata/control points; bounded import/topology/provenance/CRS review. | PENDING |
| Production R3 | Business/cloud: commercial GEE permissions/terms/budget and approved LLM/privacy scope; implement/test governed adapters. | PENDING |
| Production R4 | Backend: durable jobs/queue/usage/revisions/reviews/publications, identity-bound grants, transactions/recovery/backup. | PENDING |
| Production R5 | Security: bounded authenticated multipart/ZIP handling, quotas/deadlines, session/cookie/CSRF and edge/logging/retention review. | OPEN |
| Production R6 | Operations: confirm Hostinger product/Node/worker constraints; load/cache/tile/database connection/restore/rollback tests. | NOT RUN |
| Production R7 | Yayasan P4I: execute the 20-case role-based UAT matrix with real approved identities/data, record defects and human acceptance. | NOT RUN |
| Production R8 | Release authority: explicitly approve deployment and client publication separately after gates close. | NOT AUTHORIZED |

UAT must include public visitor, Clients A/B, Analyst and Admin; map/pixel/configuration/AI workflows;
approval limits, failures/retries, reviewer independence, unpublished/other-client denial, revoked
entitlements and authorized report download. Use [the existing UAT matrix](P4I_UAT_ACCEPTANCE_MATRIX.md),
record actual human outcomes and never translate automated PASS into stakeholder sign-off.

Scientific methodology validation/ranking remains OUT OF SCOPE. Professional human deliverable
review remains required and does not imply scientific validation. Continue with integration/security
remediation before new product features; do not treat a development-baseline merge as production release.

Cloud startup instructions were saved as a draft with explicit AI DEMO selection, loopback binding
and isolated QA overrides. Existing network/credential bindings/install script were preserved.
Saving did not publish/restart the environment; review/save/publish in environment settings is
required to apply the instructions to later sessions. This does not block the completed local audit.
