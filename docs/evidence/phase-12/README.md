# Phase 12 evidence index

Collected 16 October 2026, Node 22.23.3 / npm 10.9.9. Full explanation and limits:
[Phase 12 report](../../PHASE_12_RESIDUAL_DEPENDENCY_RESOLUTION.md).

- `initial-audit*.json`, `initial-tree.json`: fresh Phase 11 baseline before isolation.
- `final-audit*.json`, `final-tree.json`: final application graph. Full audit exits 1 for
  the one dev-only braces advisory (five affected packages); production audit exits 0.
- `production-ci.log`, `production-tree.json`, `production-install-isolation.json`:
  independent production-only installation of the same manifest/lock; no SDK chain.
- `dependency-delta.json`: 35 removed packages, no retained version change, lockfile hash.
- `upstream-metadata.json`, `advisory-dispositions.json`, `braces-path-review.json`:
  refreshed upstream status, vulnerable/precondition details and trusted-tooling boundary;
  no security waiver is issued.
- `archive-verification.json`: all three historical source blocks preserved byte-for-byte
  from the Phase 11 commit in non-runtime Markdown reference.
- `build-isolation.json`, `build-isolation.log`: full installed graph and completed Next
  server/static output inspection, 686 files and 43 traces, no GEE chain/SDK markers.
- `verifier-negative-controls.json`: the verifier refuses forbidden manifest/lock/installed
  entries and absent completed builds; failures do not produce success evidence.
- `lint.log`, `typecheck.log`, `tests.log`, `build.log`: successful final quality gate.
- `targeted-tests.log`, `early-typecheck.log`: unsuccessful initial new-test instrumentation
  attempts; reasons/corrections are documented in the report. `targeted-tests-final.log`
  records the corrected passing targeted run before the full gate.
- `phase-*.log`, `*-summary.json`, `phase-02-accessibility.json`: nine existing browser suites,
  39 clean automated accessibility audits and responsive/error assertions.
- `api-production-isolation.json`, `framework-checks.json`: 12 local API/refusal/rate checks
  and three image-optimizer checks against local next start.
- `database-summary.json`, `database.log`: 340 local PostgreSQL/PostGIS/PostgREST assertions,
  two synthetic fresh cycles. No external DB and no assertion of verified foundation DDL.
- `verification-summary.json`: aggregate results and separate merge/production decisions.
- `github-delivery.json`: draft delivery metadata, added after PR creation.

`log-transcription.json` records raw/committed hashes where terminal carriage returns,
trailing whitespace or blank EOF lines were normalized. Raw logs/screenshots/local export
fixtures remain in `/workspace/artifacts/phase-12`; no real client dataset or credential is
included. Absolute tool/artifact paths are informational. The host-global uuid tool package
and stale/cached files outside the inspected application output are outside the claimed scope.
