# R7.1 — Independent security and preview release review

Review date: **31 October 2026 (Asia/Jakarta)**. Repository: `HannR002/p4i-webgis`. Review target: Draft [PR #18](https://github.com/HannR002/p4i-webgis/pull/18).

**Preview: NO-GO for release now. Production: NO-GO.** The synthetic application passed the reviewed local security and browser boundaries. Release remains blocked by the current full dependency gate, absent preview configuration, and unverified Vercel system-variable exposure and actual build/function patch versions. This report is preparation, not deployment authorization or PR approval. No live deployment or preview URL exists in the observed project.

## 1. Exact revisions and scope

| Item | Verified value |
| --- | --- |
| Original source reviewed | `180b8669bee37c8119f43f53cd1c2b94dcfb6307` |
| PR #18 head branch | `feat/r7-academic-preview-deployment-readiness` |
| Base branch | `fix/post-audit-r6-integration-gate-hardening` |
| Base SHA | `8adbe5498dbea1f2946df94e96ca3bef52b0d6ad` |
| Verified source candidate after the focused fix | **`656813ed0325d2cfd85d603824e8434aac0ac90b`** |
| Focused source change | `package.json`: generate Next route types before standalone typecheck |

The original head matched the supplied SHA. The review inspected the complete 47-file PR inventory, every executable source/configuration change, the API inventory against the actual route tree, provider selection and downstream transports, and the proposed SQL as text. The only source fix is one script change; application/security behavior and the lockfile are unchanged. The source candidate above is the exact checkout reserved for a possible later manual preview. Documentation/evidence commits that follow it are not substituted for this SHA without recording the new candidate.

The controlled two-worker baseline ran against the original source. Default/concurrency/focused application reruns, fresh typecheck, and the final build ran with the focused fix. Browser exports exercised the unchanged application source; the final candidate also passed the expanded HTTP probes and induced UI network-failure test.

No merge, production deployment, external deployment, SQL execution/migration, Supabase query or mutation, Docker fixture, external AI activation, GitHub Actions activation, Corporate Hub change, protection change, or approval of PR #18 occurred.

## 2. Findings and reproduced evidence

| ID | Severity / status | Evidence and implication |
| --- | --- | --- |
| R7.1-01 | **Moderate; OPEN; dependency release gate fails** | Current `npm audit --json` reports **16 moderate affected-package entries from one minimatch advisory**, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), potential DoS through globparts amplification, affected range `<11.0.1`. The affected graph is development lint tooling. Production audit reports **0**. The actual `scripts/ci/dependency-audit.mjs` exits **1**. This supersedes R7's historical zero-finding full audit. PR #18 did not change the lockfile; no preview HTTP path to this lint operation was found. No exploit was executed. Compatible remediation remains outstanding; no advisory waiver or forced major update was added. |
| R7.1-02 | **Low; FIXED in source candidate** | Fresh checkout + `npm ci` + `npm run typecheck` fails with `app/layout.tsx(10,50): TS2304 Cannot find name 'LayoutProps'`. `next-env.d.ts` and `.next/types` are generated/ignored. After build, the old script passes, showing order dependence. This is inherited from the base, newly reproduced in this review. The fix changes `tsc --noEmit` to `next typegen && tsc --noEmit`, following bundled Next 16.4.3 documentation. A separate fresh worktree with no generated types passes. No workflow lock was removed. |
| R7.1-03 | **Release blocker; configuration/verification gap** | Read-only Vercel tools report no configured project env entries and no deployments. Required academic configuration is therefore not established. The connector does not return the system-variable exposure checkbox, complete build/root settings, shared-env attachments, or actual function runtime. Documentation establishes availability, not observed injection. These must be checked before/at a separately authorized first preview build. |
| R7.1-04 | **High if connected; reported inherited production blocker, UNVERIFIED** | Earlier reports describe unrestricted SELECT policies on `spatial_projects`, `vector_layers`, and `analysis_reports`. This review performed no Supabase operation and neither confirms nor remediates those policies. The academic provider avoids that database. Passing synthetic tests does not certify RLS, grants, views, privileged functions, storage, or real identities. |

