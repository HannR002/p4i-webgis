# Phase 06: controlled GIS analysis jobs and compute approval

Copilot can now execute supported local GIS calculations from the existing Phase 04
configuration objects and apply actual results to the current MapRecipe. Small jobs run
automatically; a 1,600-cell native DEMO scan pauses for explicit approval. Unavailable
flood/GEE execution displays UNKNOWN external cost and cannot be activated by approval.

Typed compute requests/jobs/results, a validated state machine and conservative resource
limits bind approval to the trusted owner, project, exact inputs and ceiling. Execution
reauthorizes, deduplicates requests, supports cancellation/bounded retries and rejects
stale provider identities. The approval endpoint is separate from AI tools. Map results
retain Undo/Redo, provenance, legends and PDF metadata; the job card offers a downloadable
Markdown report and inspection of its exact configuration/source snapshot.

## Validation

- Actual Phase 05 baseline `989ff92`: lint/typecheck/build and 188 tests/28 files pass.
- Final Node 22 lint/typecheck/build and **209 tests/30 files** pass, including 21 new
  compute/security/route tests.
- Chromium: automatic geometry, controlled grid approval, categorical NoData/statistics,
  anonymous-session isolation, cancellation/retry, unresolved real AOI and UNKNOWN cost.
- Computed JSON/PNG/PDF and Markdown downloads verified; extracted PDF text contains actual
  result/job provenance. Mobile 390/768px has no overflow; two Phase 06 WCAG AA audits pass.
- Phase 05 browser regressions and eight additional desktop/mobile Axe audits pass.
- Zero browser page errors or GEE calls. Production rejects this development adapter even
  when the DEMO flag is enabled.
- [Execution documentation/screenshots](ai-gis-analysis-execution.md),
  [governance and worker boundaries](commercial-compute-governance.md),
  [verification evidence](evidence/phase-06/verification-summary.json).

## Scope and dependency

Head `feat/ai-gis-analysis-phase06` stacks on `feat/ai-gis-copilot-phase05` at `989ff92`.
Phase 05 PR #1 is still open/draft and main lacks its implementation; this PR does not
claim those phases merged. No dependencies, migrations, deployment, paid provider calls,
production data changes or automatic merge. Existing AHP/WLC, Flood, Pixel Inspector,
Copilot and exports remain available.

The planner is deterministic DEMO; numerical results use actual local fixture/user inputs.
The process-local 30-minute job store is not durable or production-ready; the production
compute endpoint is disabled. Real AOI/raster/GEE/model adapters, durable workers/quotas,
external monetary estimates, buffer/vector overlay and automated scenario comparison are
pending. Scientific methodology validation/ranking and mandatory expert approval are
explicitly out of scope.
