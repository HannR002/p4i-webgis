# Phase 11 vulnerability triage matrix

Generated from the 16 October 2026 initial/final npm audit, lockfiles, dependency trees and GitHub Advisory API. Package counts include affected parent packages; they are not unique advisory counts. Full chains and reachability/compatibility notes are in [triage-matrix.json](triage-matrix.json). No NOT_AFFECTED exemption or security waiver is asserted.

## Advisory dispositions

| Advisory / CVE | Package | npm severity | Initial vulnerable range(s) | Upstream patched version(s) | Disposition |
|---|---|---|---|---|---|
| [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) / CVE-2026-84375 | js-yaml | high | >=4.0.0 <4.3.2 | 3.15.2, 4.3.2 | FIXED |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) / CVE-2026-94486 | next | low | >=16.0.0 <16.3.8 | 16.3.8 | FIXED |
| [GHSA-3w37-wq28-93x7](https://github.com/advisories/GHSA-3w37-wq28-93x7) / CVE-2026-94544 | next | moderate | >=16.3.0 <16.3.8 | 16.3.8 | FIXED |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) / CVE-2026-94543 | next | moderate | >=16.0.0 <16.3.8 | 15.5.27, 16.3.8 | FIXED |
| [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) / CVE-2026-104848 | tinypool | critical | <=2.1.0 | 2.1.1 | FIXED |
| [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) / CVE-2026-47429 | vitest | critical | <3.2.6 | 3.2.6, 4.1.0 | FIXED |
| [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) / not assigned in GitHub record | dompurify | low | <=3.4.15 | 3.4.16 | FIXED |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) / CVE-2026-93749 | source-map-js | high | >=1.0.0 <1.2.2 | 1.2.2 | FIXED |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) / CVE-2026-102276 | brace-expansion | high | <1.1.19, >=4.0.0 <5.0.10 | 1.1.19, 2.1.5, 3.0.7, 5.0.10 | FIXED |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) / CVE-2026-84373 | @vitest/mocker, vitest | moderate | >=2.1.0 <4.1.11 | 4.1.11, 5.0.0-rc.2 | FIXED |
| [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) / CVE-2026-104849 | tinypool | critical | <2.1.2 | 2.1.2 | FIXED |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) / CVE-2026-85393 | node-forge | high | <=1.4.0 | none | UNPATCHED_BLOCKER |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) / CVE-2026-94483 | next | high | >=16.0.0 <16.3.8 | 16.3.8 | FIXED |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) / CVE-2026-94485 | next | moderate | >=16.0.0 <16.3.8 | 16.3.8 | FIXED |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) / CVE-2026-94484 | next | moderate | >=16.0.0 <16.3.8 | 15.5.27, 16.3.8 | FIXED |
| [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p) / not assigned in GitHub record | dompurify | low | >=3.4.13 <=3.4.15 | 3.4.16 | FIXED |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) / CVE-2026-102277 | brace-expansion | moderate | <1.1.21, >=4.0.0 <5.0.12 | 1.1.21, 2.1.7, 3.0.9, 5.0.12 | FIXED |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) / CVE-2026-102278 | brace-expansion | high | <1.1.20, >=4.0.0 <5.0.11 | 1.1.20, 2.1.6, 3.0.8, 5.0.11 | FIXED |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) / not assigned in GitHub record | next | critical | >=16.2.0 <16.3.6 | 16.3.6 | FIXED |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) / CVE-2026-93687 | braces | high | <=3.0.3 | none | MITIGATED_WITH_RESIDUAL_RISK |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) / CVE-2026-41907 | uuid | moderate | <11.1.1 | 11.1.1, 12.0.1, 13.0.1 | NEEDS_MANUAL_SECURITY_REVIEW |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) / not assigned in GitHub record | sharp | high | <0.35.5 | 0.35.5 | FIXED |

GitHub and npm snapshots can report different severity/reference details. The JSON preserves both; no CVE is inferred from a title when the GitHub API has none. Patched versions above include parallel upstream release lines; the lockfile determines the actual selected remedy.

## Affected package inventory