**No new exploitable preview route/provider bypass was reproduced.** This is bounded evidence for the current source, reviewed configuration, and tested Next version, not a general platform security certification.

Reproduce R7.1-01 from the pinned checkout with `npm ci`, `npm audit --json`, `npm audit --omit=dev --json`, and `node scripts/ci/dependency-audit.mjs`. Preserve the nonzero full-gate exit. Reproduce R7.1-02 in a fresh worktree at the original SHA before `next build` or `next typegen`; repeat at the candidate SHA to verify the fix. Do not delete another person's generated files to simulate freshness.

Evidence: [platform observation](evidence/r7-1/platform-observation.json), [full audit](evidence/r7-1/audit-full.json), [production audit](evidence/r7-1/audit-production.json), [dependency gate](evidence/r7-1/dependency-gate.log), [initial typecheck](evidence/r7-1/typecheck.log), [fresh fixed typecheck](evidence/r7-1/typecheck-fresh-fixed.log).

## 3. Security boundary and route coverage

`lib/academicPreview.ts` treats unset/exact `false` as disabled, exact `true` plus the full contract as active, and other flag spellings as invalid. Invalid requested mode receives 503 before route execution. Exact `false` restores normal application behavior: it is an adapter off switch, not a promise that all normal routes return 503. The deployment preflight refuses disabled mode as well as invalid mode.

The proxy checks server environment only. Query strings, bearer/cookie identities, forwarded headers, and Vercel-looking request headers do not set it. Complete operator-controlled environment spoofing can make a local server active, and an unrelated syntactically valid `.vercel.app` hostname passes when the other fields match. These variables are configuration assertions, **not cryptographic Vercel attestation**. Deployment account/project inspection remains necessary.

All 27 actual API route modules were reconciled with `docs/r7/route-inventory.json`. The allowed surface is:

| Route | Allowed methods / final boundary |
| --- | --- |
| `/api/academic/status` | GET; capability/runtime metadata |
| `/api/auth/session` | GET; always unauthenticated; no user/profile resolution |
| `/api/gis/catalog` | GET; guest context, no entitlements, public `demo-` fixtures only |
| `/api/gis/vector/demo-*` | GET; regex then exact catalog membership and fixture provider |
| `/api/gis/tiles/demo-*/z/x/y` | GET; numeric tile bounds, exact catalog, validated band/palette/range |
| `/api/gis/actions` | POST; validated session MapRecipe/actions; no backend persistence |
| `/api/gis/pixel` | POST; public synthetic raster operands and bounded validated sampling |
| `/api/gis/process` | POST; bounded local fixture operations, no external SQL/compute transport |
| `/api/gis/copilot` | GET/POST; deterministic planner and reviewed read/map-session tools |

The other **18 route modules** are denied in academic mode: all admin, boundaries, projects/list/project layers, downloads, leads, onboarding, auth mutations, legacy AI recommendation, GEE, consulting/download, vector storage/analysis, and compute. The probe exercises GET, HEAD, POST, PUT, PATCH, DELETE, and OPTIONS where disallowed, including unsupported verbs on the safe routes. Direct sensitive calls receive 503; arbitrary `demo-*` IDs still fail catalog validation. Page access is limited to the seven spatial preview pages and the limitations page, with landing redirects. The separate asset exceptions do not create an application API route.

Provider tracing found:

- GIS selection prioritizes the academic contract; its adapter clones public `demo-` definitions and permits only exact fixture IDs. Raster selection wraps that provider; processing operates on bounded fixture grids and synthetic AOIs.
- Auth identity resolution returns null before the cached/provider path. GIS context returns guest and no project entitlements regardless of bearer/cookies. Database repository selection and the service-client constructor throw before cached repositories or Supabase client construction.
- AI selection chooses only the controlled deterministic provider in active mode and null in invalid mode. Copilot parses plans before execution and rejects backend/compute/publication tools. The legacy planner remains gated by development DEMO; Gemini independently refuses production. GEE's existing endpoint is blocked.
- Auth/browser factories still exist for normal application use. Their server entry is bypassed by the guest guard; the login page is unavailable and public Supabase settings must be absent. They are not an independent permission to connect a backend.
- Local vector/PostGIS factories require development mode and loopback opt-in; production and academic routes cannot activate them. No server actions, application rewrites to another backend, or configured remote-image hosts were found. CLI boundary-import/SQL proposal files are operator tools, not exposed preview APIs; none was executed with data or execution flags.

The [expanded probe](evidence/r7-1/security-review.mjs) passed **206 HTTP checks and 38 environment/preflight checks**. It covers malformed flags, absent/spoofed identity/provider fields, dummy forbidden credentials, invalid/missing preflight identity fields, forged cookies/roles, middleware-subrequest/rewrite headers, RSC/prefetch headers, encoded paths, traversal, trailing-slash normalization, private dataset requests, malformed JSON and palette injection. Normalization redirects were recorded distinctly from 503 denials. Original academic unit tests also mock fetch to throw and verify no provider call.

Separate runtime checks confirmed invalid identity returns 503 for pages/status/catalog/auth/projects even with matching request headers. Normal production refuses development compute/vector/consulting paths and cannot be switched by request flags. Image optimizer requests to an unconfigured remote backend URL are rejected with 400, and its local private-API request receives 503. The final candidate's expanded probe and UI failure check ran with non-loopback server fetch interception: **zero outbound fetch attempts** were recorded. This instrumentation covers fetch-based transports; source inspection supplies the remaining current transport analysis, not packet-level proof for arbitrary future dependencies.

Evidence: [HTTP/flag results](evidence/r7-1/security-review.json), [runtime boundaries](evidence/r7-1/runtime-boundary.json), [outbound guard log](evidence/r7-1/server-outbound.jsonl), [observed tile headers](evidence/r7-1/tile-headers.txt). Tile responses retained `private, no-store` and `noindex, nofollow` in the actual response.

## 4. Build/runtime contract and environment configuration

Observed Vercel project: `p4i-webgis`, `prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb`, team `farhan-dd58` / `team_FjboY4JHoWxq0U3C6artFavI`, Next.js, **project default Node 24.x**, `live=false`, no domains, `latestDeployment=null`; deployment listing is empty. Management access was verified through read-only connected tools. No account credentials were requested, printed, pulled, or installed into the application.

The package requires **Node >=22.23.3 <23**. Vercel documents package engines overriding project Node settings. Vercel CLI **65.9.0** build-utils actually resolved this range with a `24.x` fallback to **`22.x` / `nodejs22.x`**; the override warning/result are retained. Thus the current project default alone does not force this package onto 24.x. Aligning the project setting to 22.x during a separately authorized release would make intent explicit; it was not changed here.

Vercel selects a major and rolls minor/patch updates; build and function patches may differ. The actual available Vercel build/runtime patches are **UNVERIFIED**. Both must satisfy the source guard. Actual local Node 24.19.0 preflight exits 1, and Node 22.23.3 passes. Do not relax the minimum to make an unverified platform build pass.

`academic-preflight.mjs` imports only `lib/academicPreview.ts`, whose types are erasable. An actual standalone Node **22.23.3** run succeeds without tsx/ts-node or experimental flags. The harmless `MODULE_TYPELESS_PACKAGE_JSON` warning is retained. The script is run before Next in `vercel.json`; it does not depend on Next-generated types, request cookies, or post-build output. Missing configuration or identity exits 1. A remote build is compatible **if** the documented system variables are exposed and the required runtime is supplied; this has not been observed in a Vercel build.

