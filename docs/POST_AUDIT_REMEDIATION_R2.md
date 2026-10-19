# Post-audit remediation R2 — secure legacy geospatial upload

Date: 2026-10-19 (Asia/Jakarta). Scope: cumulative audit F02 and the legacy upload portion of F05, `POST /api/projects`. This is a focused remediation, not a new import engine or a penetration-test certification.

## Baseline and branch

PR #12 was open/draft/unmerged at Phase 16 commit `086f13f8d95b8cdd6afd0ac85ac5d7fb5a2bd8a1`. PR #13 was open/draft/unmerged at R1 commit `940e41069bc90289c50b0d6d7688e95ec9f03766`, based on Phase 16. Remote refs and local ancestry matched. The clean checkout was used to create `fix/post-audit-r2-secure-geospatial-upload` directly from that R1 head. Target: `fix/phase16-map-analysis-state-integrity`; stack: Phase 16 → R1 → R2. No history rewrite, merge, visibility change or modification to earlier PRs.

Read `AGENTS.md`, applicable installed Next.js route/client documentation, the configured published `start_skill`, cloud setup/runtime instructions and the cumulative audit under `/workspace/artifacts/cumulative-audit-2026-10-19/`. Runtime observations still identified the older running instance configuration; no cloud configuration was changed and publication adoption is not certified by this run.

## Confirmed cause versus potential abuse

The old authenticated path called `readFormDataBody()` → unrestricted `request.formData()` before checking `File.size`. The nominal 25 MiB file ceiling therefore did not protect request buffering, non-file fields or multipart allocation. Content-Length was not a resource boundary. MIME and filename checks did not impose expansion or execution budgets.

For ZIP, the installed `shpjs` 6.2.0 pipeline enumerates `but-unzip` entries and schedules `entry.read()` for matching SHP/DBF/JSON/PRJ/CPG names, awaiting them together. Node's underlying `inflateRaw` call has no application `maxOutputLength` ceiling. SHP/DBF parsing and `proj4` transformation occur afterward. Application feature-count checks came after decompression and collection materialization; no cumulative expansion, member-count, time, ratio, coordinate or attribute budget was enforced there. Missing PRJ could leave coordinates interpreted without a verified CRS. There was no cancellable worker/process around the parser.

A small pre-change Vitest probe using the actual route and a mock repository confirmed that native multipart parsing occurred and a three-dimensional Point `[999,999,123]` reached persistence with HTTP 201. No real database was contacted. Baseline source and probe log establish the execution path; destructive memory exhaustion, ZIP bombs, filesystem extraction and real database corruption were **not** attempted or claimed. Arbitrary path extraction was not demonstrated: the old parser worked in memory. Expansion/CPU pressure was a code-supported potential abuse path, not an observed production incident.

## Resource containment and archive decision

Server-side ZIP Shapefile upload is **disabled unconditionally** in this legacy route, with no environment switch to reactivate it. The route no longer imports/invokes `shpjs`. `.zip`, raw SHP and other unsupported extensions fail closed; ZIP/gzip signatures masquerading as JSON are also refused. A MIME declaration never grants acceptance. Unsupported archives within the body ceiling receive 415; oversized requests receive 413. ZIP entries, decompression bytes, extraction paths and archive parser work accepted by this endpoint are all **zero**.

No replacement archive dependency was introduced. Restoring server ZIP requires a separately reviewed isolated process/worker with hard termination and memory/CPU limits, actual-output byte accounting, archive member/path/method/encryption/duplicate checks, expansion ratio and count limits, verified PRJ transformations and geometry validation before persistence. A `Promise.race` wrapper around synchronous work is not an acceptable substitute. Existing operator-oriented offline import tooling and dependencies are unchanged; this report does not extend the route's guarantees to those tools.

GeoJSON now uses a dedicated, narrow multipart parser after a fixed-size streamed ingestion step. There is no call to `Request.formData()`, no bounded Request copy passed to a hidden parser, no concatenation of an unbounded chunk list and no filesystem extraction. The unused unsafe helper was removed from `lib/server/http.ts`.