| Package | Before → after | Direct/transitive | Scope | Severity | Disposition |
|---|---|---|---|---|---|
| @google/earthengine | 1.7.43 → 1.7.43 | direct | production (possibly also tooling) | moderate | UNPATCHED_BLOCKER |
| @next/eslint-plugin-next | 16.3.5 → 16.3.8 | transitive | development | high | MITIGATED_WITH_RESIDUAL_RISK |
| @vitest/mocker | 3.2.4 → 4.1.12 | transitive | development | moderate | FIXED |
| brace-expansion | 1.1.18, 5.0.9 → 1.1.21, 5.0.12 | transitive | development | high | FIXED |
| braces | 3.0.3 → 3.0.3 | transitive | development | high | MITIGATED_WITH_RESIDUAL_RISK |
| dompurify | 3.4.14 → 3.4.17 | transitive | production (possibly also tooling) | low | FIXED |
| eslint-config-next | 16.3.5 → 16.3.8 | direct | development | high | MITIGATED_WITH_RESIDUAL_RISK |
| fast-glob | 3.3.1 → 3.3.1 | transitive | development | high | MITIGATED_WITH_RESIDUAL_RISK |
| google-auth-library | 7.14.1 → 7.14.1 | transitive | production (possibly also tooling) | high | UNPATCHED_BLOCKER |
| google-p12-pem | 3.1.4 → 3.1.4 | transitive | production (possibly also tooling) | high | UNPATCHED_BLOCKER |
| googleapis | 92.0.0 → 92.0.0 | transitive | production (possibly also tooling) | high | UNPATCHED_BLOCKER |
| googleapis-common | 5.1.0 → 5.1.0 | transitive | production (possibly also tooling) | high | UNPATCHED_BLOCKER |
| gtoken | 5.3.2 → 5.3.2 | transitive | production (possibly also tooling) | high | UNPATCHED_BLOCKER |
| js-yaml | 4.3.1 → 4.3.2 | transitive | development | high | FIXED |
| micromatch | 4.0.8 → 4.0.8 | transitive | development | high | MITIGATED_WITH_RESIDUAL_RISK |
| next | 16.3.5 → 16.3.8 | direct | production (possibly also tooling) | critical | FIXED |
| node-forge | 1.4.0 → 1.4.0 | transitive | production (possibly also tooling) | high | UNPATCHED_BLOCKER |
| sharp | 0.35.4 → 0.35.5 | transitive | production (possibly also tooling) | high | FIXED |
| source-map-js | 1.2.1 → 1.2.2 | transitive | production (possibly also tooling) | high | FIXED |
| tinypool | 1.1.1 → removed from tree | transitive | development | critical | FIXED |
| uuid | 8.3.2 → 8.3.2 | transitive | production (possibly also tooling) | moderate | NEEDS_MANUAL_SECURITY_REVIEW |
| vitest | 3.2.4 → 4.1.12 | direct | development | critical | FIXED |

### @google/earthengine

- Chain(s): `@google/earthengine@1.7.43`
- Reachability: Server-only Earth Engine import chain. Route/service/initializer reject external execution; regression tests verify refusal before SDK/auth/database calls. SDK 1.7.43 uses positional google.auth.JWT; latest 1.7.48 still requires googleapis ^92.0.0. gtoken loads google-p12-pem only for .p12/.pfx key files; that code uses node-forge PKCS12 parsing, whereas the advisory concerns RSA signature verification. The application accepts JSON private-key objects and guard currently prevents authentication. This narrows observed exposure but does not establish a whole-program exemption.
- Remediation: No patched node-forge release as of 2026-10-16. Retain compatible SDK; reject npm suggested downgrade to 0.1.185 and unverified cross-major Google auth override. Require upstream fix/review before merge.
- Compatibility: Cross-major googleapis/auth changes can break positional JWT constructors and authentication. No credentialed/provider compatibility claim; no real GEE calls.

### @next/eslint-plugin-next

- Chain(s): `eslint-config-next@16.3.5 > @next/eslint-plugin-next@16.3.5`
- Reachability: Dev-only eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces. Inspected get-root-dirs.js reads trusted ESLint settings.next.rootDir, not HTTP input; repo config defines no custom rootDir. Build tooling and untrusted PR/config inputs remain potential attack surfaces.
- Remediation: No patched braces release (latest 3.0.3) or updated micromatch parent (latest 4.0.8). Do not downgrade Next ESLint to obsolete 14.2.35. Run tooling only on reviewed configuration with process/time limits; obtain accountable review.
- Compatibility: Residual High dev DoS; this disposition is not acceptance or a waiver, and must be revisited if tooling consumes user globs.

### @vitest/mocker

- Chain(s): `vitest@3.2.4 > @vitest/mocker@3.2.4`
- Reachability: Vitest transforms and resolves test mocks; API/UI not enabled, but dev tool advisory is retained until patched.
- Remediation: 4.1.12 through Vitest upgrade.
- Compatibility: Mock behavior; auth, approval and provider-failure regressions executed.

### brace-expansion

