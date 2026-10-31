# R7.2 — Dependency remediation investigation and preview release gate

Date: **1 November 2026 (Asia/Jakarta)**. Repository: `HannR002/p4i-webgis`. Parent: Draft PR #19, branch `fix/r7-1-independent-preview-review`.

**PREVIEW: NO-GO. PRODUCTION: NO-GO.** The audit blocker was reproduced. No safe supported dependency change was established for the current stack. A minimatch 11 override clears the audit but breaks an actual accessibility-rule execution. It was rejected. All application dependencies, configuration and the lockfile remain unchanged. This child PR supplies the investigation, fresh regression evidence and owner-side release checklist; it does not claim that remediation succeeded.

## 1. Exact revision and scope

- Verified GitHub parent head and exact tested SHA: **`73d86c06ec4f3dc7a31b029bd77733dd858707d1`**. PR #19 remains Draft/unmerged.
- Earlier tested application candidate: `656813ed0325d2cfd85d603824e8434aac0ac90b`. PR #19's later commit added documentation/evidence; this review nevertheless installed and tested the exact parent head.
- Final dependency/application tree is byte-identical to that parent. Lockfile SHA-256: **`aca2e837d530006d5946692111e4e7200b2b0262fc03714540550a770a4c2a20`**.
- This child changes only the report and evidence listed below. Its documentation commit is a descendant of the tested SHA, not a new certified deployable candidate. **No SHA is approved/certified for deployment.**

R7 and R7.1 reports and retained audits were read. The historical R7 zero-finding result predates the current advisory; it is not substituted for today's audit. Disposable detached worktrees isolated dependency experiments from the review branch. No trial manifest or lockfile was copied back.

No deployment, merge, Supabase operation, SQL execution, Docker fixture, external AI activation, protection change, Corporate Hub change, or GitHub Actions activation occurred. No credentials were requested, printed or copied to the application. Local checks used a whitelist environment excluding inherited Supabase/GEE bindings.

## 2. Root cause and exact dependency graph

The registry/GitHub advisory is [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), “minimatch has potential denial of service via globparts amplification,” published **30 October 2026 23:09:55 UTC**. The current advisory declares **`<11.0.1`** affected and **11.0.1** first patched. Its description discusses minimatch 10.2.6 preprocessing with `optimizationLevel >= 2`. That description does not establish a demonstrated exploit against every older major or this application's HTTP surface. The audit nevertheless classifies both installed versions as affected; no exclusion/waiver was introduced.

The unchanged lock has two physical minimatch installations:

| Root path / consumer | Locked consumer version | Declared minimatch range | Resolved minimatch |
| --- | --- | --- | --- |
| `eslint` | 9.39.5 | `^3.1.5` | 3.1.5, root installation |
| `eslint` → `@eslint/config-array` | 0.21.2 | `^3.1.5` | 3.1.5 |
| `eslint` → `@eslint/eslintrc` | 3.3.6 | `^3.1.5` | 3.1.5 |
| `eslint-config-next@16.4.3` → `eslint-plugin-import` | 2.32.0 | `^3.1.2` | 3.1.5 |
| `eslint-config-next@16.4.3` → `eslint-plugin-jsx-a11y` | 6.10.2 | `^3.1.2` | 3.1.5 |
| `eslint-config-next@16.4.3` → `eslint-plugin-react` | 7.37.5 | `^3.1.2` | 3.1.5 |
| `eslint-config-next@16.4.3` → `typescript-eslint@8.67.0` → `@typescript-eslint/typescript-estree` | 8.67.0 | `^10.2.2` | 10.2.6, nested under typescript-estree |

The full audit has **16 affected-package entries from one distinct advisory**, including propagated ESLint/config/parser/plugin dependents. It does not mean 16 distinct advisories or 16 minimatch installations. The production audit has zero affected entries. No preview API was found to execute this lint tooling; development-only classification does not make the repository's full audit gate pass.

Evidence: [locked dependency edges](evidence/r7-2/minimatch-lock-edges.json), [before audit](evidence/r7-2/before-audit-full.json), [advisory snapshot](evidence/r7-2/advisory.json), [current upstream metadata](evidence/r7-2/upstream-current-consumers.json).

## 3. Smallest-change investigation and rejected alternatives