| Resource | Enforced limit/policy |
| --- | --- |
| Complete request body | 320 KiB of actual streamed bytes, checked before copying each chunk |
| File bytes | 1–256 KiB independently of request ceiling |
| Ingestion duration | 10 seconds after authorization, including stalled reads; client abort also cancels |
| Native request buffer | One fixed 320 KiB buffer per admitted reader; field/file parts are bounded slices |
| Multipart | At most 5 unique parts: title, category, description, access_tier, exactly one file |
| Part headers/boundary | 1 KiB per header block; boundary 1–70 characters; strict CRLF grammar |
| Header/profile restrictions | No transfer encoding, nested multipart, unknown/duplicate headers or fields, path filenames, preamble/epilogue, filename extensions to the grammar |
| Scalar fields | title/category/description/access tier: 800/400/8000/16 bytes; then 200/100/2000/16 character ceilings |
| Features | 1–500 in one FeatureCollection |
| Coordinates | 5,000 positions overall; 512 per feature; exactly two finite ordinates per position |
| Existing topology bounds | Lines ≤128 positions; ring ≤128 distinct vertices plus closure; ≤8 rings/parts; existing conservative polygon validation |
| Attributes | ≤32 scalar properties per feature, ≤64-character keys, ≤512-character strings, ≤4096 serialized UTF-8 bytes per feature |
| Process admission | 20 attempts/minute and 2 active uploads, including authentication and persistence |

Content-Length is only an early rejection/consistency hint. Missing or false declarations cannot bypass streamed accounting; oversized streams are cancelled. Timeout cancellation resolves pending web-stream reads without waiting for a stalled source cleanup promise. Per-chunk listeners are not accumulated on a shared pending timeout promise. Short/inconsistent bodies, malformed delimiters, duplicate files and invalid UTF-8 are refused before repository mutation.

The 320 KiB allocation is **not** a claim that total process RSS is 320 KiB. JSON decoding/materialization, framework buffers and validated objects consume additional memory bounded by the small file ceiling. Node JSON parsing remains synchronous; fixed bytes, fixed-depth geometry traversal, feature/vertex budgets and existing bounded topology checks constrain that work. No CPU-worker timeout/termination claim is made. Edge/proxy socket, header, connection and buffering limits still need deployment verification; application cancellation cannot retroactively prevent an upstream proxy from buffering bytes. The Next proxy matcher covers admin/portal pages, not this API's upload body.

## CRS and supported geometry

Accepted input is a strict RFC 7946 subset: one UTF-8 FeatureCollection with WGS84 **longitude, latitude** positions in `[-180,180] × [-90,90]`. Absence of a legacy `crs` member follows RFC 7946 semantics; it does not establish the provenance of arbitrarily mislabeled source data. All explicit legacy CRS declarations—including EPSG:4326 strings with ambiguous axis conventions—are rejected. Shapefile/PRJ interpretation and reprojection are unavailable in this endpoint.

Point, MultiPoint, LineString, MultiLineString, Polygon and MultiPolygon are supported within the documented budgets. Null geometry, GeometryCollection, 3D coordinates, nonfinite numbers, incorrect array dimensions, unclosed/degenerate/self-intersecting rings, invalid holes, crossing/touching polygon components and unsupported antimeridian shapes are rejected. Shared `sketchGeometry` validates topology only after the upload-specific budget and ring-closure checks. Original coordinate arrays are persisted; no closure repair, simplification, reprojection or fabricated coordinates are substituted.

Unknown collection/feature/geometry members (including bbox/foreign members) are refused by this intentionally narrow profile. Properties may contain strings, finite numbers, booleans and null; nested arrays/objects and prototype-related keys are rejected. Missing/null properties normalize to `{}`. Display layer names use existing name fields/title and are capped at 200 characters; raw geometry is not altered. These restrictions reduce legacy import breadth and must be reviewed with operators before release. The upload form displays the supported format/size and ZIP refusal; client checks remain convenience controls, with all enforcement on the server.