- Chain(s): `eslint-config-next@16.3.5 > typescript-eslint@8.67.0 > @typescript-eslint/typescript-estree@8.67.0 > minimatch@10.2.6 > brace-expansion@5.0.9`; `eslint@9.39.5 > minimatch@3.1.5 > brace-expansion@1.1.18`
- Reachability: ESLint minimatch 3 and TypeScript-ESLint minimatch 10 glob expansion of tool/repository paths.
- Remediation: 1.1.21 and 5.0.12 within respective parent ranges.
- Compatibility: File glob matching; lint and test discovery verified.

### braces

- Chain(s): `eslint-config-next@16.3.5 > @next/eslint-plugin-next@16.3.5 > fast-glob@3.3.1 > micromatch@4.0.8 > braces@3.0.3`
- Reachability: Dev-only eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces. Inspected get-root-dirs.js reads trusted ESLint settings.next.rootDir, not HTTP input; repo config defines no custom rootDir. Build tooling and untrusted PR/config inputs remain potential attack surfaces.
- Remediation: No patched braces release (latest 3.0.3) or updated micromatch parent (latest 4.0.8). Do not downgrade Next ESLint to obsolete 14.2.35. Run tooling only on reviewed configuration with process/time limits; obtain accountable review.
- Compatibility: Residual High dev DoS; this disposition is not acceptance or a waiver, and must be revisited if tooling consumes user globs.

### dompurify

- Chain(s): `jspdf@4.2.1 > dompurify@3.4.14`
- Reachability: jsPDF optional HTML rendering dependency. Current exports use text/images, but browser packaging and optional HTML entry remain; not declared unaffected.
- Remediation: 3.4.17 within jsPDF supported range.
- Compatibility: HTML sanitization behavior; existing PDF/PNG download flows retained.

### eslint-config-next

- Chain(s): `eslint-config-next@16.3.5`
- Reachability: Dev-only eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces. Inspected get-root-dirs.js reads trusted ESLint settings.next.rootDir, not HTTP input; repo config defines no custom rootDir. Build tooling and untrusted PR/config inputs remain potential attack surfaces.
- Remediation: No patched braces release (latest 3.0.3) or updated micromatch parent (latest 4.0.8). Do not downgrade Next ESLint to obsolete 14.2.35. Run tooling only on reviewed configuration with process/time limits; obtain accountable review.
- Compatibility: Residual High dev DoS; this disposition is not acceptance or a waiver, and must be revisited if tooling consumes user globs.

### fast-glob

- Chain(s): `eslint-config-next@16.3.5 > @next/eslint-plugin-next@16.3.5 > fast-glob@3.3.1`
- Reachability: Dev-only eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces. Inspected get-root-dirs.js reads trusted ESLint settings.next.rootDir, not HTTP input; repo config defines no custom rootDir. Build tooling and untrusted PR/config inputs remain potential attack surfaces.
- Remediation: No patched braces release (latest 3.0.3) or updated micromatch parent (latest 4.0.8). Do not downgrade Next ESLint to obsolete 14.2.35. Run tooling only on reviewed configuration with process/time limits; obtain accountable review.
- Compatibility: Residual High dev DoS; this disposition is not acceptance or a waiver, and must be revisited if tooling consumes user globs.

### google-auth-library

- Chain(s): `@google/earthengine@1.7.43 > googleapis@92.0.0 > google-auth-library@7.14.1`; `@google/earthengine@1.7.43 > googleapis@92.0.0 > googleapis-common@5.1.0 > google-auth-library@7.14.1`
- Reachability: Server-only Earth Engine import chain. Route/service/initializer reject external execution; regression tests verify refusal before SDK/auth/database calls. SDK 1.7.43 uses positional google.auth.JWT; latest 1.7.48 still requires googleapis ^92.0.0. gtoken loads google-p12-pem only for .p12/.pfx key files; that code uses node-forge PKCS12 parsing, whereas the advisory concerns RSA signature verification. The application accepts JSON private-key objects and guard currently prevents authentication. This narrows observed exposure but does not establish a whole-program exemption.
- Remediation: No patched node-forge release as of 2026-10-16. Retain compatible SDK; reject npm suggested downgrade to 0.1.185 and unverified cross-major Google auth override. Require upstream fix/review before merge.
- Compatibility: Cross-major googleapis/auth changes can break positional JWT constructors and authentication. No credentialed/provider compatibility claim; no real GEE calls.

### google-p12-pem

