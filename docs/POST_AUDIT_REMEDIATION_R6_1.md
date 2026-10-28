# R6.1 — JSON ingestion and integration evidence gates

Date: **28 October 2026, Asia/Jakarta**. Branch: `fix/post-audit-r6-integration-gate-hardening`. Base: **e633e30d3831849c71702168dadfd60d5356e707**, the independently rechecked head of open Draft [PR #16](https://github.com/HannR002/p4i-webgis/pull/16). Review target: `fix/post-audit-r5-nextjs-critical-security`; PR #16 itself still targets R3 (`fix/post-audit-r3-ci-security-gates`).

**Both confirmed R6 findings have code fixes and deterministic regression coverage in this candidate. Independent approval and renewed real-database verification are still pending. Cumulative merge: NO-GO. Production: NO-GO.** No security waiver or automatic approval is provided.

## Verified baseline and boundaries

The checkout was clean and matched the remote PR #16 SHA before creating the child branch. AGENTS.md, the published start_skill (matching runtime revision 21), installed Next.js Route Handler documentation and the R6 report were read. Node **22.23.3**, npm **10.9.9**, Next.js **16.4.3** were used.

R6 Stage B evidence recorded **37 actual PostGIS passes (14 + 23)**, six Phase 15 real-database browser flows, five Phase 16 flows and four real-result R1 observations on the base SHA. Its four disposable fixtures were cleaned. R6.1 read-only Docker inventories before/after show no containers or volumes, the same three built-in networks, and no R6 resource names. No Docker start/stop/create/delete/restart occurred here. R6 authorization was not reused.

The existing workflow hard locks remain byte-identical; no hosted execution or Actions configuration was enabled. Dummy loopback Supabase bindings, DEMO AI, disabled Gemini/GEE and disabled vector storage were used for local verification. Production-boundary checks used a separate local compiled server with DEMO disabled. No external database or paid provider was contacted.

## R6-01: bounded JSON ingestion

Previously, both `readJsonBody` and `readGisBody` awaited stream reads without an ingestion deadline or abort listener. Oversize cleanup also awaited `reader.cancel()`, which can fail or never settle. Copilot acquires a process concurrency slot before body ingestion, making stalled reads an availability concern.

`lib/server/http.ts` now implements the shared policy, and `lib/server/gis/http.ts` delegates to it. Fixing only the generic helper would have left the actual GIS/Copilot path vulnerable.

| Behavior | Before | After |
| --- | --- | --- |
| Payload ceiling | 65,536 bytes | Same 65,536 bytes, accumulated across chunks; Content-Length is not trusted |
| Stalled or trickling body | Could await indefinitely at application level | **10,000 ms total ingestion deadline**, not reset by progress |
| Request abort | No explicit handling | Already-aborted and in-flight aborts reject safely |
| Timer starvation by immediately ready reads | No deadline check | Monotonic elapsed-time check between reads, plus timer interruption |
| Cancellation hook never settles or rejects | Await could stall rejection | Cancellation is best effort, rejection observed, never awaited |
| Reader cleanup | Not consistently released | Reader lock, timer and abort listener released in finally |
| Pending read loses timeout race | Unbounded | Losing read/consume promise is observed; cleanup cannot leak an unhandled rejection |
| Partial UTF-8 across chunks | Streaming decoding | Preserved |
| GIS size/invalid messages | Existing Indonesian errors | Preserved through the GIS wrapper |

One race covers the entire consumption operation, avoiding one accumulating interruption handler per chunk. Generic unexpected stream errors and abort reasons are replaced with fixed safe messages. Arbitrary upstream messages, stack traces and credentials are not returned.

HTTP policy preserves existing **400** for malformed/empty JSON and oversize JSON; cancellation/read failure also returns **400**, while the new ingestion timeout returns **408**. R2 multipart handling retains its own existing **413** size response and 10-second policy; upload code is unchanged. Successful JSON behavior and subsequent route/schema/authorization checks remain intact.

The deadline limits asynchronous body ingestion; it is not a CPU-process isolation mechanism or a replacement for reverse-proxy/server transport limits. Native stream cleanup cannot forcibly terminate arbitrary synchronous user-defined code. Production still requires transport limits and distributed abuse controls; the existing request budgets remain process-local.

## R6-02: complete, consistent database evidence

Previously `summarizeTests(..., { databaseOnly: true })` could accept a report containing just one successful database assertion. The runner did not verify the reviewed 14/23 totals or prove that both suites completed before reporting the overall run.

A small explicit manifest, `scripts/ci/database-coverage.mjs`, declares:

| Suite identity | Required assertions |
| --- | ---: |
| tests/vectorPostgis.integration.test.ts | 14 |
| tests/vectorAnalysis.integration.test.ts | 23 |
| Combined | 37 |

Update this manifest only with reviewed integration-test changes; never delete assertions to meet a count. The two database test files were not changed by this remediation.

The shared summarizer now checks canonical expected identities (relative or absolute paths), suite presence, duplicate suites, duplicate database assertion names, nonempty assertion metadata, allowed statuses, exact per-suite counts and consistency of reported pass/fail/skip/total counters. Unexpected suites, malformed reports, contradictory file status and failure metadata cannot produce PASS. Actual integration mode rejects every skipped or failed database case. Default application CI explicitly reports the complete opt-in set as skipped and refuses accidentally executed database cases.

The runner validates each fresh fixture's report against that specific suite. A separate full-run check requires both distinct validated suite summaries, zero failed/skipped assertions, successful process exits and `VERIFIED_REMOVED` cleanup before emitting the combined **37 PASS** result. A successful exit alone is insufficient. The non-executing `--plan` includes the reviewed identities/counts.

Failure categories stay separate:

- `INFRASTRUCTURE_UNAVAILABLE`: startup/readiness failure, or unavailable/timed-out test process.
- `TESTS_FAILED`: actual failed assertions or execution failure reported by a valid test report.
- `INCONCLUSIVE`: missing, malformed, contradictory or incomplete assertion evidence.
- `CLEANUP_FAILED`: cleanup failure; it overrides otherwise successful assertions.
- Combined `INCOMPLETE`: any absent/unsuccessful/unverified suite; never full PASS.

`test-report.mjs` uses the same strict validation for ordinary application evidence and exits nonzero on incomplete/malformed reports. Fixture creation, local socket selection, remote-Docker exclusion, ownership validation, SQL and cleanup operations themselves were not changed. Existing R6 runner ownership/anonymous-volume verification limitations remain a separate follow-up; this patch does not claim to solve them.

## Deterministic regression coverage

**39 new application assertions** exercise both HTTP and GIS paths: valid/empty/invalid JSON, streaming and split UTF-8, exact/below/above byte boundaries, cumulative and multibyte oversize with a false Content-Length, stalled reads with progress, abort before/during reads, timeout, cancellation hooks that reject/throw/never settle, sanitized stream failures, reader/timer/listener cleanup and timer-starvation checking. Fake timers and controlled ReadableStreams are used; there are no arbitrary sleeps or timing-threshold assertions. A real Copilot route test fills all four concurrency slots, obtains 429 for the fifth, advances the deadline, verifies four 408 responses and reacquires all four slots.

**52 CI helper tests total** preserve earlier audit/ownership/lifecycle/lock checks and add rejection of insufficient/excess counts, missing/duplicate/wrong suites, duplicate assertions, traversal identities, skipped/failed/unknown outcomes, counter contradictions, malformed metadata, incomplete aggregate runs and unverified cleanup. CLI tests use temporary synthetic report files and never invoke Docker. Failed assertions with real Vitest failed-suite metadata remain `TESTS_FAILED`, distinct from infrastructure or incomplete evidence.

Existing parameterized application tests can have repeated display names; duplicate-assertion rejection is deliberately enforced for database evidence, where reviewed assertion names are unique. No working application tests were renamed or removed.

## Actual verification results

The final source was verified on Node 22.23.3. Installation preserved the committed lockfile and package versions.

| Command / scope | PASS | FAIL | SKIPPED | Notes |
| --- | ---: | ---: | ---: | --- |
| npm ci | success | 0 | 0 | Existing lockfile retained |
| npm run lint | success | 0 | 0 | No errors |
| npm run typecheck | success | 0 | 0 | No errors |
| npm test | **556** | **0** | **37** | Includes 39 new JSON tests; PostGIS opt-in skipped |
| npm run test | **556** | **0** | **37** | Explicit requested alias also executed |
| npm run test:ci | **52** | **0** | **0** | Node helper tests, no Docker |
| npm run build | success | 0 | 0 | Next 16.4.3 |
| Full npm audit | 0 affected packages | 0 | 0 | No suppression/waiver |
| Production npm audit | 0 affected packages | 0 | 0 | No dependency change |
| Existing dependency gate | success | 0 | 0 | Still fail-closed |
| Actual application JSON → report CLI | success | 0 | 0 | 556 pass / 37 skips preserved |
| PostGIS --plan | success | 0 | 0 | **No SQL execution** |
| Local browser regression suites | **11** | **0** | **0** | DEMO/synthetic services or local doubles, no database |
| Compiled local API/framework checks | **22** | **0** | **0** | 12 readiness/rate + 3 framework/image + 7 vector-boundary |
| Fresh real PostGIS / database browser | **NOT RUN** | — | — | New authorization required; do not reuse R6 passes |
| Hosted CI | **LOCKED** | — | — | No hosted PASS claimed |

Browser suites: Phase 01, 02, 03, 04, 05, 06, 07, 13, 14, R1 and R2. They cover portal/workspace, raster, configurations, Copilot, compute, consulting drafts, vector editing, lifecycle and upload behavior. R1 uses synthetic mocked analysis/storage results (nine flows); R2 uses a loopback auth/REST double with no database (six flows). Those are explicitly not real PostGIS tests. Existing axe checks ran where supported, including zero reported violations in R1/R2 desktop/mobile scopes. These automated checks are not human UAT or exhaustive accessibility certification.

No executed check failed. Earlier green test iterations preceded the last added test cases; the table records the final counts. There are no claimed new real-database successes or security waivers.

[Verification summary](evidence/remediation-r6-1/verification-summary.json) contains exact commands/outcomes, base PR metadata, hashes of preserved files, browser commands and historical-vs-current distinctions. [JSON regression outcomes](evidence/remediation-r6-1/json-body-results.json), [CI helper log](evidence/remediation-r6-1/ci-helpers.log), [application log](evidence/remediation-r6-1/application-tests.log), [full audit](evidence/remediation-r6-1/audit-full.json), [production audit](evidence/remediation-r6-1/audit-production.json), build/lint/typecheck/install and CLI logs accompany it. Full screenshots and local harness logs remain outside source at `/workspace/artifacts/remediation-r6-1/`.

## Exact implementation changes

- `lib/server/http.ts`: shared bounded/cancellable reader, constants, safe error codes and timeout response.
- `lib/server/gis/http.ts`: reuse the shared reader while preserving GIS validation messages.
- `tests/jsonBody.test.ts`: deterministic streaming and actual Copilot budget-release regression tests.
- `scripts/ci/database-coverage.mjs`: reviewed suite identity/count manifest.
- `scripts/ci/report.mjs`: strict evidence validation and complete-run aggregation.
- `scripts/ci/postgis.mjs`: apply per-suite policy, distinguish failures, require complete aggregate evidence.
- `scripts/ci/test-report.mjs`: accurate incomplete-evidence failure reporting through the shared gate.
- `scripts/ci/gates.check.mjs`: positive/negative completeness, lifecycle and CLI tests.
- This report and `docs/evidence/remediation-r6-1/`: focused evidence for independent review.

Package manifests/lockfile, workflow activation locks, Phase 15/16 SQL proposals, fixture helper, GIS engines, authorization, upload policy, exports and existing product functionality were preserved.

## Residual risks and renewed verification requirement

The fixes are locally tested, not independently approved. Real PostGIS must be rerun under new explicit authorization because `postgis.mjs` now consumes/aggregates reports differently, and the shared GIS body reader is used by real vector storage/analysis APIs. Required follow-up: the 14+23 actual cases, Phase 15/16 real-database browser acceptance, exact assertion evidence and independently verified owned-resource cleanup. R6 passes cover the base SHA only.

Do not run the existing fixture helper unattended on persistent infrastructure. Its known ownership/volume-cleanup/evidence-retention limitations require the previously reviewed external guard or separately approved runner remediation. No such Docker work is authorized or performed by this PR.

Independent review, CI activation/bootstrap and non-skipped required checks remain pending. Production additionally requires verified external schema/Auth/RLS, atomic legacy project persistence, durable job/approval/deliverable state, distributed quotas, data/licensing and commercial provider approvals, hosting verification, backups/rollback and human UAT. Local audit cleanliness and test passes do not resolve these gates.

Review/merge this child only through the approved stack strategy; do not change PR #16 or earlier PRs automatically. **No merge, deployment, migration, external database access, paid AI/GEE operation, Actions activation or automatic approval occurred.**
