# R5 — Critical Next.js remediation and cumulative regression

Date: **24 October 2026, Asia/Jakarta**. Base: R3 `063b61f1dcf0208cc1d428d14b1383425d54a635`. Branch: `fix/post-audit-r5-nextjs-critical-security`. Review target: `fix/post-audit-r3-ci-security-gates`.

## Outcome and review boundary

Next.js and its ESLint configuration are aligned at stable **16.4.3**. The three targeted Next.js advisories no longer match the installed version. Two additional demonstrated development dependency issues were addressed with Vite **7.3.7** and transitive Zod **4.6.7**. Fresh full and production npm audits report **zero affected packages**, and the existing fail-closed dependency gate passes unchanged. This is a verified dependency remediation, not a penetration test or general security certification.

**Cumulative merge remains NO-GO until independent review, required verification and security disposition. Production remains NO-GO.** No security waiver is granted. The Phase 15/16 real PostGIS suites were not rerun on R5: the five R4 fixture authorizations are exhausted. R4's 37 real database passes, two real-database browser suites and four real-result lifecycle flows remain historical evidence for R3, not new R5 passes.

## Verified starting point

The existing checkout was clean. Live Git heads and the GitHub API confirmed PRs #12–#15 remained open Drafts, unmerged, with the intended bases and ancestry:

| PR | Head |
| --- | --- |
| #12 Phase 16 | `086f13f8d95b8cdd6afd0ac85ac5d7fb5a2bd8a1` |
| #13 R1 | `940e41069bc90289c50b0d6d7688e95ec9f03766` |
| #14 R2 | `cb3e20f79b245cb6ceedde4a61a13fcac2b16033` |
| #15 R3 | `063b61f1dcf0208cc1d428d14b1383425d54a635` |

Each preceding SHA is an ancestor of the next. Main remained `dfe412c81c1254707cbd16083791dc009cf90643`. R5 branches directly from the verified R3 head; no worktree, rebase, reset, merge or history rewrite. Earlier PRs remain intact.

AGENTS.md, published start_skill, R3 report, completed R4 report, package/lockfile, CI gate implementations/workflows and installed Next.js installation/cache/image documentation were read. Node **22.23.3**, npm **10.9.9**, Linux were used explicitly; the host's default Node 24 was not used for validation. The published environment uses dummy loopback Supabase bindings and disabled external providers for this task. Credentials are not recorded in evidence.

## Official advisories and initial inventory

Current official vendor records and GitHub Advisory Database metadata were fetched before remediation. The registry and vendor release confirm **16.4.3 is stable, not canary/prerelease**. Vendor URLs are authoritative sources for this decision:

- [Cache Components RCE — GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).
- [Image pipeline RCE — GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), vendor CVE **CVE-2026-96889**. The global advisory snapshot's `cve_id` is null while the vendor record and NVD reference identify this CVE; both sources are preserved.
- [Server Action DoS — GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), **CVE-2026-94482** in the global record.
- [Stable v16.4.3 release](https://github.com/vercel/next.js/releases/tag/v16.4.3).

| Advisory | Reported severity | Affected range relevant to this graph | First patched | R5 disposition |
| --- | --- | --- | --- | --- |
| GHSA-673q-mjm6-r5xr | Critical | Next `>=16.0.0 <=16.4.0` | 16.4.1 | FIXED: installed 16.4.3 |
| GHSA-2464-fhr4-w9xw | Critical | Next `>=16.0.0 <=16.4.0` | 16.4.1; sharp workaround >=0.35.5 | FIXED framework; actual sharp/binary checked |
| GHSA-p3m5-59mp-jv5r | High | Next `>=16.0.0 <=16.4.0` | 16.4.1 | FIXED: installed 16.4.3 |
| GHSA-698v-4r3x-3vcv | Moderate | Vite `>=7.0.0 <=7.3.6` | 7.3.7 | FIXED |
| GHSA-r825-w8mm-5pxw | Moderate | Vite `>=7.0.0 <=7.3.6` | 7.3.7 | FIXED |
| GHSA-587h-7wmj-h5pm | High | Vite `>=7.0.0 <=7.3.6` | 7.3.7 | FIXED |
| GHSA-9jrq-w75r-8gcw | Low | Vite `>=7.0.0 <=7.3.6` | 7.3.7 | FIXED |
| GHSA-rq7h-c2jc-7f22 | Moderate | Vite `>=7.0.0 <=7.3.6` | 7.3.7 | FIXED |
| GHSA-mrhx-c7xc-m3w5 | High | Zod `<4.6.6` | 4.6.6 | FIXED: compatible 4.6.7 resolution |
| GHSA-vfj7-8cjw-p6xm | Withdrawn (formerly High) | Historical braces `<=3.0.3` | None in withdrawn record | UPSTREAM_WITHDRAWN; no suppression or self-waiver |

Full published ranges, CVEs, URLs and first-patched releases are in [official-advisories.json](evidence/remediation-r5/official-advisories.json). The image advisory also covers Next `>=10.0.0 <=15.5.27`, and Server Action advisory `>=13.0.0 <=15.5.27`; 15.5.28 patches those older lines. They do not justify downgrading this application. Range comparisons against the actual before/after lockfile are in [advisory-range-verification.json](evidence/remediation-r5/advisory-range-verification.json).

The R5 starting audit reported **three affected packages**: Next Critical (production), Vite High (development), Zod High (development), comprising nine source advisory URLs. This differs from R4's seven affected packages: npm now reflects the upstream braces withdrawal, while Zod's newer finding has appeared. No historical audit was erased or reinterpreted as a current pass.

## Application exposure assessment

Evidence combines source/AST inspection of 171 application/component/library TypeScript files, compiled configuration and Server Action registration metadata, resolved dependencies and benign local runtime requests. It does not rely only on text search or assert that unobserved features can never become reachable.

| Surface | Verified state and implication |
| --- | --- |
| App Router | Present (`app/` routes, route handlers and compiled route inventory); affected framework version before upgrade |
| Cache Components / `use cache` | Compiled `cacheComponents=false`; no `use cache` directive in inspected AST; no typed-array cache-return entry point identified. RCE precondition not demonstrated in this build. Vendor explicitly recommends upgrading even without such functions; R5 upgrades |
| Server Actions | No `use server` directives in the inspected source; compiled Node and Edge action maps both empty. Reviewed form/client paths use API requests. Crafted-action DoS prerequisite not currently demonstrated; no blanket waiver or claim about other deployments |
| `next/image` | Used in `components/gis/PortalPages.tsx` for local PNG previews with per-image `unoptimized`; no custom image loader |
| Image Optimization API | Still reachable despite unoptimized portal images: a benign local PNG converts to WebP successfully in compiled production mode. Therefore the renderer choice alone does not eliminate framework exposure |
| SVG and external images | Compiled `dangerouslyAllowSVG=false`, `remotePatterns=[]`, default loader, empty loader file. External image and invalid-width requests return 400. No malicious SVG or RCE payload executed |
| Image-processing runtime | Linux native sharp is actually loaded. sharp 0.35.5 satisfies the vendor workaround; Next 16.4.3 also raises its sharp dependency minimum. Native versions are recorded below |
| Development Vite | Used by Vitest/tooling, not the production Next server. Advisories have Windows/editor/custom-middleware/filesystem prerequisites; no destructive exploit attempted and no feature-based blanket dismissal. Compatible patch applied |
| Development Zod | `eslint-config-next → eslint-plugin-react-hooks → zod`, also peer of `zod-validation-error`. Potential malformed/oversized validation input is a tooling concern. Compatible patch applied instead of relying on deployment exclusion |

[Exposure and resolved versions](evidence/remediation-r5/exposure-and-versions.json) include only selected configuration/counts, not Server Action encryption keys or environment secrets. No new application capabilities, server actions, cache settings, remote image allowlists or loaders were enabled.

## Minimal dependency changes and lockfile integrity

| Package | Before | After | Reason |
| --- | --- | --- | --- |
| next | 16.3.8 | **16.4.3** | Three targeted security advisories |
| eslint-config-next | 16.3.8 | **16.4.3** | Aligned framework lint configuration |
| @next/env, @next/eslint-plugin-next, platform SWC packages | 16.3.8 | **16.4.3** | Required framework dependencies |
| vite | 7.3.6 | **7.3.7** | Five demonstrated development advisories; compatible patch |
| zod (transitive, development) | 4.4.3 | **4.6.7** | Newly reported High; within existing `^3.25.0 || ^4.0.0` range |
| sharp | 0.35.5 | **0.35.5** | Already satisfies >=0.35.5 workaround; reverified fresh |
| React / React DOM | 19.2.8 | 19.2.8 | Compatible with Next peers; unchanged |
| Vitest | 4.1.12 | 4.1.12 | Compatible with patched Vite; unchanged |

Only three direct version declarations changed. Zod changed only in the lockfile; no new direct dependency, override or allowlist was introduced. The selected latest compatible Zod patch was registry-verified as 4.6.7, above first-fixed 4.6.6. Next 16.4.3 accepts Node >=20.9 and React ^19; Vite 7.3.7 accepts Node >=22.12, covering 22.23.3. ESLint/TypeScript peer ranges are satisfied. Installed resolver/tree checks confirm no invalid dependency edges.

Executed controlled commands:

```sh
npm install --package-lock-only --ignore-scripts
npm ci
npm explain zod
npm update zod --package-lock-only --ignore-scripts
npm ci
```

The first install validated the framework update; the second fresh install validates the final Zod-inclusive lockfile. `npm audit fix --force` was never used. The lockfile was retained and updated through npm, not deleted. [Lock diff](evidence/remediation-r5/lock-diff.json) inventories every changed package; integrity/resolution fields accompany version changes. Verification does not mutate the final lockfile. `npm ls --all --json` passes on the actual fresh installation.

Actual Linux image chain: `sharp@0.35.5`, `@img/sharp-linux-x64@0.35.5`, `@img/sharp-libvips-linux-x64@1.3.4`, runtime libvips **8.18.7**, librsvg **2.63.2**. Other native library versions and platform lock entries are retained in the exposure record. Windows/macOS/ARM binaries were not executed; local assurance is Linux only. No obsolete duplicate Next/sharp resolution was found in the locked tree.

The framework regenerates the AGENTS.md managed heading from H1 to H2 when starting development mode. That one-line generated documentation change is retained to match 16.4.3; its instructions are otherwise unchanged. Application code, SQL proposals, migrations, authorization, GIS engines, existing tests and all workflows/gates are unchanged. No compatibility workaround or security setting relaxation was necessary.

## Braces: withdrawal is not a package patch

The official [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) was withdrawn on **2026-10-23T12:53:02Z** because it was not considered practically exploitable. The record retains the historical stack-exhaustion description and has no first-patched version. Registry braces latest and installed remain **3.0.3**.

The dependency path remains `eslint-config-next@16.4.3 → @next/eslint-plugin-next@16.4.3 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`. The original concern involved attacker-controlled deeply nested patterns processed by tooling. Current ESLint config has no custom `settings.next.rootDir`, hosted CI remains locked, and tooling/configuration changes still require review. These are context/containment observations, not a claim that package code was repaired.

Unlike the earlier R4 registry snapshot, the **current full npm audit also reports no braces advisory**. Thus there is no unresolved npm finding for it in this snapshot; the disposition is based on official withdrawal, not production-only audit cleanliness. Independent reviewers must review that changed evidence. No ignore rule, security exception or suppression was added. The audit gate remains fail-closed for future findings.

## Actual verification and limitations

See [verification-summary.json](evidence/remediation-r5/verification-summary.json) for executed commands, counts and browser outcomes. Detailed logs and screenshots remain outside source under `/workspace/artifacts/remediation-r5/`.

- Fresh Node 22 installation: PASS; 541 installed packages.
- Lint, typecheck, build, npm dependency tree: PASS.
- Application tests: **517 PASS, 0 FAIL, 37 SKIPPED** (explicitly opt-in database cases).
- CI helper tests: **14 PASS**, including fail-closed reporting and workflow locks.
- Existing dependency gate: PASS for both full and production scopes, without gate edits.
- Phase 12 GEE isolation: PASS; no GEE activation.
- Offline actionlint: PASS; workflows unchanged.
- Compiled local `next start`: **12 API/isolation/rate-limit checks, 3 image/framework checks, 7 vector production-boundary checks PASS**.
- Browser regression: **11 suites PASS, zero failed suites**, including embedded responsive/Axe assertions; suites ran sequentially with no concurrent build. No runtime assertion failures or retries were needed.

Production-mode local tests used `GIS_DEMO_MODE=false`, dummy Supabase, AI demo unavailable in production, no Gemini/GEE, and vector storage disabled. The Phase 09 result's legacy literal label `LOCAL_NEXT_START_WITH_DEMO_FLAGS_SET` does not describe this run's actual false flag; its assertions still exercised fail-closed production behavior. These loopback checks are not a deployment test or external database test.

Browser scope includes Phase 01–07, Phase 13 editing, Phase 14 digitizing, R1 lifecycle and R2 upload. Relevant suites cover portal/navigation/auth redirects, Leaflet/hydration, MapRecipe/Undo/Redo, raster NoData, AHP/WLC, PDF/PNG, configuration, controlled compute, approval denial, Copilot response guards, deliverables, geometry and upload boundaries. R1 uses documented synthetic response fixtures; R2 uses an owned loopback Auth/REST double. Neither is actual PostGIS. The wrapper refuses non-loopback browser requests, so external basemap/network availability is not certified.

Phase 15/16 browser runners remain unchanged and pass Node 22 syntax checks. Default persistence/analysis contract regression passes, and the Phase 15 compiled production-boundary checks pass. **Actual database/browser execution after the framework upgrade remains NOT_RUN / AUTHORIZATION_REQUIRED.** A separately authorized follow-up should use `scripts/ci/postgis.mjs --run-synthetic-only` for 37 actual cases and fresh isolated fixtures for `phase-15-vector-persistence.mjs` and `phase-16-vector-analysis.mjs`. No R4 resource/state is reused and no Docker resource was created, restarted or deleted in R5. R4 report checksum is unchanged.

## Before/after audit

| Scope | Before R5 | After R5 |
| --- | --- | --- |
| Full | 3 affected packages: 1 Critical, 2 High; 9 source advisories | **0** |
| Production | 1 Critical package (Next); 3 source advisories | **0** |
| Braces | Officially withdrawn; absent from current starting npm audit | Still withdrawn; no suppression |

The official version-range verification finds zero nonwithdrawn listed advisories matching the final installed versions. Audit exit 1 before remediation meant findings, not failed installation. Audit exit 0 after remediation does not certify overall application security or remove operational risks.

## CI, residual risks and independent review

Workflow SHA-256 and gate hashes match R3 exactly; `false &&` execution locks remain. Local helper checks and actionlint are not GitHub-hosted CI passes. Draft PR delivery may register skipped checks; hosted runner activation, branch protection and required-check policy need separate owner approval. No secrets or paid resources are provisioned.

ESLint **9.39.5** still emits an unsupported-version maintenance warning. No current audit finding is reported for it; a future compatible supported-toolchain review is appropriate. An unrelated major ESLint upgrade was not included in this focused framework remediation. Other remaining risks include legacy multi-call project persistence transaction limits, process-local quotas/job state, production database foundations, deployment runtime/hosting verification, real data/licensing, commercial provider authorization if requested, and human UAT. Server ZIP upload remains disabled; no claim that a framework update resolves every historical production blocker.

Independent review must check dependency diffs/official disposition, preserved GIS/security assertions, skipped versus passed tests and the pending upgraded-runtime real PostGIS acceptance. No new exploit, full penetration, load or cadastral/scientific accuracy testing was performed.

## Delivery and exact change scope

One focused Draft PR targets R3; no earlier PR is changed or merged. Relevant tracked files are `package.json`, `package-lock.json`, the generated one-line AGENTS.md heading, this report and sanitized evidence under `docs/evidence/remediation-r5/`. Source compatibility changes and new test-framework abstractions were unnecessary. Screenshots, full dependency trees and raw local logs stay outside the repository; no credentials or fixture state are published.

**Technical security remediation: supported by the recorded local checks. Cumulative merge: NO-GO pending independent review and required verification. Production: NO-GO.** Reviewers may reconsider the former Next.js blocker on the new patched candidate; they must not treat that as approval to merge or deploy.

## Draft delivery

Draft [PR #16](https://github.com/HannR002/p4i-webgis/pull/16) targets R3 (`fix/post-audit-r3-ci-security-gates`). The remediation implementation commit is `271c0d9`; later evidence-only delivery updates do not alter tested dependencies. No earlier PR was merged or retargeted. Hosted checks remain separately reported; see [delivery snapshot](evidence/remediation-r5/delivery-status.json). No hosted PASS is claimed.