- Chain(s): `@google/earthengine@1.7.43 > googleapis@92.0.0 > google-auth-library@7.14.1 > gtoken@5.3.2 > google-p12-pem@3.1.4`
- Reachability: Server-only Earth Engine import chain. Route/service/initializer reject external execution; regression tests verify refusal before SDK/auth/database calls. SDK 1.7.43 uses positional google.auth.JWT; latest 1.7.48 still requires googleapis ^92.0.0. gtoken loads google-p12-pem only for .p12/.pfx key files; that code uses node-forge PKCS12 parsing, whereas the advisory concerns RSA signature verification. The application accepts JSON private-key objects and guard currently prevents authentication. This narrows observed exposure but does not establish a whole-program exemption.
- Remediation: No patched node-forge release as of 2026-10-16. Retain compatible SDK; reject npm suggested downgrade to 0.1.185 and unverified cross-major Google auth override. Require upstream fix/review before merge.
- Compatibility: Cross-major googleapis/auth changes can break positional JWT constructors and authentication. No credentialed/provider compatibility claim; no real GEE calls.

### googleapis

- Chain(s): `@google/earthengine@1.7.43 > googleapis@92.0.0`
- Reachability: Server-only Earth Engine import chain. Route/service/initializer reject external execution; regression tests verify refusal before SDK/auth/database calls. SDK 1.7.43 uses positional google.auth.JWT; latest 1.7.48 still requires googleapis ^92.0.0. gtoken loads google-p12-pem only for .p12/.pfx key files; that code uses node-forge PKCS12 parsing, whereas the advisory concerns RSA signature verification. The application accepts JSON private-key objects and guard currently prevents authentication. This narrows observed exposure but does not establish a whole-program exemption.
- Remediation: No patched node-forge release as of 2026-10-16. Retain compatible SDK; reject npm suggested downgrade to 0.1.185 and unverified cross-major Google auth override. Require upstream fix/review before merge.
- Compatibility: Cross-major googleapis/auth changes can break positional JWT constructors and authentication. No credentialed/provider compatibility claim; no real GEE calls.

### googleapis-common

- Chain(s): `@google/earthengine@1.7.43 > googleapis@92.0.0 > googleapis-common@5.1.0`
- Reachability: Server-only Earth Engine import chain. Route/service/initializer reject external execution; regression tests verify refusal before SDK/auth/database calls. SDK 1.7.43 uses positional google.auth.JWT; latest 1.7.48 still requires googleapis ^92.0.0. gtoken loads google-p12-pem only for .p12/.pfx key files; that code uses node-forge PKCS12 parsing, whereas the advisory concerns RSA signature verification. The application accepts JSON private-key objects and guard currently prevents authentication. This narrows observed exposure but does not establish a whole-program exemption.
- Remediation: No patched node-forge release as of 2026-10-16. Retain compatible SDK; reject npm suggested downgrade to 0.1.185 and unverified cross-major Google auth override. Require upstream fix/review before merge.
- Compatibility: Cross-major googleapis/auth changes can break positional JWT constructors and authentication. No credentialed/provider compatibility claim; no real GEE calls.

### gtoken

- Chain(s): `@google/earthengine@1.7.43 > googleapis@92.0.0 > google-auth-library@7.14.1 > gtoken@5.3.2`
- Reachability: Server-only Earth Engine import chain. Route/service/initializer reject external execution; regression tests verify refusal before SDK/auth/database calls. SDK 1.7.43 uses positional google.auth.JWT; latest 1.7.48 still requires googleapis ^92.0.0. gtoken loads google-p12-pem only for .p12/.pfx key files; that code uses node-forge PKCS12 parsing, whereas the advisory concerns RSA signature verification. The application accepts JSON private-key objects and guard currently prevents authentication. This narrows observed exposure but does not establish a whole-program exemption.
- Remediation: No patched node-forge release as of 2026-10-16. Retain compatible SDK; reject npm suggested downgrade to 0.1.185 and unverified cross-major Google auth override. Require upstream fix/review before merge.
- Compatibility: Cross-major googleapis/auth changes can break positional JWT constructors and authentication. No credentialed/provider compatibility claim; no real GEE calls.

### js-yaml

- Chain(s): `eslint@9.39.5 > @eslint/eslintrc@3.3.6 > js-yaml@4.3.1`
- Reachability: ESLint legacy configuration parser; repository config is controlled, but dependency remains reachable during tooling.
- Remediation: 4.3.2 within existing ^4 range.
- Compatibility: Lint configuration parsing.

### micromatch

