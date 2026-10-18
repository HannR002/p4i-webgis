# Phase 16 — PostGIS Vector Spatial Analysis & Controlled AI Preparation

Delivery date: 19 October 2026 (Asia/Jakarta); execution logs use 18 October UTC. Branch: `feat/phase16-vector-spatial-analysis`.
Parent: `feat/phase15-vector-postgis-persistence` at `f163af6c2593bc0ef58ce0c6d3be331dc4823c96`, verified equal to remote and draft PR #11 before branching. No earlier branch was rewritten or merged.

## Outcome and evidence boundaries

This phase adds real, bounded vector analysis against the existing **disposable local PostgreSQL/PostGIS/PostgREST fixture**. Outputs are computed by PostGIS, using explicitly synthetic input data; they are not fabricated demo measurements. No external Supabase connection, migration, Gemini request, GEE operation, deployment, or client publication was performed.

| Capability | Status | Boundary |
| --- | --- | --- |
| Buffer, intersection, union, difference, clip, dissolve, intersects, point-within-polygon, area, length, distance | IMPLEMENTED_AND_TESTED_LOCAL | Actual stored geometries and authenticated PostgREST RPC; deterministic synthetic correctness cases |
| Workspace input selection, server estimate, execution, transient overlay, style, visibility, attributes, GeoJSON export | IMPLEMENTED_AND_TESTED_LOCAL | Existing Map Workspace and Leaflet; no second geometry engine |
| Explicit result copy and save | IMPLEMENTED_AND_TESTED_LOCAL | Existing MapRecipe reducer and Phase 15 persistence, expected revisions, immutable history and permissions |
| Deterministic Copilot preparation | IMPLEMENTED_AND_TESTED_LOCAL | Named/selected feature buffer, area and length; same registry/executor and validated proposal DTO |
| Natural-language coverage for all overlay operations | PARTIALLY_IMPLEMENTED | Manual processing supports all listed operations; other natural-language operations need an expanded bounded grammar |
| Provider-neutral spatial-analysis repository | INTERFACE_READY | Injected request/response transport, concrete local PostgREST adapter |
| Live identity, foundation DDL, ownership and staging security | STAGING_VERIFICATION_PENDING | Local signed synthetic JWT verification is not Supabase GoTrue validation |
| External/production backend activation | BLOCKED | Production rejects local adapter; missing verified foundational DDL and deployment authorization |
| Real Gemini / GEE | BLOCKED | Existing default-disabled boundaries preserved; no live test or paid operation |

## Architecture and exact changes

`VectorSpatialAnalysisRepository` and `createVectorSpatialAnalysis` validate typed inputs and outputs. The concrete local adapter reuses Phase 15's restricted loopback transport, caller token, size cap, timeout, no redirects and error redaction. `VectorRepository`, `MapRecipe`, editable geometry contracts, Raster Engine, AHP/WLC, Flood, PDF/PNG export, controlled compute and consulting workflows remain in place.

Pipeline:

1. Same-origin request and authenticated user token.
2. Strict operation/parameter/reference validation; default and production activation fail closed.
3. PostgREST verifies the token; SQL reads current `user_profiles.role` and `is_disabled` and checks Phase 15 project assignment.
4. SQL resolves every layer and UUID feature within the requested project, checks the expected layer revision, and locks source layers for a consistent analysis snapshot.
5. Server derives feature/vertex/pair counts and spatial extent. The preview endpoint returns only the estimate. Execution repeats all checks; a prior estimate/confirmation never grants authority.
6. PostGIS computes a bounded result without source writes. SQL and existing TypeScript geometry validation both run.
7. A transient, read-only Leaflet overlay is installed only after the entire response validates. Failure/cancellation leaves the previous result and source intact.
8. Explicit copy creates a new editable layer through the existing reducer. Explicit **Simpan ke Proyek** uses Phase 15 and separately confirms the authorized target.

New files:

