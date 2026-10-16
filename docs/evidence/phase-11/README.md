# Phase 11 verification evidence

Collected 16 October 2026 using Node 22.23.3. See the
[full report](../../PHASE_11_DEPENDENCY_SECURITY_REMEDIATION.md).

- `initial-*` / `final-*`: fresh npm audit, production audit, install and dependency-tree evidence.
  Audit exit 1 denotes reported vulnerabilities. The final npm tree exits zero but labels two
  locked optional non-Linux Sharp artifacts extraneous; the report explains this limitation.
- `TRIAGE_MATRIX.md`, `triage-matrix.json`, `advisory-dispositions.json`: every initial affected
  package and GHSA, versions/ranges, CVE references where assigned, chains, scope, reachability,
  remediation and compatibility. No unreviewed security waiver.
- `upstream-metadata.json`: compact public registry snapshots used to choose compatible versions
  and reject unsafe SDK downgrades/major overrides.
- `lockfile-version-changes.json`, `dependency-summary.json`: exact resolution changes, before/
  after counts and final lockfile hash.
- `update-*.log`, `retain-vite7.log`, `intermediate-vite8-tree.stderr`: unsuccessful npm10
  resolver attempts and successful npm11 resolution; the discarded Vite8 optional-peer issue
  is historical, not a failure in the final Vite7 candidate.
- `lint.log`, `typecheck.log`, `tests.log`, `build.log`: executed final application checks.
- `phase-*.log`, `*-summary.json`, `phase-02-accessibility.json`: nine browser suites, 39 Axe
  checks and responsive/error assertions. Synthetic fixtures only; no real client data.
- `production-isolation.json`: 12 local production-mode API/refusal/rate checks.
- `framework-checks.json`: three additional local production image-optimizer checks.
- `database-summary.json`, `database.log`: 340 local Docker PostgreSQL/PostGIS/PostgREST checks
  in two fresh cycles with an explicitly synthetic foundation; no external database access.
- `verification-summary.json`: aggregate outcomes and limits, separate merge/production decisions.
- `github-delivery.json`: verified branch/PR delivery metadata (added after draft creation).

Machine-specific absolute artifact/tool paths in logs are informational. Reproduction commands
and isolation requirements are in the report. Screenshots/downloads from these runs remain in
`/workspace/artifacts/phase-11`; no additional binary report/client data is published here.

`log-transcription.json` records raw and committed hashes where terminal carriage returns,
trailing whitespace or blank EOF lines were normalized for review. Log content/results are
otherwise unchanged; raw captures remain in the workspace artifact directory.