Configure the following nonsecret values for the **Preview environment at both build and runtime**:

| Variable | Required value |
| --- | --- |
| `P4I_ACADEMIC_PREVIEW` | `true` |
| `P4I_PREVIEW_ID` | `p4i-webgis-academic-v1` |
| `AI_PROVIDER` | `academic-demo` |
| `VECTOR_STORAGE_MODE` | `disabled` |
| `GEMINI_FREE_ENABLED` | `false` |
| `GIS_DEMO_MODE` | `false` recommended explicitly; exact `true` is rejected |

Required Vercel-provided values, all documented as available **at build and runtime when system-variable access is enabled**:

| Variable | Required contract |
| --- | --- |
| `VERCEL` | `1` |
| `VERCEL_ENV` | `preview` |
| `VERCEL_PROJECT_ID` | `prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb` |
| `VERCEL_URL` | Generated lowercase hostname matching `^[a-z0-9-]+\.vercel\.app$`, without scheme |

`NODE_ENV` is production for the optimized preview application. `VERCEL_GIT_COMMIT_SHA` is optional status/provenance metadata, not an activation gate; a missing value produces null. Do not manually fabricate system identity fields for a remote release. Locally emulating them is only a test.

Keep these absent/empty: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEE_PROJECT_ID`, `GEE_SOIL_ASSET_ID`, `GEE_SERVICE_ACCOUNT_JSON`, `GEE_SERVICE_ACCOUNT_JSON_BASE64`, `DATABASE_URL`, `SUPABASE_DB_URL`, `VECTOR_STORAGE_LOCAL_URL`, `VECTOR_STORAGE_LOCAL_ACK`. Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` absent; the only tolerated test placeholders are `http://127.0.0.1:9` and `local-test-only`. No auth/database provider configuration is needed: their default Supabase selectors remain behind refusal guards. Do not attach integrations or copy a development `.env.local` into the deployment.

The connector's empty project-env list does **not** prove that system injection is enabled or that every shared/integration attachment is absent. Inspect **Enable access to System Environment Variables**, shared and branch-specific overrides, integrations, root/build settings, and project-level routing in the existing project. Confirm nonsecret presence and expected identity in actual build logs and protected runtime; never dump environment contents. Until then task 7's actual-platform portion remains unverified.

## 5. Verification results and reproduction

Local commands used an isolated worktree and a whitelist-based child environment. Inherited Supabase/GEE credential bindings were excluded from application installation, builds, tests, and servers. No local `.env` files were copied. Node 22.23.3, Next 16.4.3, React 19.2.8, Vitest 4.1.12 and Chromium were used. npm installation/audit used the configured network proxy; no provider credentials were needed.

| Check | Actual outcome |
| --- | --- |
| `npm ci` | PASS; lockfile unchanged; reports current dev advisory |
| `npm run lint` | PASS, 0 errors; 1 pre-existing R7 unused `describe` warning |
| Original standalone `npm run typecheck` | FAIL before generation; PASS after build |
| Fixed `npm run typecheck` in fresh worktree | PASS |
| `npm test -- --maxWorkers=2` | **596 PASS, 37 SKIPPED, 0 failed**; 52 test files pass, 2 skip |
| `npm test` and `npm test -- --maxWorkers=16` | Both **596 PASS, 37 SKIPPED, 0 failed** |
| Five focused `npm test -- tests/computeRoutes.test.ts` runs | 4/4 pass each |
| `npm run test:ci` | **52 PASS**, 0 fail |
| Preflight then `npm run build`, original and candidate | PASS; optimized production build; proxy and status route emitted; status is dynamic |
| Full / production audits | **16 moderate / 0**; full gate FAIL, production gate PASS |
| R7 boundary browser suite | PASS; 22 original HTTP checks; limitations widths 1480/390/320 |
| Vector editor browser suite | PASS; actual drawing/editing, drafts, Undo/Redo, planner, exports; widths 1480/768/390/320 |
| Raster browser suite | PASS; sampling/NoData, band metadata, categorical refusal, native statistics, subset descriptor, divide-by-zero masking, exports; desktop/mobile |
| Independent candidate security and failure probes | PASS; 206 HTTP + 38 config/preflight checks; aborted Copilot request preserves recipe; no uncaught page errors |
| Vercel build/function deployment/protection smoke test | **NOT RUN**; external deployment excluded |
| Real PostGIS/Supabase/advisors | **SKIPPED / NOT RUN**, never PASS |