## Authorization and response safety

The existing `requireRole(PROJECT_CREATE_ROLES)` remains before body reading: managerial analysts and super admins retain project creation access; B2B clients do not gain it. The trusted `user_profiles.role` lookup, identity provider and repository abstraction are unchanged. Only `public` and `restricted` access tiers are accepted, with `public` as the existing default.

A fixed-key existing `RequestBudget` instance gates outstanding work before authentication; no attacker-controlled IP/user map or unbounded queue is added. 429 includes `Retry-After: 60`. These are process-local resource controls, **not distributed quotas or a durable abuse ledger**. Restarts reset counters, replicas each have separate budgets, and a malicious actor can occupy the shared capacity. Authentication/database requests can still stall their slots; safe provider/network timeouts and upstream quotas are an operational follow-up, not a basis to retry ambiguous writes.

Responses use 400 for invalid structure/geometry, 401/403 for identity/role denial, 408 for ingestion timeout/cancellation, 413 for upload budgets, 415 for unsupported media/archives and 429 for admission limits. Unexpected provider errors remain generic 500 responses with a fixed log code. All POST responses are `Cache-Control: private, no-store`. Uploaded content, parser traces, filenames, credentials and raw provider errors are not logged by the new path. No server credential is added to the browser.

## Persistence assessment and unresolved atomicity

All ingestion, metadata, CRS, geometry and properties validation completes before `projects.createWithLayers()`. Rejected uploads make **zero persistence calls**, verified with spies and the loopback HTTP test double. Cancellation is checked again before mutation. The route makes one repository call with no new retry or recovery deletion.

The historical Supabase adapter remains unchanged: it inserts `spatial_projects`, then inserts the vector rows, and attempts deletion of the newly returned project ID on a reported layer error. This is not one transaction. Characterization tests show that a rejected project insert performs no layer write/deletion; a reported layer error triggers the existing compensation; a compensation error is ignored; and a thrown transport error can bypass compensation. Ambiguous commit outcomes or failed cleanup can leave partial state. A disconnect after persistence starts also cannot promise rollback. We do **not** claim every 500/aborted upload leaves no project.

No destructive cleanup, transaction fiction, new retry or speculative RPC/schema was introduced. A verified atomic database operation and failure-injection rehearsal remain prerequisites for production-grade creation. No real records were read/written and no migrations or Phase 15/16 SQL proposals changed.

## Tests and evidence

Node.js **22.23.3**, npm **10.9.9**. Existing dependencies reused; lockfile unchanged. Default checks used the published safe dummy bindings with Gemini/GEE disabled and vector storage disabled. Local artifacts: `/workspace/artifacts/remediation-r2/`.

Required commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

| Verification | Result |
| --- | --- |
| Lint, typecheck, build | PASS |
| Application tests | 517 passed; 37 database cases skipped; 50 passing test files and 2 skipped files |
| New upload/persistence tests | 95 passed (91 upload cases, 4 adapter failure-characterization cases) |
| Existing browser suites | Phase 01–07, Phase 13 and Phase 14 PASS after the compute rerun described below |
| R1 browser regression | Nine synthetic analysis lifecycle flows PASS |
| New upload browser/API | PASS using actual Next and a loopback Auth/REST double, no database |
| Upload accessibility | No axe WCAG A/AA violations reported at 1480 and 390 px |

The unchanged Phase 06 compute browser timed out at the cancellation button on two runs. A diagnostic copy with a brief synchronization delay passed, and the **unchanged** original suite then passed against a fresh owned dev server without competing verification work. No compute product code or existing test assertions were changed. This is recorded as a timing/environment-sensitive test limitation; its exact race was not conclusively isolated and a first-run pass is not claimed. Logs retain both failures and the successful clean-server run.