- `lib/gis/vectorAnalysis.ts`: request, source, result, estimate and AI preparation contracts and runtime validators.
- `lib/server/database/vector/analysis.ts`: provider-neutral service/repository and local estimate/execute adapter.
- `app/api/gis/vector-analysis/route.ts`: protected estimate/execute route.
- `database/proposals/010_vector_analysis.LOCAL_ONLY.sql`: bounded RPC and local connection time limits.
- `components/gis/VectorAnalysisPanel.tsx`, `VectorAnalysisOverlay.tsx`: processing panel and transient renderer.
- `lib/server/ai/providers/spatialAnalysisPlanner.ts`: closed Indonesian grammar using actual existing feature identities.
- `tests/vectorAnalysis.test.ts`, `vectorAnalysisRoutes.test.ts`, `vectorAnalysis.integration.test.ts`: application/API and actual database tests.
- `scripts/qa/phase-16-vector-analysis.mjs`: real browser-to-database acceptance flow.
- This report, `docs/diagrams/phase16-vector-analysis-*.puml`, and `docs/evidence/phase-16/`.

Modified integration points:

- `app/spatial/gis.css`, `MapWorkspace.tsx`, `WorkspaceMap.tsx`, `CopilotPanel.tsx`, `store/useWorkspaceStore.ts`.
- Existing `copilotContracts.ts`, `copilotRegistry.ts`, `copilotValidation.ts`, `controlledDemo.ts`, `tools/execute.ts`.
- Phase 15 `database/vector/local.ts`: shared allowlisted RPC transport and bounded safe error mapping.
- Existing `requestBudget.ts`: reuse the same request-budget primitive for analysis.
- `scripts/database/vector-local.mjs`: explicit opt-in `P4I_VECTOR_ANALYSIS=true` installs the additive local proposal before PostgREST starts.

No package or lockfile changes. Historical migrations 006–008, the Phase 15 proposal, the production migration plan and legacy Supabase repositories are unchanged.

## Request and result contracts

A request contains only `operation`, `projectId`, `source`, `target`, and `parameters`. Each non-null source contains a **database layer UUID**, positive `revision`, and 1–20 unique database feature UUIDs. Browser sketch keys are rejected as database identity. A binary operation requires a target; unary operations reject one. Both sources must belong to the named project. This version deliberately refuses cross-project combinations even when a user independently has access to both projects.

Only persisted sources are computed. Unsaved/local geometry cannot be smuggled into the request. The UI loads current authorized layer documents and shows names, UUID prefixes and revision. AI preparation carries local keys, and mapping to database IDs requires an existing editable binding whose working geometry/attributes match its stored snapshot. Unsaved edits require an explicit save/reload before analysis.

The result carries the complete request, operation parameters, engine, CRS, metric assumptions, creation time, server estimate, warnings, and a validated `SketchLayer`. Per-feature attributes include operation, units/values where relevant, source project/layer/revision, optional target layer/revision, normalized request SHA-256 and parameter JSON. Those bounded attributes survive normal Phase 15 saves. The full selected-feature manifest travels in the transient result and exported GeoJSON; its complete list is **not separately stored in a new database analysis table**. Retain the exported manifest when exact selected-subset reconstruction is required; a hash alone cannot reconstruct it.

Result export is a validated GeoJSON FeatureCollection with a `p4iAnalysis` provenance member and a fixed safe download filename. The strict existing generic import rejects unrecognized collection-level members; the in-workspace copy action uses the validated plain FeatureCollection. No HTML interpolation or executable properties are introduced.

## PostGIS operations and mathematical semantics

| Operation | Exact implementation | Meaning / restrictions |
| --- | --- | --- |
| buffer | `ST_Transform`, `ST_Buffer(..., 'quad_segs=8')`, transform back to 4326 | Selected source is unary-unioned, transformed to its local WGS84 UTM zone; 1–10000 metres, single zone/hemisphere. 32-segment circle approximation, not survey-grade |
| intersection | `ST_Intersection(ST_UnaryUnion(ST_Collect(A)), ST_UnaryUnion(ST_Collect(B)))` | Overlay of whole selected sets, planar longitude/latitude segments inside the bounded region |
| union | `ST_Union` of the two unary-unioned sets | Source data unchanged; does not retain overlapping duplicate coverage |
| difference | `ST_Difference(A, B)` | Direction matters; A minus B |
| clip | `ST_Intersection(A, B)` after polygon-only mask validation | Every target feature must be Polygon/MultiPolygon |
| dissolve | Group by a validated, existing scalar JSON attribute, then `ST_UnaryUnion(ST_Collect(...))` | Missing attribute rejects the whole operation; numeric/string/boolean group identity preserved; no dynamic SQL |
| intersects | `ST_Intersects(sourceFeature, unionedTarget)` | Return each matching source once, including boundary contact |
| within | `ST_Within(point, unionedPolygonMask)` | Point sources and polygon targets only; boundary points excluded |
| area | `ST_Area(geometry::geography, true)` | WGS84 spheroidal square metres; divide by 10000 for hectares; polygon-only |
| length | `ST_Length(geometry::geography, true)` | WGS84 spheroidal metres; divide by 1000 for kilometres; line-only |
| distance | Minimum `ST_Distance(a::geography, b::geography, true)` across ≤400 pairs | Minimum separation between the two selected sets, not a per-object matrix; all source geometries carry the same minimum value; no fabricated connector |