- Chain(s): `eslint-config-next@16.3.5 > @next/eslint-plugin-next@16.3.5 > fast-glob@3.3.1 > micromatch@4.0.8`
- Reachability: Dev-only eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces. Inspected get-root-dirs.js reads trusted ESLint settings.next.rootDir, not HTTP input; repo config defines no custom rootDir. Build tooling and untrusted PR/config inputs remain potential attack surfaces.
- Remediation: No patched braces release (latest 3.0.3) or updated micromatch parent (latest 4.0.8). Do not downgrade Next ESLint to obsolete 14.2.35. Run tooling only on reviewed configuration with process/time limits; obtain accountable review.
- Compatibility: Residual High dev DoS; this disposition is not acceptance or a waiver, and must be revisited if tooling consumes user globs.

### next

- Chain(s): `next@16.3.5`
- Reachability: App Router, route handlers, proxy and next/image are used. Catalog thumbnails explicitly use unoptimized; default optimizer remains reachable and was tested locally. No ImageResponse use found; absence of a direct import is not an exemption.
- Remediation: Aligned stable 16.3.8 patch; removes all seven audited framework advisories.
- Compatibility: Framework routing, hydration, proxy and image behavior; full build/browser/API regression required.

### node-forge

- Chain(s): `@google/earthengine@1.7.43 > googleapis@92.0.0 > google-auth-library@7.14.1 > gtoken@5.3.2 > google-p12-pem@3.1.4 > node-forge@1.4.0`
- Reachability: Server-only Earth Engine import chain. Route/service/initializer reject external execution; regression tests verify refusal before SDK/auth/database calls. SDK 1.7.43 uses positional google.auth.JWT; latest 1.7.48 still requires googleapis ^92.0.0. gtoken loads google-p12-pem only for .p12/.pfx key files; that code uses node-forge PKCS12 parsing, whereas the advisory concerns RSA signature verification. The application accepts JSON private-key objects and guard currently prevents authentication. This narrows observed exposure but does not establish a whole-program exemption.
- Remediation: No patched node-forge release as of 2026-10-16. Retain compatible SDK; reject npm suggested downgrade to 0.1.185 and unverified cross-major Google auth override. Require upstream fix/review before merge.
- Compatibility: Cross-major googleapis/auth changes can break positional JWT constructors and authentication. No credentialed/provider compatibility claim; no real GEE calls.

### sharp

- Chain(s): `next@16.3.5 > sharp@0.35.4`
- Reachability: Next optional runtime image optimizer; exercised real local PNG decode, resize and WebP output both directly and through /_next/image.
- Remediation: 0.35.5/libvips 1.3.4 within existing semver range.
- Compatibility: Native optional binaries/platform compatibility; only Linux x64 tested.

### source-map-js

- Chain(s): `@tailwindcss/postcss@4.3.3 > @tailwindcss/node@4.3.3 > source-map-js@1.2.1`; `@tailwindcss/postcss@4.3.3 > postcss@8.5.26 > source-map-js@1.2.1`; `next@16.3.5 > postcss@8.5.23 > source-map-js@1.2.1`
- Reachability: Next/PostCSS and Tailwind CSS processing; sourcemap parsing can consume build inputs.
- Remediation: 1.2.2 within all parent ranges.
- Compatibility: Build/sourcemap compatibility; production build verified.

### tinypool

- Chain(s): `vitest@3.2.4 > tinypool@1.1.1`
- Reachability: Former Vitest worker-pool dependency. CLI-only use lowers network exposure but does not fix prototype-pollution gadgets.
- Remediation: Removed transitively by supported Vitest 4 upgrade; no feature or test removal.
- Compatibility: New Vitest worker implementation; full suite executed.

### uuid

- Chain(s): `@google/earthengine@1.7.43 > googleapis@92.0.0 > googleapis-common@5.1.0 > uuid@8.3.2`
- Reachability: googleapis-common calls uuid.v4() without caller buffer for multipart boundaries; advisory concerns v3/v5/v6 external buffers. Real GEE is guarded. No whole-program exemption claimed; inherited vulnerable major remains in runtime graph.
- Remediation: Patched CommonJS-compatible 11.1.1 exists but falls outside parent ^8.3.2; seek maintained upstream Google SDK chain or separately reviewed/tested scoped upgrade.
- Compatibility: Major-version transitive override not applied; deprecated uuid8 remains.

### vitest

- Chain(s): `vitest@3.2.4`
- Reachability: npm test uses vitest run with no UI/API server. Prior mocker/tinypool vulnerabilities still required patching; tests are executable trusted repository code.
- Remediation: 4.1.12 maintained V4 line; all @vitest packages aligned; no tinypool dependency. Retain Vite 7.3.6 explicitly.
- Compatibility: Major testing/mocking behavior; all 262 original tests preserved, plus two runtime tests.
