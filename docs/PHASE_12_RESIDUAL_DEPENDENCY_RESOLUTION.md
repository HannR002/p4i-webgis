# Phase 12 — Residual dependencies and safe Earth Engine isolation

Date: **16 October 2026 (Asia/Jakarta)**. Repository: `HannR002/p4i-webgis`.
Base: Phase 11 `32dbdbe896f94ca8b14c532611a0c6796e475c59` on
`security/phase11-dependency-remediation`. GitHub PR #7 was rechecked: **open, draft,
unmerged**, targeting `integration/p4i-webgis-phase01-09`; this is the latest published
Phase 11 work, not an assertion of human security approval. The checkout was clean and
remote heads were fetched before branching.

Branch: `security/phase12-gee-dependency-isolation`.
Draft review PR: [#8](https://github.com/HannR002/p4i-webgis/pull/8) → `security/phase11-dependency-remediation`.

## 1. Outcome and separate release decisions

The currently dormant Earth Engine SDK is **no longer an application dependency**.
The SDK and its vulnerable Google authentication/UUID chain are absent from the root
manifest, complete lockfile, clean full install, separate production-only install and
inspected Next.js server/client output. All 35 removed packages were transitively
unneeded after removing the SDK; no retained package version changed. The unavailable
flood service still rejects real execution. No live GIS capability has been silently
disabled: the prior route, service and initializer already rejected it unconditionally.
Historical graph/cache/authentication code is preserved byte-for-byte in a non-runtime
reference, with source commit and hashes.

- **MERGE READINESS — NO-GO for unconditional cumulative merge into main until the
  remaining development-tooling High advisory receives accountable reviewer acceptance
  or a safe upstream fix.** The production dependency blocker from Phase 11 is removed.
  The focused isolation change is ready for normal PR review into the preceding
  remediation branch; this is not a waiver for braces or automatic merge approval.
- **PRODUCTION READINESS — NO-GO.** Data/DB foundation, governed durable compute,
  commercial GEE/LLM authorization, operational/deployment verification and human UAT
  remain pending. Dependency isolation does not satisfy those requirements.

No merge, deployment, visibility change, external database operation, paid provider call,
actual client publication or history rewrite occurred. No credentials were inspected.

## 2. Refreshed evidence

Read the Phase 11 report, triage, final full/production audits, manifest/lockfile,
Earth Engine initializer, flood service and readiness guard before editing. Fresh registry
and public GitHub Advisory API snapshots still report:

| Residual advisory | Affected upstream | Patch / precondition | Phase 12 disposition |
|---|---|---|---|
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), CVE-2026-85393, High | node-forge <=1.4.0 | No fixed release; malformed nested DigestAlgorithm elements accepted in RSA PKCS#1 v1.5 signature verification with low-exponent keys | **FIXED for this application by dependency-path removal**, not fixed upstream. Future adapter reintroduction is blocked pending safe dependencies. |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), CVE-2026-41907, Moderate | uuid <11.1.1, 12.0.0, 13.0.0 | v3/v5/v6 supplied-buffer bounds; fixes 11.1.1 / 12.0.1 / 13.0.1 | **FIXED for this application by dependency-path removal**; no cross-major override. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), CVE-2026-93687, High | braces <=3.0.3 | Recursive AST walkers lack depth guards; deeply nested patterns can exhaust the stack. No upstream fix | **MITIGATED_WITH_RESIDUAL_RISK**, development tooling only; owner/reviewer acceptance pending. Not waived. |

The GitHub advisories do not enumerate function identifiers in their `vulnerable_functions`
field. Inspected braces `lib/compile.js` and `lib/expand.js` recursively call `walk` without
a depth bound. The node-forge advisory describes RSA signature verification; the former
Google chain uses google-p12-pem for PKCS12/private-key parsing, not an observed direct
signature-verification call. The former googleapis-common path invokes `uuid.v4()` without
an external buffer for multipart boundaries. These observations narrowed old reachability
but were not treated as a whole-program exemption. Isolation now removes the actual
installed code path; it is not merely suppression of an audit warning.

Evidence: [advisory dispositions](evidence/phase-12/advisory-dispositions.json),
[upstream metadata](evidence/phase-12/upstream-metadata.json),
[braces path review](evidence/phase-12/braces-path-review.json).

## 3. Architecture decision: approach C