Storage/output CRS is **EPSG:4326**, `[longitude, latitude]`, exactly 2D. Input geometries and original revisions are never transformed in storage. No metric buffer is computed in degrees. Overlay segments retain the existing GeoJSON planar interpretation; measurements use geography, so their edge interpretation is explicitly geodesic. Tests do not claim these approximations certify land tenure, engineering precision or scientific accuracy.

All requests are restricted to input bounding extents ≤1° longitude and ≤1° latitude, latitude −70°…70°, longitude −179°…179°. This rejects antimeridian, national-scale and polar cases. Buffer additionally rejects source extents crossing UTM zones or the equator. A buffer may extend beyond the source extent by its capped distance. Projection/curve approximations remain documented limitations.

## Geometry output rules

- Supported original geometry types: Point, LineString, Polygon, MultiLineString, MultiPolygon.
- Supported multipart output is retained with all holes and parts.
- GeometryCollection and MultiPoint are normalized by `ST_Dump` into **every** supported component. No dimension filter silently drops lower-dimensional intersections, points or lines.
- Empty geometry produces an empty FeatureCollection; no synthetic replacement appears. Empty results can be inspected/exported but are not copied as a misleading populated layer.
- Invalid geometry, unsupported geometry types, oversized part/ring/vertex counts, unsafe attributes or over-budget response cause the entire operation to fail. `ST_MakeValid`, simplifying, snapping and automatic geometry repair are not used.
- SQL `ST_IsValid` is followed by Phase 15 layer validation and the existing TypeScript editing validator. The stricter editor subset may refuse a PostGIS-valid geometry (for example touching multipart configurations); the result is rejected in full, not silently changed.

## Authorization and execution containment

| Actor | Start analysis | Save result |
| --- | --- | --- |
| Guest | Denied | Denied |
| B2B client with read entitlement | Denied; existing published/read workflows remain | Denied |
| Assigned managerial analyst | Allowed for that project | Existing Phase 15 permission required |
| Active super admin | Allowed via explicit checked RPC | Existing Phase 15 permission required |
| Disabled/missing profile, revoked analyst assignment, other tenant | Denied | Denied |

Read-only client entitlement does not grant compute permission. Current trusted profile role/assignment is checked by SQL; caller metadata, role fields, approval flags, service-role keys and local IDs cannot grant access. Private schema tables/helpers retain their Phase 15 revocations/RLS. The new SECURITY DEFINER function has a fixed search path, grants only authenticated RPC execution, and denies anon/service_role/PUBLIC. No arbitrary SQL fragments or PostGIS function names are accepted.

| Resource | Ceiling |
| --- | --- |
| Each selected input | 1–20 unique feature UUIDs |
| Combined inputs | 40 features / 2048 vertices |
| Pair workload | 400, server-derived |
| Body | Next streamed 64 KiB; SQL input 8 KiB; strict parameter keys |
| Output | 100 features, existing per-feature 512-position, line/ring/part limits; whole SQL JSON response ≤64 KiB; TypeScript response ≤64 KiB |
| Input extent | 1° by 1°, bounded latitude/longitude above |
| Buffer | 1–10000 metres, UTM `quad_segs=8` |
| Database statement | 3 seconds, configured on **authenticator before connection/statement start** |
| Database lock wait | 500 ms |
| Database concurrency | Two fixed transaction advisory slots total; one per authenticated actor |
| Next containment | Existing RequestBudget primitive: 30 requests/minute and two active requests per process |
| Upstream fetch | 5 seconds, streamed maximum 256 KiB before stricter result validation |

