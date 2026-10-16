# Phase 11 — Dependency security remediation and merge readiness

Date: **16 October 2026 (Asia/Jakarta)**. Repository: `HannR002/p4i-webgis`.
Base: `integration/p4i-webgis-phase01-09` at
`d1400a2ab363a908d49e468b51786ca5c60ce85b` (fetched and matched to cumulative draft PR #6).
Remediation branch: `security/phase11-dependency-remediation`.
Draft review PR: [#7](https://github.com/HannR002/p4i-webgis/pull/7) → `integration/p4i-webgis-phase01-09`.

## 1. Executive decision

**A. MERGE READINESS: NO-GO for the cumulative Phase 01–11 candidate into main.**
Nineteen of 22 distinct initial advisories are fixed, including all Critical findings,
without removing a feature or a regression test. However, the final production graph
still includes the unpatched High `node-forge` advisory through Earth Engine's legacy
Google authentication chain. Existing execution guards reduce observed exposure;
they are not an independently approved security exception. The development-only
`braces` High finding and production `uuid` Moderate finding also need disposition
by an accountable reviewer. This report supplies technical triage, not a self-approved waiver.

**B. PRODUCTION READINESS: NO-GO.** Dependency remediation alone cannot satisfy the
pending data, verified database foundation, commercial GEE/LLM authorization,
durable persistence/compute governance, deployment verification and human UAT gates.
No deployment, external database migration, real GIS computation, paid AI request,
client publication, merge, visibility change or history rewrite was performed.

The remediation PR is suitable for **review as a security improvement** into the integration
branch. Approval of that limited change is separate from approval of cumulative PR #6
into main. PRs #1–#6 remain intact and unmerged.

## 2. Initial evidence and reproducible inventory

Read the Phase 10 audit, both audit JSONs, dependency and verification summaries,
manifest and lockfile before updates. The initial checkout was clean. Remote heads
were fetched; the integration head and PR #6 were verified before creating the branch.
No user changes were overwritten and no work was based on main.

Fresh Node **22.23.3**, npm **10.9.9** `npm ci` succeeded. Initial `npm ls --all --json`
exited zero. Both `npm audit` commands exited **1 because vulnerabilities were reported**;
this was not an installation failure. The fresh initial counts match Phase 10:

| Scope / stage | Critical | High | Moderate | Low | Affected packages |
|---|---:|---:|---:|---:|---:|
| Phase 10 / Phase 11 initial full | 3 | 15 | 3 | 1 | 22 |
| Phase 11 final full | 0 | 11 | 2 | 0 | 13 |
| Phase 10 / Phase 11 initial production | 1 | 8 | 2 | 1 | 12 |
| Phase 11 final production | 0 | 6 | 2 | 0 | 8 |

These are affected **package** counts, including parent packages propagating a transitive
finding. They are not independent exploitable vulnerabilities. There are **22 unique GHSA
advisories initially; 19 fixed, 3 residual**. `@google/earthengine` itself is reported as
Moderate by npm even though its authentication descendants carry High findings; the
lower parent severity does not dismiss the production blocker.

Evidence: [initial audit](evidence/phase-11/initial-audit.json),
[initial production audit](evidence/phase-11/initial-audit-production.json),
[final audit](evidence/phase-11/final-audit.json),
[final production audit](evidence/phase-11/final-audit-production.json),
[dependency summary](evidence/phase-11/dependency-summary.json),
[initial tree](evidence/phase-11/initial-tree.json),
[final tree](evidence/phase-11/final-tree.json).

## 3. CVE/GHSA triage

The [complete triage matrix](evidence/phase-11/TRIAGE_MATRIX.md) covers every initial
finding, its installed version(s), direct/transitive and production/development status,
introducing chains, severity, affected range, upstream patched versions, actual usage,
compatibility risk and disposition. Machine-readable
[package triage](evidence/phase-11/triage-matrix.json) and
[advisory dispositions](evidence/phase-11/advisory-dispositions.json) preserve npm advisory
source IDs and GitHub GHSA/CVE references. GitHub records without a CVE are explicitly
recorded as such, rather than inventing a reference. Source snapshots were obtained from
the npm registry and public GitHub Advisory API on the report date.

No finding is marked NOT_AFFECTED based only on an absent import. Server/client paths,
optional library features, production graph membership and executed guards were considered.
No exploit or penetration test was performed.

## 4. Controlled changes

| Package / policy | Before | After | Rationale |
|---|---|---|---|
| next | 16.3.5 | **16.3.8** | Stable patch fixes all seven reported Next advisories; retain 16.3 release line instead of unnecessary 16.4 feature update. |
| eslint-config-next / @next/eslint-plugin-next | 16.3.5 | **16.3.8** | Align with framework; inherited braces advisory remains. |
| react / react-dom | 19.2.8 | **19.2.8** | Compatible peer versions retained; no finding requires a change. |
| vitest / @vitest/mocker and siblings | 3.2.4 (some 3.2.7) | **4.1.12** | Maintained V4 tag; fixes mocker traversal and removes tinypool. V3 patch alone cannot fix the reported mocker range. |
| tinypool | 1.1.1 | **absent** | Vitest 4 has its supported replacement worker implementation. No test removal. |
| vite | 7.3.6 transitive | **7.3.6 explicit dev pin** | Keep the previously tested bundler major accepted by Vitest 4. Avoid incidental Vite 8/Rolldown migration. |
| sharp / platform bindings | 0.35.4 | **0.35.5** | Compatible patch; libvips binaries 1.3.3 → 1.3.4. |
| dompurify | 3.4.14 | **3.4.17** | Compatible jsPDF dependency patch. |
| brace-expansion | 1.1.18 / 5.0.9 | **1.1.21 / 5.0.12** | Patch both minimatch dependency chains within their ranges. |
| js-yaml | 4.3.1 | **4.3.2** | Compatible ESLint dependency patch; no major 5 upgrade. |
| source-map-js | 1.2.1 | **1.2.2** | Compatible PostCSS/Tailwind patch. |
| @types/node | 20.19.43 | **22.20.5** | Match supported runtime major. |
| engines / .node-version | absent | **>=22.23.3 <23 / 22.23.3** | Explicit tested Node 22 policy; later security patches within 22 are allowed. |
| @google/earthengine | 1.7.43 | **1.7.43 retained** | Latest 1.7.48 still uses vulnerable googleapis ^92; unrelated SDK update does not solve the blocker. |

Next/Vitest/Node type versions are exact for deliberate updates. Transitive patches remain
within upstream ranges and are reproducible through the committed lockfile. No overrides,
`--force`, `--legacy-peer-deps`, lockfile deletion or TLS bypass were used. No unstable
prerelease was selected. The final resolved std-env version is stable 4.3.0, despite Vitest's
broad dependency range allowing an earlier release candidate.

The [exact lockfile version delta](evidence/phase-11/lockfile-version-changes.json) includes
Vitest's necessary internal helper changes and platform optional entries, not just direct
manifest changes. [Upstream metadata](evidence/phase-11/upstream-metadata.json) records
compatibility constraints and why no Google-chain override was applied.

## 5. Installation and compatibility issues

npm 10.9.9's Arborist peer resolver failed during the Vitest major update with
`Cannot read properties of null (reading 'edgesOut')`, including a lock-only attempt.
Using **npm 11.21.1 once to resolve the existing lockfile** succeeded with normal peer
validation. That initially selected Vite 8; explicitly retaining Vite 7.3.6 avoided an
unnecessary bundler major change. A subsequent ordinary **npm 10.9.9 `npm ci` succeeded**
on the final lockfile. Manifest dependencies, devDependencies and engines match the lock root.
The failed attempts are retained as evidence, not reported as successful checks.

Final `npm ls` and `npm ls --all --json` exit zero with no missing/invalid dependencies.
They do label **two optional platform artifacts** extraneous on this Linux installation:
`@img/sharp-wasm32@0.35.5` and `@emnapi/runtime@1.11.3`. They are locked dependencies
of Sharp's FreeBSD/WebContainers optional packages, which are not selected on Linux.
The native Linux Sharp binary is tested. This reproducible npm platform-tree reporting
quirk is disclosed, not hidden by deleting lock entries or suppressing diagnostics.
The earlier Vite 8 trial had an invalid optional lightningcss edge; it is absent from
the final Vite 7 tree. Only Linux x64 was executed; other platform lock entries are untested.

Vitest 4 ran every existing test without modifying assertions, mocking semantics,
security protections or test discovery. The two added tests verify native image processing
and fail-closed initialization against the actual installed SDK (SDK methods are intercepted
to throw if ever invoked; no authentication or computation is performed).

npm also warns that google-p12-pem, uuid 8 and ESLint 9 are deprecated/unsupported.
The Google packages are included in the residual triage. ESLint 9 has no additional npm
advisory in this snapshot; a coordinated supported ESLint/plugin upgrade is maintenance
follow-up, not a claimed fix for unpatched braces. Monitor upstream security support.
The runtime policy is local verification, **not proof of Hostinger's Node/native-module support**.

## 6. Residual advisories and security boundaries

### UNPATCHED_BLOCKER — node-forge / CVE-2026-85393

`@google/earthengine → googleapis 92 → google-auth-library 7.14.1 → gtoken 5.3.2 →
google-p12-pem 3.1.4 → node-forge 1.4.0` remains in the production graph.
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) affects RSA
PKCS#1 v1.5 signature verification through 1.4.0; **no patched release exists** in the
inspected registry/advisory snapshot. Six affected production packages have High severity.

Reachability is narrower than raw package counts: gtoken loads google-p12-pem for `.p12`/
`.pfx` files; that adapter uses PKCS12 parsing/private-key conversion, whereas this advisory
concerns signature verification. The application's credential contract uses JSON private-key
objects. More strongly, `requireGovernedEarthEngine()` currently always throws before
credential parsing, SDK authentication or initialization, with route/service guards too.
Existing and new tests verify these boundaries. Nevertheless, the SDK is imported server-side
and the vulnerable production dependency is retained; this is **not a whole-program proof
of non-reachability**, nor permission to enable GEE with only credentials.

The official SDK's latest 1.7.48 still declares `googleapis ^92.0.0`. The SDK uses positional
`google.auth.JWT` construction, while modern Google auth/API majors change this contract.
An untested cross-major override could silently break authentication. npm's suggested
Earth Engine downgrade to 0.1.185 is not an acceptable supported fix. No such override or
downgrade was made. Obtain a maintained upstream chain/fix, or a separately reviewed compatible
adapter remedy with offline contract tests and later authorized staging tests. Until then,
retain this blocker; no security exception has been approved.

### MITIGATED_WITH_RESIDUAL_RISK — braces / CVE-2026-93687

The five affected development packages are eslint-config-next, @next/eslint-plugin-next,
fast-glob, micromatch and braces. Latest braces 3.0.3 and micromatch 4.0.8 do not fix
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), a deeply nested
pattern stack-exhaustion DoS. Inspected Next ESLint `get-root-dirs.js` takes patterns from
ESLint `settings.next.rootDir`; the repository has no such override. These are build-tool
inputs, not an observed HTTP-to-glob path. Trusted configuration and bounded tooling runs
reduce exposure. Untrusted contributor/configuration inputs remain a concern. Downgrading
Next ESLint to 14.2.35 is unsafe and was rejected. This is an evidence-based mitigation
statement requiring reviewer acceptance, **not a waiver or a claim that the package is fixed**.

