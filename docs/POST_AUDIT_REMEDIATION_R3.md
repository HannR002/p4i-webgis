# Post-audit remediation R3 — CI, dependency gates and regression reliability

Date: **2026-10-20 (Asia/Jakarta)**. Scope: review infrastructure and regression reliability only. **Merge: NO-GO pending review and dependency disposition. Production: NO-GO. Hosted CI: ACTIVATION_PENDING, not VERIFIED_PASS.**

## Verified baseline and existing gap

Initial working tree was clean. This branch, `fix/post-audit-r3-ci-security-gates`, starts at R2 `cb3e20f79b245cb6ceedde4a61a13fcac2b16033`. Verified GitHub PRs #12–#14 remain Draft, open and unmerged:

| PR | Head | Base |
| --- | --- | --- |
| #12 | Phase 16 `086f13f8d95b8cdd6afd0ac85ac5d7fb5a2bd8a1` | Phase 15 |
| #13 | R1 `940e41069bc90289c50b0d6d7688e95ec9f03766` | Phase 16 |
| #14 | R2 `cb3e20f79b245cb6ceedde4a61a13fcac2b16033` | R1 |

R2 contains R1 transitively. Remote main was `dfe412c81c1254707cbd16083791dc009cf90643`; R2 was 34 commits ahead, zero behind. No prior branches, SQL proposals, migrations, application features or external records are changed. AGENTS.md, the configured cloud start skill, the cumulative audit, Phase 16 and R1/R2 evidence were consulted. The current running instance's reported revision is not proof that a new published environment revision has been adopted.

There was no tracked `.github` directory and GitHub returned zero workflows. Prior local evidence therefore did not establish hosted CI protection. R2 reported 517 application cases and 37 skipped database cases; those historical figures are independently rechecked below.

## Workflow architecture and activation

`.github/workflows/ci.yml` declares unfiltered `pull_request` events (including the stacked bases), push to main, and manual dispatch. Two independent jobs cover application checks and full/production dependency audits. Application checks run reproducible `npm ci`, lint, typecheck, CI helper tests, application tests and production build. Checks continue collecting evidence after an individual check failure, but preserve the failed step/job outcome. Installation failure prevents dependent checks. The test report counts passed/failed/skipped assertions separately and rejects unexpected database execution in the default job. Audit unavailability, invalid evidence and findings fail closed; both scopes run even when the full audit fails.

Both workflows use `contents: read`, SHA-pinned official actions, `persist-credentials: false`, exact Node 22.23.3 (compatible with `>=22.23.3 <23`), standard `ubuntu-24.04`, bounded timeouts, concurrency controls and dummy loopback bindings. Gemini, GEE and persistent vector providers remain disabled. No `pull_request_target`, secrets context, deployment, cache, artifact upload, large runner, self-hosted runner, security suppression or automatic provider switch is introduced. Application concurrency cancels superseded runs; the manual fixture workflow avoids automatic cancellation to allow cleanup. No existing regression test is removed.

Reviewed pins from official release refs and action source:

- `actions/checkout` v7.0.1: `3d3c42e5aac5ba805825da76410c181273ba90b1`.
- `actions/setup-node` v7.1.0: `949feb2413d6458794dcd2491c4babbbce0c15c1`.

These actions themselves use Node 24; the application runs Node 22.23.3. A current supported GitHub-hosted runner is required. `setup-node` automatic package-manager caching is explicitly off. The lockfile and dependency graph remain unchanged.

### Cost and permission evidence

The repository is PUBLIC. GitHub's [Actions billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions) states that public repositories using standard hosted runners receive free execution; larger runners are chargeable. This does not prove the current account's Actions permission/policy or authorize storage/paid resources. The repository Actions permissions endpoint returned **403**, so complete entitlement verification was unavailable.

Every job therefore has a literal **`false && ...` execution lock**. Pushing this branch can register a skipped workflow/check, but cannot start its runner jobs. A skipped check is not proof of successful CI. No workflow dispatch is performed. The synthetic workflow also requires a boolean manual confirmation and public repository status.

Before activation, the operator must verify current visibility, plan/Actions policy and standard-runner entitlement, approve execution, review workflow code and dependencies, and remove the literal lock in a reviewed change. Update the corresponding lock test intentionally; do not bypass a failed advisory gate. Only actual successful hosted checks may be labeled VERIFIED_PASS. Configure required branch checks after activation, never while relying on skipped jobs. No branch-protection settings are changed here.

## Dependency assessment

Fresh `npm ci` succeeded. Fresh `npm ls --all --json` found a consistent dependency tree. Full and production audits are captured before and after the work in [evidence](evidence/remediation-r3/). Audit exit 1 represents vulnerability findings, not installation failure.