| Isolated experiment | Actual outcome | Decision |
| --- | --- | --- |
| `npm update eslint eslint-config-next --package-lock-only --ignore-scripts` | Operation exit 0; selected ESLint 9.39.5/config-next 16.4.3; subsequent audit exit 1, **16 moderate entries / 1 advisory** | Does not remediate |
| `npm update minimatch --package-lock-only --ignore-scripts` within declared consumer ranges | Operation exit 0; subsequent audit exit 1, **16 moderate entries / 1 advisory** | No patched release admitted by the current ranges |
| Exact upstream ESLint 10.14.0, lock-only installation without `--force`/legacy-peer flags | Operation exit 0 with peer override warnings; subsequent audit exit 1, **15 moderate entries / 1 advisory**; `npm ls eslint --all --package-lock-only --json` exits 1 with `ELSPROBLEMS` | Neither audit-clean nor supported by the installed React/import/a11y plugin peer ranges |
| Global trial override `"minimatch": "11.0.3"` | Lock generation and clean `npm ci` exit 0; full audit exit 0 with **0 findings**; repository lint exits 0 with its existing warning | Audit result alone is insufficient |
| Actual JSX accessibility rule under that override | Baseline completes and reports the expected label violation; override throws **`TypeError: (0 , _minimatch.default) is not a function`** in `jsx-a11y/label-has-associated-control` | **Incompatible; override rejected** |

Registry metadata was checked rather than assuming latest versions fix the graph. Current stable `eslint-config-next` is still 16.4.3. Current `eslint-plugin-import` 2.32.0, `eslint-plugin-jsx-a11y` 6.10.2 and `eslint-plugin-react` 7.37.5 still declare minimatch 3 ranges and ESLint peer ranges that exclude 10. Current `@typescript-eslint/typescript-estree` 8.72.1 still declares `minimatch:^10.2.2`; ESLint 10.14.0 and current config-array 0.23.5 also still declare minimatch 10 ranges. Minimatch's current legacy-v3 tag is 3.1.5, legacy-v9 is 9.0.9, and latest is 11.0.3. None supplies an advisory-clean patch inside the required 3.x/10.x ranges.

The compatibility probe uses ESLint's real `Linter` with the installed a11y plugin on:

```jsx
const Example = () => <label><CustomControl /></label>;
```

It enables `jsx-a11y/label-has-associated-control` with supported `controlComponents: ['Custom*']` and `depth: 3`. Baseline returns “A form label must have accessible text.” The override crashes during `mayContainChildComponent`. Older consumers expect a callable CommonJS/default minimatch export; version 11 exposes a named `minimatch` function and a different module shape. Existing repository lint happens not to exercise that option path, illustrating why its green result cannot justify the override. [Actual comparison output](evidence/r7-2/override-compatibility.log) retains the stack. The read-only [reproduction script](evidence/r7-2/reproduce-override.cjs) accepts the two installed worktree roots; its exit 0 means the expected incompatibility was confirmed, not that the override is acceptable.

No safe supported fix was demonstrated. No override, shim, vendored patch, forced downgrade from npm's misleading audit suggestion, peer suppression, audit exclusion, dev-dependency removal or lint-rule removal is proposed. Replacing lint tooling or patching third-party consumers would require a larger compatibility review. The next focused remediation should use maintained consumer updates/backports that accept a patched minimatch version, or a reviewed upstream advisory correction; neither is established here. Re-run the unchanged full gate when such releases exist.

The trial wrapper sometimes exits 0 after recording multiple subprocess results. **`TRIAL_EXIT` is the actual npm exit**, not that wrapper's final exit. See [trial versions](evidence/r7-2/trial-lock-versions.json), [supported update](evidence/r7-2/trial-supported-update.log), [range update](evidence/r7-2/trial-range-update.log), [ESLint 10](evidence/r7-2/trial-eslint10-audit.log), and [override trial](evidence/r7-2/trial-override.log).

## 4. Before/after audit and lockfile verification

| Command on the selected unchanged tree | Before exit / findings | Final exit / findings |
| --- | --- | --- |
| Clean `npm ci` | **0**; 541 packages installed; reports 16 moderate audit entries | Same valid locked tree retained; no trial changes applied |
| `npm audit --json` | **1**; info 0, low 0, **moderate 16**, high 0, critical 0; **1 distinct advisory** | **1**, identical counts |
| `npm audit --omit=dev --json` | **0**; all severities 0; 0 advisories | **0**, identical counts |
| `node scripts/ci/dependency-audit.mjs` | **1**; full FAIL / production PASS | **1**; full FAIL / production PASS |