### NEEDS_MANUAL_SECURITY_REVIEW — uuid / CVE-2026-41907

`googleapis-common 5.1.0 → uuid 8.3.2` remains affected by
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
The advisory concerns v3/v5/v6 writes into supplied buffers. Inspected googleapis-common
uses `uuid.v4()` without a supplied buffer for multipart boundaries. This and the GEE guard
limit observed exposure, but are not an asserted global exemption. Patched 11.1.1 is outside
the parent ^8.3.2 range; no arbitrary major override was introduced. Review with the upstream
Google-chain remedy. uuid and the propagated SDK parent retain Moderate audit findings.

## 7. Regression verification

All application checks use Node 22.23.3. Test/build/server child processes override Supabase
with `http://127.0.0.1:9` and synthetic keys; GEE inputs are empty. Real service-account files
or secret values were not accessed. Browser flows use explicitly labeled local DEMO fixtures;
production-mode checks deliberately set DEMO flags and verify refusal.

| Check | Result / scope |
|---|---|
| Initial and final `npm ci` | PASS; final lockfile replayed with npm 10.9.9 |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | **264 tests / 38 files PASS**; all 262 original tests retained |
| `npm run build` | PASS, Next 16.3.8 / Turbopack; App Router routes and proxy emitted |
| Nine existing browser suites | **9 PASS**; [verification summary](evidence/phase-11/verification-summary.json) and suite logs |
| Accessibility | **39 Axe audits, zero violations**; automated coverage only, not human accessibility certification |
| Existing production-mode API/security suite | **12 PASS**; exact results in `production-isolation.json` |
| New production framework checks | **3 PASS**: local image optimization, remote-image rejection, invalid-width rejection |
| Local PostgreSQL/PostGIS/PostgREST rehearsal | **340 checks PASS**, two fresh synthetic cycles; pinned local Docker images, no external DB |
| Final npm audits | Exit 1; residual findings explicitly retained above |