Reproduce local academic checks from the pinned source, using an already installed approved Node 22.23.3+ within major 22. Start with a clean child environment to exclude inherited credentials; the following is local simulation only:

```bash
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 \
  NODE_ENV=production P4I_ACADEMIC_PREVIEW=true \
  P4I_PREVIEW_ID=p4i-webgis-academic-v1 \
  VERCEL=1 VERCEL_ENV=preview \
  VERCEL_PROJECT_ID=prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb \
  VERCEL_URL=local-review.vercel.app GIS_DEMO_MODE=false \
  AI_PROVIDER=academic-demo VECTOR_STORAGE_MODE=disabled GEMINI_FREE_ENABLED=false \
  sh -c 'node scripts/deployment/academic-preflight.mjs && npm run build'
```

Use the same local-only environment for `npm start -- --hostname 127.0.0.1 --port 3100` and the retained `node docs/evidence/r7-1/security-review.mjs`. That evidence script is stored in the documentation descendant of the source candidate and writes `.ci-results/r7-1/`; its application target remains the pinned source. Run `scripts/qa/r7-academic-preview.mjs` and `scripts/qa/phase-13-vector-editor.mjs` with `P4I_QA_BASE_URL=http://127.0.0.1:3100`, an installed `P4I_PLAYWRIGHT_MODULE`, `P4I_AXE_SCRIPT`, and an artifact directory. The raster harness was copied to scratch with its hardcoded localhost:3000 origin changed to 127.0.0.1:3100; assertions and application responses were unchanged. UI failure injection aborted only a local browser Copilot request. No successful API response was mocked for the acceptance/export flows.

An exploratory `npm run import:boundaries` invocation without arguments exited 1 at required-input validation. This is a data-import CLI, not an import-boundary linter; no input or execute flag was supplied and no data/provider operation occurred.

## 6. Earlier timeout: evidence and limits

R7 retained one 5000ms timeout in `computeRoutes.test.ts`, “sets opaque HttpOnly session and requires same actor, human origin and exact ceiling.” Its retained focused reproduction passed in 185ms. This review observed:

- Two-worker full run: 596 pass; total 10.99s.
- Default full run: 596 pass; wall 13.239s; compute file 127ms.
- Sixteen-worker full run on a cgroup with a two-CPU quota and 8GiB limit: 596 pass; wall 10.165s; compute file 825ms.
- Five focused processes: all pass; wall 1.215–1.289s each including startup.

Cgroup CPU-stat snapshots and raw logs are retained. Increased concurrency measurably increases compute-test time, but the historical timeout **was not reproduced**, including under the higher-worker run. These observations do not establish its original cause. Resource contention remains plausible; a deterministic application reliability defect and a definitive contention diagnosis are both unproven. No timeout was increased and no test was skipped to obtain a pass. The compute endpoint is independently unavailable in the academic preview.

## 7. Exports, responsive UI and failure handling

The browser downloaded a real 7-feature GeoJSON FeatureCollection, vector/raster PNGs and two real PDFs. PNG signatures, 1802×1450 export dimensions, PDF headers/EOF, PDF extracted provenance text, and GeoJSON content were checked; hashes/byte counts are retained. The exported PNG was visually inspected and shows drawn geometries, legend and **DATA DEMO · SINTETIK** labeling. PDFs contain the explicit DEMO/provisional-methodology warning and “not a scientifically validated result”; local vectors are described as user-supplied or explicitly synthetic, not official boundaries. Each PDF is about 7.86MB and generated/downloaded in the browser, without a server upload.