Evidence: `baseline-probe.log`, `security-tests-final.log`, `verification-delivery.json`, `*-verified.log`, `browser-results.json` (initial sweep), `phase-06-clean-server/browser-summary.json`, `remediation-r1-map-lifecycle/results.json`, and `upload-browser-final/results.json`. Upload screenshots are `upload-1480.png` and `upload-390.png` in that last directory. These machine-local artifacts are outside source; the tests and runner are committed for reproduction.

To reproduce with Node 22 and the safe local bindings from `start_skill`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
# Run with no other Next dev instance using this checkout's .next/dev lock.
# Set P4I_PLAYWRIGHT_MODULE, P4I_CHROMIUM, P4I_AXE_SCRIPT to installed tools.
node scripts/qa/remediation-r2-upload.mjs
```

The upload runner starts and stops its own ephemeral-port loopback HTTP double and Next dev child; only that child receives the double's URL and dummy credentials. It records synthetic writes in memory and creates no tables or durable project data. Ordinary application/browser checks retain the inert loopback Supabase binding. All owned test processes are stopped after validation.

New adversarial tests (`tests/projectUpload.test.ts`) cover actual stream ceilings without/with false Content-Length, exact buffer boundaries, per-file/non-file ceilings, malformed/repeated multipart, invalid media/UTF-8, source failures, deadline and cancellation (including never-settling cleanup), malicious properties, malformed/overflow coordinates, ring/topology checks, feature/vertex ceilings, supported geometries and no coordinate rewriting. Archive-shaped small fixtures cover malformed headers, suspicious names, nested/encrypted/unsupported-method/claimed-expansion cases; they establish unconditional refusal, **not successful parsing or ZIP validation**. A `shpjs` mock throws if the route ever imports it. No dangerous expansion payload is decompressed.

Concurrency/rate tests and authorization tests assert denial before writes. `tests/projectPersistenceFailure.test.ts` records the existing nontransactional failure modes using a fake client. Neither test file accesses a database. `scripts/qa/remediation-r2-upload.mjs` runs the actual Next app against an owned loopback Auth/REST double with synthetic roles and write recording; it does not bypass application authorization or introduce a runtime testing hook. This verifies HTTP/UI composition, not real Supabase authentication/RLS or database transactions.

The 37 opt-in PostGIS cases and database-backed Phase 15/16 browser suites are not run: the task did not explicitly authorize starting a disposable database fixture under `start_skill`. R1's synthetic analysis browser tests still exercise Phase 16 overlay lifecycle without a database.

## Changed files and review requirements

- `app/api/projects/route.ts`: admission, authorization, bounded parser invocation, sanitized responses; DELETE behavior unchanged.
- `lib/server/projectUpload.ts`: request accounting, strict multipart profile, GeoJSON validation and archive refusal.
- `lib/uploadPolicy.ts`: shared hard limits for UI/server.
- `lib/server/requestBudget.ts`: bounded process-local upload admission using existing utility.
- `lib/server/http.ts`: removal of unused unbounded multipart helper.
- `app/admin/upload/page.tsx`: accurate file/size restrictions, ZIP notice and labeled controls.
- `tests/projectUpload.test.ts`, `tests/projectPersistenceFailure.test.ts`: adversarial and persistence-failure coverage.
- `scripts/qa/remediation-r2-upload.mjs`: reproducible isolated browser/API checks using a synthetic HTTP double.
- `docs/POST_AUDIT_REMEDIATION_R2.md`: this report.

Review the narrow multipart grammar, compatibility restrictions, byte/complexity budgets, stream cancellation and unchanged transaction risks before integration. Keep ZIP disabled until a separate reviewed containment design exists. The inherited cumulative dependency, database foundation, authorization-policy consistency, durability, CI review, real-data/provider authorization and human UAT gates are not waived by this patch.

**Merge readiness: NO-GO until reviewed. Production readiness: NO-GO.** No deployment, paid service, Gemini/GEE operation, external database connection, migration, merge, visibility change or security waiver was performed.