Browser suites cover catalog search/filtering, App Router navigation/hydration, Leaflet,
responsive workspace, layer operations, MapRecipe persistence and Undo/Redo, AOI, raster
NoData/pixel semantics, AHP/configuration, Copilot permissions, compute approval and delivery
revisions. They exercise real local PNG/PDF/JSON/Markdown downloads. Anonymous login and
protected-route redirects are checked; live Supabase sign-in is **not** verified. Public
legacy database list/boundary probes against the inert URL can report expected failures;
those do not demonstrate real data availability.

Regression tests retain Phase 10's revoked-entitlement download-history denial, profile-role
authority, restricted layer/project checks, server authorization, explicit review/publication
grants, AI approval restrictions, NoData validation, bounded SHP/GeoJSON behavior and
production fixture refusal. Database assertions cover Guest, Clients A/B, Analyst, Admin,
forged metadata role, disabled/missing profiles, revocation and protected downloads.
No schema or production API implementation was changed in this phase.

The local database test uses an **explicitly synthetic foundation**, not reconstructed verified
live DDL. Its successful replay does not establish production migration readiness.

## 8. Reproduction and evidence

Use Node selected by `.node-version` and the committed lockfile:

```bash
node --version
npm --version
npm ci
npm ls --all --json
npm audit --json
npm audit --omit=dev --json
npm run lint
npm run typecheck
npm test
npm run build
```