Desktop/tablet/mobile checks found no horizontal overflow or scoped axe WCAG A/AA violations; no uncaught page errors occurred. These are automated checks, not full human accessibility/UAT certification. Browser drafts are explicitly local. Unknown/private IDs and malformed input fail; internal/outside NoData and unsupported categorical interpolation are displayed accurately. A locally aborted Copilot POST displays failure and leaves the exported recipe unchanged.

GeoTIFF creation, official scientific validity, authoritative measurements, real persistence and backend compute are not verified capabilities. Clip returns a subset descriptor with no GeoTIFF artifact. External basemap availability and cross-origin capture are not certified; exports used no basemap. GeoJSON user content is not intrinsically synthetic: users must supply public/synthetic input. Preview protection cannot prevent a user from entering confidential data, saving it in local browser storage, or sharing an exported file.

## 8. Safe manual preview procedure — prepared, NOT EXECUTED

Vercel's current Git configuration documentation confirms **`git.deploymentEnabled=false` disables automatic Git deployments for all branches**. It does not block explicitly requested CLI/API deployment. The candidate retains it, and Actions jobs retain `false &&` locks. No push/PR creation is treated as permission to deploy. The setting is verified in this candidate; account Git linkage/other branch configurations are not exposed by the connector and should also be inspected.

Before a separately authorized release:

1. Resolve the failing full dependency gate without hiding it. Reverify the exact resulting source if remediation changes it. Complete project/root/routing/shared-env checks and configure only the reviewed Preview values above. Enable/verify system-variable access while preserving protection; align Node major to 22.x if approved. Confirm actual minor/patch during the build and again in runtime. Never replace missing remote system variables with local simulation values.
2. Use a fresh detached, clean checkout of **`656813ed0325d2cfd85d603824e8434aac0ac90b`**, or record and reverify a successor if an open blocker required changes. Exclude local `.env*`, credentials, build output and `.vercel` secret material from upload. Inspect the source upload/dry-run and existing target. Authenticate through the already connected account; do not request/publish tokens.
3. The concrete manual source-upload mechanism below uses CLI 65.9.0's verified help flags. It performs a **remote Preview build**, so Vercel supplies real deployment identity. It is a future release action and was not run here:

```bash
candidate=656813ed0325d2cfd85d603824e8434aac0ac90b
test "$(git rev-parse HEAD)" = "$candidate"
test -z "$(git status --porcelain)"
npx vercel@65.9.0 project inspect p4i-webgis --scope farhan-dd58 --non-interactive
# Confirm returned project ID/team and reviewed settings before continuing.
npx vercel@65.9.0 deploy . \
  --project prj_h1FFQnXyMpUL2qg0Hw77PBWSp3Hb \
  --scope farhan-dd58 --environment preview --non-interactive \
  --meta reviewCandidateSha="$candidate"
```

The deployment relies on reviewed Preview-scoped project configuration at both phases; the project currently has no such entries. `--env` and `--build-env` are separate CLI flags if a later approved procedure deliberately uses deployment overrides. Do not add production, promotion, temporary/public deployment, protection-verification secret creation, or project-creation options. Avoid `--prebuilt` for this first candidate: Vercel documents missing build-time system variables for that path, and a locally forged URL/identity cannot substitute for the real contract.