| Scope | Initial affected packages | Final affected packages | Distinct source advisories | Severity |
| --- | ---: | ---: | ---: | --- |
| Full graph | 5 | 5 | 1 | High |
| Production (`--omit=dev`) | 0 | 0 | 0 | None reported |

The one source advisory is **GHSA-vfj7-8cjw-p6xm / CVE-2026-93687**, recursive brace AST processing without a depth guard. Current registry `braces` latest is 3.0.3, inside the affected range; the official advisory has no first patched version and is not withdrawn. The dependency path is:

`eslint-config-next@16.3.8` (direct development dependency) → `@next/eslint-plugin-next@16.3.8` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`.

All five audit entries are affected packages; they are not five independent CVEs. The plugin's `get-root-dirs` invokes fast-glob for configured root patterns; micromatch invokes braces. Current ESLint configuration does not supply `settings.next.rootDir`, which narrows this particular entry point. This is **not a NOT_AFFECTED determination**: adversarial patterns from changed tooling/configuration, transitive callers and untrusted PR contents remain relevant. Deeply nested brace patterns can exhaust the stack and terminate a process. No dangerous exploit payload is executed.

The audit's proposed Next ESLint downgrade to 14.2.35 is incompatible with the intended aligned Next 16 tooling strategy and is not applied. No safe upstream braces fix was available in the checked registry/advisory. No arbitrary override, major downgrade, advisory suppression or security waiver is added. Disposition: **UNPATCHED_BLOCKER; independent security review required**. Full CI audit intentionally fails; a clean production audit does not override it or certify overall security.

Containment: no privileged CI credentials, fixed execution budgets, independent audit reporting, review of tooling/configuration changes, and no external GIS/AI access in application checks. These controls do not patch the vulnerable parser. Monitor an upstream fix; reassess the actual dependency chain and rerun checks when one is published.

## Phase 06 browser reliability

R2 recorded two cancellation-button timeouts, then a diagnostic run with an added delay and an unchanged script pass on a clean server. Those results did not prove one root cause. The unchanged Phase 06 harness passed again in R3 on the owned local development server, with no concurrent build or browser suite.

The harness now waits for the completed response's **exact job ID and state** in the compute card and refuses a Copilot error state before continuing. It preserves existing cancellation, retry, approval, isolation, export, mobile and accessibility assertions. On failure it records synthetic UI diagnostics and a screenshot. There is no arbitrary sleep, retry-until-green behavior, or relaxation of the application's stale-response guard.

An initial R3 harness experiment waited for the send button to become enabled and timed out on the first action. Inspection confirmed that success clears the prompt and legitimately leaves that button disabled. This harness error was corrected: its restored label signals processing completion, then the job identity/state confirms the relevant rendered result. The failed experiment is retained in local evidence and is not counted as a passing run.

Viewport resize/map move events and asynchronous response rendering are plausible contributors to the historical timeout; neither server readiness, contention nor an application race has been conclusively established as its cause. **Residual flakiness remains unproven/residual, not declared eliminated.** Repeated passing isolated runs provide regression evidence, not a causal proof. Application store, authorization and response validation code are unchanged.

## Disposable PostGIS workflow

`.github/workflows/postgis.yml` is manual-only and locked. `scripts/ci/postgis.mjs --plan` describes the plan without invoking Docker or migrations. With separate authorization, `--run-synthetic-only` uses the existing pinned PostGIS/PostgREST fixture and a fresh private temporary state directory for each Phase 15/16 suite. The existing fixture creates only synthetic identities, projects and SQL proposal state. It never consumes an external database URL.

The runner explicitly uses the local Unix Docker socket; remote Docker configuration is removed. PostgreSQL readiness and bounded loopback PostgREST HTTP readiness must succeed before tests run. Loopback endpoints and owned network/container names are validated. Each suite must execute actual cases with no skips. Missing infrastructure is exit 2; test failure is exit 1. `finally` attempts cleanup on success or failure and verifies owned container/network names are absent. Raw container configuration, SQL traces and synthetic JWT state are not printed or uploaded.

No Docker fixture was started for R3. Offline tests verify lifecycle ordering, failure categories, ownership restrictions and cleanup attempts. These are **not actual database integration passes**. The default 37 opt-in database cases remain SKIPPED. A real authorized rehearsal is still required.

Hard runner termination or a killed fixture startup before its state file is written cannot guarantee application-level cleanup; the existing startup path performs its own compensating cleanup on handled exceptions. Use only disposable GitHub-hosted infrastructure for this workflow. Do not repurpose it for a persistent/shared Docker host without stronger ownership journaling and termination handling. The legacy helper's readiness loop alone is insufficient proof; the new wrapper independently asserts both services are ready.

## Local verification

Final command results and browser evidence are recorded in `docs/evidence/remediation-r3/verification-summary.json`. Committed console logs normalize trailing whitespace only; the original logs are retained locally. Detailed local logs reside under `/workspace/artifacts/remediation-r3/`; no confidential inputs were used. See that summary for actual counts, initial failures and skipped checks. Hosted Actions and real PostGIS execution remain pending regardless of local results.

### Final observed results

| Check | Result |
| --- | --- |
| Node 22.23.3 / npm 10.9.9 fresh `npm ci` | PASS; 541 installed packages; lockfile unchanged |
| `npm run lint`, `npm run typecheck`, `npm run build` | PASS |
| `npm test` (also JSON reporter) | **517 passed, 0 failed; 37 database cases SKIPPED**; 50 passing and 2 skipped files |
| `npm run test:ci` | **14 passed**, including fail-closed audits, fixture lifecycle and workflow policy |
| `node scripts/ci/test-report.mjs` | PASS; database passes 0, skips 37 |
| Official actionlint v1.7.12, checksum-verified binary | PASS for both workflow files |
| Browser regression | **11 distinct suites PASS**: Phase 01, 02, 03, 04, 05, 06, 07, 13, 14, R1 and R2 |
| Phase 06 reliability repetitions | Unchanged baseline PASS; corrected harness **3 isolated passes**; one initial harness experiment failed as explained above |
| Phase 12 GEE dependency isolation | PASS; 541 installed packages, 718 output files and 45 dependency traces inspected |
| Final `npm ls --all --json` | PASS |
| Full dependency gate | **FAIL (exit 1)**: 5 High affected development packages, 1 source advisory |
| Production dependency gate | PASS: zero reported affected packages |
| Hosted GitHub Actions | **PENDING**, not executed or certified |
| Actual PostGIS and Phase 15/16 database browser suites | **NOT RUN**; no fixture started; not counted as passes |

The browser batch ran sequentially against an owned server, without a concurrent build. R2 ran separately with an owned loopback Auth/REST double and no database. R1's nine lifecycle flows passed; R2's six upload flows passed. Applicable suites' embedded Axe/mobile assertions passed. Detailed synthetic summaries are in [browser evidence](evidence/remediation-r3/browser-evidence.json); automated accessibility is not a human audit. The development server was stopped before the final clean install/build.

`npm ci` also warns that ESLint 9.39.5 is no longer supported. This maintenance warning is separate from the braces advisory. Review a compatible supported ESLint/Next toolchain update when available; an unrelated major upgrade would not by itself patch the inherited braces path and was not applied in this focused change.

## Change inventory

The [exact changed-file list](evidence/remediation-r3/changed-files.txt) includes two workflows; five CI helper/test modules; the Phase 06 browser harness; the `test:ci` package script; local evidence ignore rules; this report and reviewed synthetic evidence. Application code, dependency versions, lockfile, database SQL and provider behavior are unchanged.

## Review requirements and remaining blockers

1. Review this focused Draft PR against R2; preserve PRs #1–#14 and their stack. Do not merge automatically.
2. Independently disposition the unresolved High development advisory; no waiver is self-approved. Obtain a safe upstream fix when available.
3. Verify Actions account policy/cost entitlement, then separately approve activation and collect real hosted checks before claiming CI protection.
4. Run the synthetic database workflow only after its execution is authorized; inspect actual pass counts, service readiness and cleanup. Review cancellation limitations.
5. Retain Phase 06 diagnostic evidence and investigate any recurrence under the final hosted/browser setup.
6. Production remains blocked on verified database foundations and transactions, external staging authorization, durable job/approval/process state, rate limits across replicas, real GIS data/licensing, any separately authorized commercial providers, deployment verification and human UAT. R2's legacy multi-call project persistence is not made transactional by CI. ZIP uploads remain unconditionally refused; no claim that CI solves all upload or operational security risks.

This is regression and configuration verification, not a penetration test, security certification, production approval or methodology validation.

## Draft delivery and observed GitHub checks

Draft [PR #15](https://github.com/HannR002/p4i-webgis/pull/15) targets R2. GitHub registered [workflow run 39300299420](https://github.com/HannR002/p4i-webgis/actions/runs/39300299420) on implementation commit `b8d58d66babe8d025636b547fd69c221fab8563e`: both `application` and `dependencies` concluded **SKIPPED**, confirming the execution locks. This is not a hosted verification pass or approval to activate CI. The exact read-only API snapshot is retained in [delivery status](evidence/remediation-r3/delivery-status.json). No earlier PR was merged, retargeted or marked ready.