The setting is deliberately not merely `SET statement_timeout` inside an already running function: that does not reliably start the current query deadline. A real PostgREST timeout probe verifies error `57014` on the authenticated connection. Fixed transaction locks protect database concurrency even when bypassing Next; no unbounded cross joins or table-wide spatial scans are exposed. UUID/layer indexes bound input reads. The existing GiST geometry index remains available; small selected arrays are processed in memory and **no claim is made that GEOS operations on collected arrays use that index**.

Phase 06's cost class `LOW_COST_ANALYSIS` and same-origin checks are reused. Requests beyond the local automatic ceilings are rejected, not escalated through an invented approval bypass. No paid/external class or approval ledger is activated. Process rate limits are not distributed production quotas; database concurrency/statement limits are independent defenses.

Cancellation aborts browser waiting and prevents stale application. It does not promise immediate PostgREST cancellation: the no-write computation may finish or hit its three-second database deadline. UI input changes invalidate estimates; stale workspace responses are refused. Source revisions are rechecked at execution. A computed result is a historical snapshot; later source edits do not retroactively update it.

## Workspace and AI workflow

1. Save/open synthetic vector data using Phase 15. Select the **Analisis** tab and **Analisis Vektor · PostGIS lokal**.
2. Choose an authorized editable project, operation, source/target layers, specific features, parameter and unit.
3. **Periksa estimasi PostGIS** derives stored workload. Review the expected output and source identities.
4. **Jalankan analisis PostGIS** reauthorizes and computes. An existing result is retained on failure.
5. Inspect result metadata, per-feature measurements and warnings. Toggle visibility, change color/opacity, or download GeoJSON.
6. **Salin hasil ke editor untuk disimpan** explicitly creates a new local editable layer. It preserves display style/opacity and uses one reducer transition. It does not save, overwrite a source, or publish.
7. Use tab **Layer → Penyimpanan proyek → Simpan ke Proyek** and explicit confirmation. Phase 15 controls target permissions, transactions, revision conflicts, retry receipts and evidence. Local Undo/Redo affects working geometry; it does not reverse an already committed revision.
8. **Buang hasil analisis** removes the transient overlay. Transient result/proposal state is not a second persistent map/project model.

Supported deterministic examples:

- `Buat buffer 500 meter dari titik A.`
- `Buat buffer 500 meter dari objek terpilih.`
- `Hitung luas poligon Kawasan B dalam hektare.`
- `Hitung panjang garis Jalan A dalam kilometer.`

The existing GIS Tool Registry adds `prepareVectorAnalysis`, typed and read-only. Existing server preflight checks feature references, and the existing execution trace records preparation. Ambiguous/missing names, incompatible geometry types and excessive distances request clarification. The returned proposal cannot directly call SQL or persist anything. The UI maps a matching saved binding to UUIDs, then invokes the same estimate/execute API as manual processing. Gemini's frozen tool allowlist, synthetic-only privacy policy and default-disabled status remain unchanged. A deterministic planner is not described as a connected real LLM.

## Local-only SQL, reproducibility and rollback

No ERD/table changes were needed: existing `spatial_projects → p4i_vector.layers → features` and revision evidence are reused. The new SQL only adds the analysis RPC and time limits in the disposable fixture. See the [sequence diagram](diagrams/phase16-vector-analysis-sequence.puml) and [activity diagram](diagrams/phase16-vector-analysis-activity.puml).

Exact local order:

1. Existing pinned PostGIS 16/3.5 and PostgREST 12.2.12 containers on an owned isolated Docker network.
2. `tests/database/synthetic-foundation.sql` and existing fixture-only identity/grant setup.
3. `009_vector_persistence.LOCAL_ONLY.sql` with `p4i.local_fixture=synthetic-only` in `p4i_phase15_local`.
4. Only with `P4I_VECTOR_ANALYSIS=true`, `010_vector_analysis.LOCAL_ONLY.sql` under the same database/marker guard.
5. Synthetic users/project assignments, then PostgREST connections (to pick up the authenticator timeouts).

Example, from repository root under Node 22.23.3 with dummy Supabase bindings, GEE/Gemini disabled:

```sh
mkdir -p /workspace/artifacts/phase-16
export P4I_VECTOR_TEST_STATE=/workspace/artifacts/phase-16/local-state.json
export P4I_VECTOR_ANALYSIS=true
node scripts/database/vector-local.mjs start
# State is chmod 0600, synthetic JWTs only. Do not print or commit it.
npx vitest run tests/vectorPostgis.integration.test.ts
npx vitest run tests/vectorAnalysis.integration.test.ts
# Start dev with VECTOR_STORAGE_MODE=local-postgis,
# VECTOR_STORAGE_LOCAL_ACK=synthetic-only and the state's loopback endpoint.
# Run the browser suites listed in evidence, then:
node scripts/database/vector-local.mjs stop
```

The integration suites mutate **synthetic** fixtures and expect a fresh fixture for full repeat runs. Do not repeatedly fill its eight-layer project cap with QA result layers. Start the development process after the fixture endpoint is known; a recreated fixture gets a new port and new synthetic sessions. Never substitute an external endpoint.

Rollback is removal of this owned disposable fixture using `stop`, and normal review/revert of the feature commit if needed. No destructive production rollback SQL is provided. The external migration planner still exits 2 with `verified=false` / `externalReplayAllowed=false`; 009/010 are outside its ordered production plan. Verified foundation, identity mapping, ACL ownership, role/grant review and separate external authorization are still required.

## Verification and known limitations

See `docs/evidence/phase-16/verification-summary.json` and logs for final evidence. Baseline was reproduced as **383 application tests plus 14 opt-in Phase 15 integration cases**. The final application suite executes **407 tests**, with **37 database tests explicitly skipped** in default CI. Separate actual-PostGIS runs execute **14 Phase 15 + 23 Phase 16** cases: **444 distinct tests executed overall**. Lint, typecheck, fresh `npm ci`, and Next production build completed successfully under Node 22.23.3.

Independently checkable mathematical cases include rectangle overlay areas from shoelace calculation, WGS84 ellipsoid surface-element area near the equator, equatorial distance/length constants, and projected-buffer radius plus the explicit 32-gon area approximation. The suite also covers holes, multipart, GeometryCollection/MultiPoint normalization, empty results, lower-dimensional intersections, classification/units, forbidden parameters, revoked access, read-only roles, cross-project identity attacks, stale revisions, real statement timeout and database concurrency, oversized workloads/results, unchanged sources and explicit result persistence. Phase 15's actual partial-write rollback, concurrent winner/conflict and restart-persistence tests remain intact.

Initial failures are retained and explained in `initial-issues.md`; failed exploratory attempts are not presented as final passes. Browser and API status, screenshots and exact final suite outcomes are recorded in the evidence summary. These checks are regression QA, not a full penetration test or human UAT.

Production remains **NO-GO**. Remaining requirements include verified foundational DDL and live identity/ownership mapping, real authorized GIS data and licensing, commercial GEE/LLM authorization if later needed, durable jobs/approval/persistence policies, multipart-upload containment, deployment/runtime verification, independent review of the inherited development-tooling braces advisory, and human UAT. No security waiver is granted. npm production audit reports zero affected packages; the full graph retains five High affected development entries from the inherited braces advisory. An audit pass is not a proof of application security.

Recommended next phase: review this PR against Phase 15; perform analyst UAT on the bounded local workflow; agree the exact saved analysis-manifest/provenance retention contract; verify real foundation/auth/ownership mappings before proposing external schema changes; then separately authorize staging tests. Larger AOIs, mixed local/persisted inputs, durable asynchronous workers, richer natural-language coverage and real provider access remain explicit future work. Scientific methodology validation/ranking, automatic reports, publication and billable providers are out of scope.

## Final browser evidence

All **13** applicable browser suites passed, including Phase 15 and Phase 16. The new suite verified five end-to-end flows, zero external AI/GEE requests, no page errors, and four widths (1480/768/390/320) with zero panel Axe violations or horizontal overflow. Screenshots: [desktop](evidence/phase-16/desktop-analysis.png), [mobile](evidence/phase-16/analysis-390.png). The local production server passed 12 prior API/security checks, three framework/image checks, seven Phase 15 boundaries and three new analysis boundaries.