| Approach | Compatibility / maintenance | Install, lock and deployment behavior | Decision |
|---|---|---|---|
| A. Keep SDK, obtain upstream fix | Official SDK 1.7.48 still requires googleapis ^92.0.0. Positional JWT initialization in the old implementation cannot be assumed compatible with modern Google auth majors. | Runtime chain still includes unpatched node-forge; latest SDK alone does not fix it. | Rejected today: no safe upstream chain available. No obsolete downgrade or arbitrary major override. |
| B. Separate installable adapter package/workspace | Could suit a future governed service, but presently adds an unexecutable package and separate maintenance surface. | npm workspaces can participate in root installs/lockfiles by default. A genuinely separate manifest/lock and explicit installation boundary would be needed; moving the dependency to devDependencies alone is insufficient. | Deferred until an authorized real adapter exists. No speculative workspace or second lockfile added. |
| C. Keep domain contract and non-runtime historical reference; main app uses unavailable adapter | Reuses existing flood input/result DTOs and error behavior. Active DEMO/local engines remain unchanged. Old implementation remains inspectable and recoverable for future review. | No SDK install, dynamic import, ambient SDK declaration or bundler externalization. Markdown reference is outside the executable graph. | **Selected**, smallest deployable capability consistent with actual readiness. |
| D. Fork/patch the crypto/auth chain or reimplement GEE transport | Would assume responsibility for crypto correctness, auth compatibility and commercial execution prematurely. | Could hide/fork vulnerable code while leaving unverified behavior; substantial new maintenance. | Rejected for this phase. |

### Main application boundary

- `lib/server/integration/floodProvider.ts` defines `FloodAnalysisProvider` using the existing
  `FloodAnalysisInput` and `FloodAnalysisResult`. It contains no SDK types and introduces no
  second GIS engine or competing dataset/configuration model. `computedBy` remains a trusted
  server identity, **not an execution permit**.
- `lib/server/earthEngine.ts` exports a frozen unavailable provider. `initializeEarthEngine()`
  keeps its synchronous refusal behavior and now returns `never`; callers cannot obtain an
  SDK object. The provider rejects with `ExternalIntegrationPendingError` independently of
  the outer route/service guard. There is no credential reader, authenticator, transport,
  provider selector or environment switch that activates real work.
- `lib/server/floodAnalysis.ts` preserves `analyzeFloodRisk(input, computedBy)` and
  `FloodAnalysisServiceError`. It calls the readiness guard, then the unavailable provider.
  It has no boundary/cache/database access and cannot return a real or fabricated result.
- The existing `/api/gee/flood-analysis` route is unchanged: anonymous access is rejected;
  a valid authorized request gets **503 / status unavailable / private, no-store**. Input,
  identity, role, timeout/error contracts remain in place. Guard relaxation alone still
  cannot activate the unavailable provider.
- The old SDK initialization, flood graph/cache implementation and SDK ambient declarations
  are archived in [`docs/reference/earth-engine-phase11.md`](reference/earth-engine-phase11.md).
  All three source blocks match their Phase 11 bytes/hashes. This is Markdown reference,
  not an npm package, runtime module, new loader or hidden production adapter.
- `types/earthengine.d.ts` is removed from compilation. No fake ambient declaration is used
  to make a missing SDK import appear valid. Config/flood math, NoData helpers, existing
  RasterProvider and controlled-compute contracts remain active and unchanged.

The reference includes experimental thresholds, fixed scale assumptions and obsolete
credential setup for historical engineering context. It is **not scientific validation**, a
ready-to-enable implementation or evidence of successful live Earth Engine operation.

## 4. Dependency graph and deployment verification

Before:

```text
application
└─ @google/earthengine 1.7.43
   └─ googleapis 92.0.0
      ├─ google-auth-library 7.14.1 → gtoken 5.3.2 → google-p12-pem 3.1.4 → node-forge 1.4.0
      └─ googleapis-common 5.1.0 → uuid 8.3.2
```

After:

```text
legacy route → validated domain input → readiness guard → unavailable FloodAnalysisProvider
                                                     └→ ExternalIntegrationPendingError
SDK/Google auth/forge/uuid: absent from application installation and build
historical implementation: Markdown reference only
```

`npm uninstall @google/earthengine` updated the existing manifest and lockfile without
recreating it. **35 packages removed, zero retained-version upgrades/downgrades**, no
`overrides`, no peer/TLS bypass, no feature/test suppression. Next 16.3.8, React 19.2.8,
Vitest 4.1.12, Vite 7.3.6 and Node 22 policy are retained.

| Fresh audit | Critical | High | Moderate | Low | Affected packages |
|---|---:|---:|---:|---:|---:|
| Phase 12 initial full | 0 | 11 | 2 | 0 | 13 |
| Phase 12 final full | 0 | 5 | 0 | 0 | 5 |
| Phase 12 initial production | 0 | 6 | 2 | 0 | 8 |
| Phase 12 final production | 0 | 0 | 0 | 0 | 0 |

Five affected packages represent **one residual advisory**: eslint-config-next →
@next/eslint-plugin-next → fast-glob → micromatch → braces. Audit zero in production
is corroborated by independent evidence, not treated as proof of overall application security:

1. Fresh full `npm ci` and recursive installed-package inspection: **541 packages** examined,
   no GEE/Google auth/forge/uuid package. The complete lockfile also contains none, including
   dev/optional/nested entries.
2. Separate temporary `npm ci --omit=dev` using copies of the same manifest/lock:
   **176 installed packages** examined; no vulnerable GEE chain. This installation never
   uses the main checkout's node_modules and does not alter external infrastructure.
3. A completed Next production build is required by `scripts/qa/phase-12-isolation.mjs`.
   **686 server/static output files and 43 dependency traces** were inspected for SDK/auth
   code markers and traced package paths. No SDK marker/chain or reference Markdown appeared.
   Traces also exclude braces/micromatch/fast-glob. Build caches and host-global tools are
   not presented as deployable application output.
4. The verifier rejects missing builds and injected forbidden manifest dependencies in
   local negative controls. This avoids declaring absence simply because no build exists.

The managed host has an unrelated global `uuid` resolvable from its tooling installation.
It is not in the application's lockfile, recursive local node_modules, production install or
traced output. An initial overly broad resolver assertion detected it; the corrected test
checks the deployable application scope rather than deleting or changing host tooling.
No application import uses that global package. Deploy from the verified manifest/lock/output;
do not copy stale node_modules or old build caches into a release image.

As in Phase 11, npm exits zero while labelling two locked platform-only Sharp WASM artifacts
extraneous on Linux. No missing/invalid dependency edge is present. They are unrelated to
GEE and were not manually removed to suppress diagnostics. Platform verification is Linux x64,
not proof of Hostinger native-module/process compatibility.

See [dependency delta](evidence/phase-12/dependency-delta.json),
[full output isolation](evidence/phase-12/build-isolation.json),
[production install isolation](evidence/phase-12/production-install-isolation.json),
[final tree](evidence/phase-12/final-tree.json) and
[production tree](evidence/phase-12/production-tree.json).

## 5. Remaining braces risk and reviewer action

Latest braces **3.0.3**, micromatch **4.0.8**, fast-glob **3.3.3**, and even Next ESLint
**16.4.2** do not provide a fixed dependency chain. Next's plugin still pins fast-glob 3.3.1;
changing framework versions does not resolve this finding. No unsupported ESLint downgrade,
hand-rolled glob replacement, arbitrary override or removal of lint rules was performed.

The inspected Next plugin uses `settings.next.rootDir` to call `fast-glob.globSync`.
Current checked-in ESLint configuration supplies no such override, so this helper uses
`context.cwd` without running that glob branch. The dependency still exists and tooling
can execute contributor-controlled configuration. There is no observed application HTTP/GIS
input path into these walkers; this does **not** exempt all possible build/CI contexts.
Use reviewed configuration, isolate untrusted PR tooling from secrets and apply runner
resource/time limits. These are limited controls, not a patch or owner-approved waiver.

Required review: the accountable maintainer/security reviewer must assess CI/contributor
trust and decide whether this dev-only residual is acceptable for the development baseline.
No such acceptance is recorded by this work. Recheck upstream before merging; if acceptance
is not granted and no compatible patch exists, keep the cumulative merge on hold. ESLint 9's
upstream deprecation is also maintenance debt; it is not silently upgraded across major versions.

## 6. Regression evidence and limitations

Runtime: **Node 22.23.3 / npm 10.9.9**, consistent with `.node-version` and engines.
Test/build/local-server children use inert loopback Supabase settings and synthetic keys;
GEE credential variables are empty. No private credential files, live database data,
real GEE authentication/analysis or paid LLM operation were used.

| Check | Result |
|---|---|
| Clean full `npm ci`, `npm ls --all` | PASS; optional Sharp diagnostic qualified above |
| Separate `npm ci --omit=dev`, production tree | PASS |
| `npm audit --json` | Exit 1: five affected dev packages / one High advisory |
| `npm audit --omit=dev --json` | **Exit 0: zero reported production vulnerabilities** |
| `npm run lint`, `npm run typecheck` | PASS |
| `npm test` | **269 tests / 39 files PASS** |
| `npm run build` | PASS, Next 16.3.8, App Router and proxy retained |
| SDK/Next output isolation verifier | PASS; complete build required |
| Existing nine browser suites / accessibility | **9 PASS; 39 Axe audits, zero violations** |
| Existing local production API / image checks | **12 API/security + 3 image checks PASS** |
| Local PostgreSQL/PostGIS/PostgREST | **340 PASS**, two fresh synthetic cycles; no external DB |