Audit exit 1 is expected while these documented advisories remain. Test/build commands
must use an isolated nonproduction configuration; do not substitute real credentials to
make a failure disappear. Browser QA expects a local DEMO `next dev` on 127.0.0.1:3000
and production refusal checks expect `next start` on 127.0.0.1:3001 from the tested build.
Set `P4I_PLAYWRIGHT_MODULE` to an installed Playwright module, `P4I_CHROMIUM` to Chromium,
and both `P4I_AXE_SCRIPT` / `P4I_AXE_PATH` to axe-core. Run:

```bash
node scripts/qa/phase-01-smoke.mjs
node scripts/qa/phase-01-regression.mjs
node scripts/qa/phase-02-smoke.mjs
node scripts/qa/phase-02-accessibility.mjs
node scripts/qa/phase-03-raster.mjs
node scripts/qa/phase-04-configuration.mjs
node scripts/qa/phase-05-copilot.mjs
node scripts/qa/phase-06-compute.mjs
node scripts/qa/phase-07-deliverables.mjs
node scripts/qa/phase-09-readiness.mjs
node scripts/qa/phase-11-framework.mjs
npm run test:db -- --output /tmp/p4i-phase11-db
```

Use a separate `P4I_QA_ARTIFACTS` directory per suite. The DB command accepts only its
local isolated Docker rehearsal, not an external database URL. Evidence is under
[`docs/evidence/phase-11`](evidence/phase-11/README.md); historical Phase 10 artifacts are
unchanged. Warnings about the Node environment proxy are tool-environment diagnostics,
not bypassed TLS checks.

## 9. Production blockers preserved

- Verified foundational DDL, ownership, auth triggers/grants and actual isolated staging
  validation remain pending; synthetic local rehearsal does not authorize Supabase replay.
- P4I boundaries/soil, provenance, licensing, commercial GEE registration/billing/IAM and
  governed adapter are pending. Real LLM provider selection/credentials/cost authorization
  are pending. External-provider failure must continue to fail closed.
- Multipart upload is still parsed before complete byte/archive containment; bounded input
  validators do not make streaming ZIP/SHP resource containment complete.
- Jobs, approval state, usage/rate limits, review/publication evidence and cancellation/recovery
  need durable shared persistence; process-local limits are not distributed abuse controls.
- Hostinger Node/native dependencies, process lifecycle, memory, networking and deployment
  behavior have not been verified. Do not infer production support from a successful build.
- Human Yayasan P4I UAT, professional deliverable review, data rights/privacy and operational
  monitoring/backup/recovery acceptance remain pending. No scientific methodology validation
  or method ranking was introduced.

## 10. Review and incorporation sequence

1. Review the focused remediation PR into `integration/p4i-webgis-phase01-09`: manifest/lock
   delta, runtime policy, two compatibility tests, three local framework checks and evidence.
2. Review all three residual advisory dispositions, especially the High production chain.
   Obtain a safe upstream fix or an explicit accountable security decision; none exists here.
3. Only after normal review, maintainers may incorporate this remediation into integration.
   This updates the candidate carried by PR #6 through its existing head branch; do not
   retarget, close or merge the stacked PRs automatically.
4. Rerun fresh audits and relevant regression checks on the reviewed final integration head.
   Reconsider PR #6 into main only after remaining blockers and code review are satisfied.
5. Treat any future production release as a separate decision with all section 9 gates.

No automatic merge is recommended or performed. This phase improves the candidate but does
not claim the application is secure merely because some audit categories reached zero.