4. Inspect the returned deployment's project, target, source/git/upload provenance and metadata, build command/preflight result and actual build Node version. The user-supplied review metadata alone is not cryptographic source attestation. Confirm uploaded source is the clean checkout. Fetch protected `/api/academic/status` and verify actual runtime >=22.23.3 <23, enabled/synthetic/guest/database-unavailable/externalAI-false; reconcile sourceRevision with the deployment's source provenance. CLI deployments may lack `VERCEL_GIT_COMMIT_SHA`; null requires checking actual deployment provenance, not inventing that variable.
5. Verify anonymous protection denial and authorized supervisor access, then repeat API denial and export smoke tests on the immutable protected deployment. No production alias or domain promotion. This future hosted evidence must be labeled separately from this local report.

No fallback deployment exists. For a failed first attempt, keep it unpromoted and preserve logs; any retirement/deletion requires the corresponding authorized operation. Do not invent a known-good production rollback or restore unrestricted SQL policies.

## 9. Supervisor access with protection retained

Actual project metadata reports Vercel Authentication/SSO protection enabled for **`all_except_custom_domains`**; password and trusted-IP protection are off, and no custom domains are present. This configuration covers a generated preview hostname. No live endpoint exists to test enforcement, bypasses, or a supervisor's account access.

Preferred controlled procedure after an approved preview exists: send the immutable preview URL through an explicitly authorized private channel. The supervisor signs in to Vercel and requests access if needed. The owner verifies the requesting account and approves the deployment/branch access request using the Share modal or Deployment Protection Requests page. Test sign-out/anonymous denial and supervisor sign-in access; revoke the grant after review. Current Vercel documentation describes access requests as branch-scoped access to the latest deployment, so later deployments on that branch also require scope awareness. Eligibility/external-user quota and the supervisor's actual identity/access remain unverified; no invitation or message was sent.

A revocable Shareable Link is a documented alternative, but it is a bearer capability that can be forwarded. It is less identity-specific and was not generated. Never put it in public docs/PRs, bundle an automation bypass secret into the client, add a protection exception, or disable protection. Automated future checks can use an authorized protected-access tool/`vercel curl`; this does not grant the human supervisor access. No automation bypass secret was generated in this review.

## 10. Verified boundary, open gates and final decisions

**Verified locally:** original source identity, reviewed API/provider isolation, malformed/config/header/cookie/direct-request refusals, guest-only fixture catalog, deterministic map edits, local drafts/exports, responsive/error behavior, Node22 preflight/type-stripping compatibility, Vercel major-version selection, clean typecheck fix, application/helper tests, current audit failure, and the all-branch Git auto-deploy setting in source. Read-only management access, project identity/protection settings, empty project env listing and absence of deployments were observed remotely.

**Unverified:** actual Vercel system-variable setting/injection, shared-env and routing/build/root settings, Vercel build and function patch versions, hosted output and enforcement, source attestation from a real deployment, supervisor account/quota/access, hosted regressions, live Supabase schema/RLS/advisors/Auth/storage, and real PostGIS execution. All 37 opt-in database cases remain **SKIPPED**, not PASS. No database fixture was authorized or started.

**Preview decision: NO-GO now.** Source-level synthetic isolation passed the tested boundaries, but R7.1-01 and the missing/unverified deployment configuration gates remain open. A later deployment must be separately authorized and identify the exact reverified SHA. Reserved source candidate: **`656813ed0325d2cfd85d603824e8434aac0ac90b`**. This review stops before that external action.

**Production decision: NO-GO separately.** The academic adapter deliberately rejects `VERCEL_ENV=production`; normal application/backend authorization, reported RLS exposure, durable persistence/jobs, migrations, backup/restore, real identities/providers and operational readiness have not been certified. Academic preview evidence supplies no production approval.

Official sources consulted: [system variables](https://vercel.com/docs/environment-variables/system-environment-variables), [Node versions and engine precedence](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration), [CLI deploy/prebuilt limitations](https://vercel.com/docs/cli/deploy), [Vercel Authentication/access requests](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [Shareable Links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links), and installed Next 16.4.3 CLI/typegen and proxy documentation. Local logs retain executor timestamps; they are not evidence of hosted execution.