Both final audit commands and the actual dependency-gate script were re-executed after rejecting the trials. The lockfile was compared byte-for-byte with `git show 73d86c0:package-lock.json`; its hash is recorded above. There is no selected dependency update to reinstall after the initial clean install. npm's deprecated ESLint warning remains accurate and open. [Summary](evidence/r7-2/verification-summary.json), [final full audit](evidence/r7-2/after-audit-full.json), [final production audit](evidence/r7-2/after-audit-production.json), [final gate output](evidence/r7-2/after-dependency-gate.log).

## 5. Regression verification

All following acceptance checks target the original, unchanged dependency/application tree, **not the audit-clean incompatible override**. Runtime tooling: Node **22.23.3**, Next **16.4.3**, React **19.2.8**, Vitest **4.1.12**, Chromium. No hosted execution is claimed.

| Check | Result |
| --- | --- |
| `npm run lint` | Exit **0**; 0 errors, 1 existing unused `describe` warning in `tests/academicPreview.test.ts` |
| `npm run typecheck` before any build in the clean worktree | Exit **0**; `next typegen && tsc --noEmit` generates missing route types correctly |
| Preflight then `npm run build` | Exit **0** on Node 22.23.3; optimized production build and proxy emitted |
| `npm test -- --maxWorkers=2` | Exit **0**; **596 PASS, 0 FAIL, 37 PostGIS SKIPPED**, 52 files pass / 2 skip |
| R6.1 JSON ingestion tests | All **39** `jsonBody.test.ts` cases pass within that application count; deadlines, bounded ingestion and abort cases retained |
| `npm run test:ci` | Exit **0**; **52 PASS**, including rejection of missing/partial/invalid evidence; no gate implementation changes |
| Academic expanded HTTP/policy probe | Exit **0**; **206 HTTP checks and 38 configuration/preflight checks** |
| Invalid academic identity / normal production boundaries | Exit **0**; invalid identity returns 503; production refuses development compute/vector/consulting and external-provider routes |
| Original academic browser suite | Exit **0**; 22 boundary checks; limitations at 1480/390/320px |
| Vector browser workflow | Exit **0**; Leaflet rendering, MapRecipe, deterministic planner, draw/edit, local drafts, Undo/Redo, actual GeoJSON/PNG/PDF downloads; 1480/768/390/320px checks |
| Raster browser workflow | Exit **0**; native bands, NoData, categorical refusal, local statistics/subset, division-by-zero masking and actual PNG/PDF downloads; desktop/mobile |
| Browser failure injection | Exit **0**; local Copilot POST abort displays failure and leaves the recipe unchanged |

The expanded probe covers sensitive-route verbs, spoofed headers/cookies/roles, malformed flags and JSON, private dataset IDs, encoded/traversal paths and preflight refusals. Production/academic separation, synthetic-only providers, no real identity/admin/privileged compute, disabled database persistence, and absent Gemini/GEE are preserved. Server fetch interception during these local runs recorded **zero non-loopback fetch attempts**; the image optimizer negative test used `example.invalid`, not Supabase. Source and all provider guards are unchanged.

The actual exported GeoJSON has 7 features. Both PNGs have valid signatures and dimensions **1802×1450**; their hashes match R7.1's previously visually inspected exports. Two PDFs have valid headers/EOF and extracted DEMO/provisional-methodology warnings. They are approximately 7.86MB each and generated locally in the browser. Scoped axe checks report no violations and no uncaught page errors. No scientific validity, GeoTIFF generation, real database persistence, external basemap reliability or complete human UAT is certified. [Export verification](evidence/r7-2/exports.json).

PostGIS remains **SKIPPED**, never PASS: no fresh fixture was authorized, created or used. Local status/identity environment fixtures are explicitly test simulation, not Vercel injection evidence. No fabricated system variables were configured remotely. The raster harness changed only its hardcoded local origin in a scratch copy. The initial scratch build wrapper contained an extra brace and exited 1 before repository code ran; correcting that harness produced the recorded successful preflight/build. No application fix or timeout change was needed.

Remaining warnings: the full audit failure; unsupported/deprecated ESLint 9 notice; the existing unused import; and Node's harmless `MODULE_TYPELESS_PACKAGE_JSON` warning when importing the erasable TypeScript policy. No warning was suppressed.

## 6. Observed Vercel configuration and required settings