All 264 prior tests remain. The former SDK-spy test is adapted to verify SDK absence and
initializer refusal; the earlier readiness test checks no external fetch/database call.
Five additional tests cover module-load/initializer/service/direct-provider refusal in both
development and production with DEMO flags, service-guard bypass refusal, actual anonymous
endpoint denial, and complete manifest/lock/application-install chain absence. Credential
getters throw **before reading** a bound value; HTTP/HTTPS/fetch/net entry points throw if
called. These checks assert zero credential reads/network/database effects. The existing
authorized legacy-route test continues to verify a 503 before any computation.

Initial new-test failures were instrumentation issues: proxying Node's special process.env
object did not support Vitest's property descriptors, and require.resolve could see the host's
global uuid. A plain test override target with guarded credential reads and application-scoped
package assertions corrected these without weakening the application security boundary.
Early logs are retained separately from the successful final run.

Existing restricted-project/download entitlement, profile-role authority, AI approval,
NoData, local SHP/GeoJSON, MapRecipe Undo/Redo, DEMO/production separation, review/publication
and export coverage is retained. Browser tests exercise actual local PNG/PDF/JSON/Markdown
downloads and desktop/mobile layouts. No live Supabase login/data, real provider results,
scientific accuracy or human UAT is claimed. Some legacy public DB probes intentionally fail
against the inert configuration; these are not evidence of real data availability. Local
DB rehearsal uses a synthetic foundation, not verified missing production DDL.

## 7. Future real-adapter activation requirements

A future adapter must be a separate explicit reviewed change, not a credentials toggle or
copy/paste of the historical reference:

1. Establish a maintained secure SDK/auth dependency chain, license/commercial registration,
   billing terms, IAM, project identity and approved P4I assets/provenance. Re-run dependency
   triage; the upstream node-forge advisory still exists.
2. Implement the existing provider-neutral RasterProvider/GIS execution contracts and flood
   DTO boundary. Add trusted scoped execution permits, identity/entitlement checks, durable
   job/approval/estimate binding, cancellation, retries and usage accounting before selection.
   `computedBy` alone is insufficient authorization.
3. Validate CRS/scale, CHIRPS period, DEM, WorldCover categories, soil legend, NoData and
   provenance semantics with actual authorized data. Experimental weights/thresholds remain
   labelled experimental. No methodology ranking or formal scientific validation is implied.
4. Isolate server credentials with redacted errors and no browser exposure. Require contract,
   auth denial, failure/no-fallback, resource/cost and authorized staging tests; paid/external
   execution needs separate approval. Do not authenticate simply because credentials exist.
5. If a separate adapter package/service is chosen later, use an explicit deployment/install
   boundary with reviewed manifests/locks. Workspaces/devDependencies or dynamic imports alone
   are not proof the vulnerable chain is absent from a deployed system.
6. Re-run clean install, audits, bundle/trace inspection and complete regression gates; obtain
   human review, human UAT and a separate production release decision.

## 8. Reproduction and delivery

Use the existing Node 22 policy, inert local configuration and committed lockfile. Execute
`npm ci`, `npm ls --all`, both npm audits, lint, typecheck, tests and build. Then:

```bash
P4I_QA_ARTIFACTS=/tmp/p4i-phase12-output node scripts/qa/phase-12-isolation.mjs
# Separate throwaway directory containing only copies of package.json/package-lock.json:
npm ci --omit=dev --prefix /tmp/p4i-phase12-production-install
P4I_QA_ARTIFACTS=/tmp/p4i-phase12-install node scripts/qa/phase-12-isolation.mjs \
  --root /tmp/p4i-phase12-production-install --install-only
```

`--install-only` reports only installation checks and explicitly does not claim build inspection.
The normal verifier fails if completed build output is absent. Existing browser/API commands
and isolation settings are listed in the Phase 11 report; run all nine browser suites,
`phase-09-readiness.mjs` and `phase-11-framework.mjs` against localhost. Use separate artifact
directories and an installed Playwright/Chromium/axe-core toolchain. The database rehearsal
remains `npm run test:db -- --output /tmp/p4i-phase12-db`, local Docker only.

Evidence is indexed in [`docs/evidence/phase-12/README.md`](evidence/phase-12/README.md).
Phase 10/11 historical audit evidence is unchanged. Review this Phase 12 PR into Phase 11
first, then review/incorporate PR #7 into integration, then reassess PR #6 into main only after
residual acceptance and normal review. Keep all prior PRs intact; never force-push or auto-merge.

Production blockers still include missing verified DB foundation and real data, commercial
provider authorization, streaming multipart/archive containment, durable shared jobs/usage/
review/publication/rate limits, deployment/Hostinger verification, backup/recovery and human
P4I UAT. Zero reported runtime dependencies does not establish production readiness or a
complete security assessment.