Read-only management access is available through the Vercel connector. The exact project was re-read:

| Setting | Observation |
| --- | --- |
| Project/team | `p4i-webgis` / `prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb`; `farhan-dd58` / `team_FjboY4JHoWxq0U3C6artFavI` |
| Project Node major | **22.x**, confirming the owner's update |
| Framework | Next.js |
| Deployment state | `live=false`, `latestDeployment=null`; deployment listing empty |
| Project env listing | Empty, queried without decrypting values |
| Protection | Vercel Authentication/SSO enabled for `all_except_custom_domains`; password/trusted-IP protection off; no custom domains |
| Local Vercel project link / CLI credential variables | Absent; no automatic linking or login attempted |

The connector omits the system-variable exposure setting, full build/root settings, shared env attachments, Git linkage, project routing and detailed bypass exceptions. Their absence from this response is **not verification** that they are configured safely. [Observed snapshot](evidence/r7-2/platform.json).

The source still requires **Node >=22.23.3 <23** at preflight and runtime. `package.json` engines and the 22.x project setting now agree on the major. Vercel selects majors and may use different build/function patches; neither actual remote patch has been observed. Local Node22 success is not a platform runtime check.

Repository `vercel.json` remains:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "node scripts/deployment/academic-preflight.mjs && npm run build",
  "git": { "deploymentEnabled": false }
}
```

The preflight's standalone TypeScript import succeeds on actual local Node 22.23.3 without ts-node/tsx. It refuses disabled/invalid mode and checks the same policy used at runtime. Git's all-branch automatic-deployment flag remains false; manual CLI/API deployment is a separate action. Existing Actions `false &&` locks are unchanged. No new project, linkage, environment variable or deployment was created.

Future approved Preview configuration must supply these **nonsecret project values at both build and runtime**: `P4I_ACADEMIC_PREVIEW=true`, `P4I_PREVIEW_ID=p4i-webgis-academic-v1`, `AI_PROVIDER=academic-demo`, `VECTOR_STORAGE_MODE=disabled`, `GEMINI_FREE_ENABLED=false`; explicitly keep `GIS_DEMO_MODE=false`.

Vercel must actually provide `VERCEL=1`, `VERCEL_ENV=preview`, the exact `VERCEL_PROJECT_ID`, and its generated lowercase `.vercel.app` hostname in `VERCEL_URL`. Official documentation says these are available at build and runtime **when Enable access to System Environment Variables is enabled**. This setting and actual injection remain unverified. Do not supply hand-written remote replacements. `NODE_ENV` remains production for the optimized preview. `VERCEL_GIT_COMMIT_SHA` is optional provenance metadata; null requires checking deployment provenance, not fabricating a SHA variable.

Keep Supabase public settings absent, and keep `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SUPABASE_DB_URL`, `GEMINI_API_KEY`, all GEE credential/project/asset fields, `VECTOR_STORAGE_LOCAL_URL` and `VECTOR_STORAGE_LOCAL_ACK` absent/empty. No Supabase, AI or other backend integration may be attached. An empty project-env listing does not establish absence of shared/branch/integration bindings.

## 7. Owner-side connector checklist and release gate

Use the owner-side connector for fields not exposed to Codex; **read-only now**:

1. Return only nonsecret project fields: project/team IDs, framework/root, effective install/build commands and overrides, Node major, `autoExposeSystemEnvs`, Git provider/repository/branch linkage, protection scope, routing rules, protection exceptions and bypass metadata. Do not return secret values.
2. Confirm any linked repository is exactly `HannR002/p4i-webgis`; check account-level Git settings as well as source `git.deploymentEnabled=false`. Confirm build context contains the pinned source/config. Do not enable automatic deployment or Actions.
3. Enumerate Preview/branch/shared/integration **variable names and scopes only**, showing the required academic configuration and absence of backend credentials. The current project listing is empty; configuration is still pending.
4. Confirm generated preview URLs remain protected and determine the supervisor's account/request-access mechanism and entitlement. No URL or access grant exists from this work. Retain protection; do not add public exceptions or generate/share bypass secrets here.

Only after the audit blocker has a compatible reviewed fix, all local gates pass on its exact SHA, and an explicit later deployment is authorized may the owner configure the required Preview values and run the protected remote build. That future action must record actual build Node patch, preflight result and nonsecret identity presence, then actual protected runtime patch/status, source provenance, anonymous denial, supervisor access, API denials and export smoke tests. It cannot be pre-certified by a local simulation. The R7.1 manual source-upload procedure remains preparatory; **do not execute it now** and do not use its older candidate SHA by default.

| Release gate | Status |
| --- | --- |
| Parent/source identity, valid unchanged lock, local regression | PASS |
| Full dependency gate | **FAIL — 16 moderate entries / 1 advisory** |
| Safe compatible dependency remediation | **NOT ESTABLISHED** |
| Project Node 22 major / protection configured | Observed PASS |
| Required Preview config | Missing/unverified |
| Git linkage/system injection/shared env/build/routing checks | UNVERIFIED |
| Actual Vercel build/function patch and hosted acceptance | NOT RUN; deployment excluded |

**PREVIEW NO-GO:** do not deploy this tree. Exact tested SHA remains `73d86c06ec4f3dc7a31b029bd77733dd858707d1`; no replacement dependency candidate is certified. **PRODUCTION NO-GO separately:** academic mode refuses production identity, and the real backend/RLS/Auth, durable jobs/persistence, migrations, operational recovery and real provider readiness remain outside this verification. Production-audit zero does not confer production approval.

## 8. Rollback and continuation

There is no deployed release to roll back. No selected dependency change needs reverting. The three experiment worktrees are disposable and were never release sources. The parent manifest/lock remain the recovery reference; reverting documentation has no application behavior effect.

When a safe consumer update becomes available, open a focused successor against the reviewed branch, retain the unchanged gate, regenerate and validate its lock with `npm ci`, re-run both audits and regression/compatibility checks, and record that new exact SHA. A failed future preview stays unpromoted; preserve logs and use a separately authorized retirement operation. There is no known-good production deployment to invent as a rollback target. Never reconnect Supabase, disable protection, restore broad SQL policies or enable paid providers as a fallback.

## 9. Complete modified-file list

No application source, dependency manifest, lockfile, SQL, Vercel config or workflow is modified. This report and the following retained evidence are the entire proposed change:

```text
docs/R7_2_DEPENDENCY_REMEDIATION_AND_RELEASE_GATE.md
docs/evidence/r7-2/advisory.json
docs/evidence/r7-2/after-audit-full.json
docs/evidence/r7-2/after-audit-production.json
docs/evidence/r7-2/after-dependency-gate.log
docs/evidence/r7-2/application-tests.log
docs/evidence/r7-2/before-audit-full.json
docs/evidence/r7-2/before-audit-production.json
docs/evidence/r7-2/before-dependency-gate.log
docs/evidence/r7-2/before-npm-ci.log
docs/evidence/r7-2/browser-boundary.json
docs/evidence/r7-2/browser-raster.json
docs/evidence/r7-2/browser-vector.json
docs/evidence/r7-2/build.log
docs/evidence/r7-2/ci-helpers.log
docs/evidence/r7-2/exports.json
docs/evidence/r7-2/failure-review.json
docs/evidence/r7-2/fresh-typecheck.log
docs/evidence/r7-2/http-security.json
docs/evidence/r7-2/http-security.log
docs/evidence/r7-2/lint.log
docs/evidence/r7-2/manifest.json
docs/evidence/r7-2/minimatch-lock-edges.json
docs/evidence/r7-2/override-compatibility.log
docs/evidence/r7-2/platform.json
docs/evidence/r7-2/reproduce-override.cjs
docs/evidence/r7-2/runtime-boundary.json
docs/evidence/r7-2/server-outbound.jsonl
docs/evidence/r7-2/trial-eslint10-audit.log
docs/evidence/r7-2/trial-eslint10.log
docs/evidence/r7-2/trial-lock-versions.json
docs/evidence/r7-2/trial-override.log
docs/evidence/r7-2/trial-range-update.log
docs/evidence/r7-2/trial-supported-update.log
docs/evidence/r7-2/upstream-current-consumers.json
docs/evidence/r7-2/upstream-eslint-config-next.json
docs/evidence/r7-2/upstream-eslint-latest.json
docs/evidence/r7-2/upstream-minimatch-tags.json
docs/evidence/r7-2/verification-summary.json
```

Official references checked: [advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), npm registry metadata for the exact consumers, [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [system variables](https://vercel.com/docs/environment-variables/system-environment-variables), and [Git deployment controls](https://vercel.com/docs/project-configuration/git-configuration). Full local logs use executor timestamps; the report date uses Asia/Jakarta.
