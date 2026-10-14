# Phase 05: controlled autonomous GIS Copilot in the existing workspace

GIS instructions now become validated, permission-aware tool plans that can automatically read
catalog/pixels or apply reversible MapRecipe changes in one Undo entry. Optional preview executes
the exact reviewed plan. Native pixel values and Phase 04 configuration drafts/preparations use
existing providers/engines; draft proposals fork IDs rather than overwrite saved objects.

An immutable tool policy, complete preflight, strict inputs/outputs and bounded execution reject
unknown IDs, restricted access, role/code injection, invalid outputs and stale responses. Persistent
local configuration save requires explicit snapshot approval. Publication and GEE stay unavailable.
The connected planner is clearly deterministic DEMO; no real model credentials or billable calls.
Unknown real AOIs such as Kota Jambi request clarification instead of substituting fixture data.

## Validation

- Node 22.23.3 lint/typecheck/build; 188 tests/28 files, including 34 new tests.
- Chromium default auto/render/Undo/Redo, preview/replay, catalog/pixel/NoData, draft/fork/prepare,
  explicit save/cancel, request abort/stale conflict and malicious-command flows pass.
- Eight desktop/mobile Axe audits: zero violations/overflow/page errors; zero GEE requests.
- Phase 02–04 browser regressions, existing AHP/WLC, native raster analysis and JSON/PNG/PDF downloads pass.
- Production refuses DEMO prompt/replay/pixel/process; client marker scan is clear.
- [Architecture/report/screenshots](https://github.com/HannR002/p4i-webgis/blob/feat/ai-gis-copilot-phase05/docs/ai-gis-copilot-architecture.md).

## Dependency and limitations

Base **feat/gis-analysis-config-phase04** at 22cf04c is the actual Phase 04 implementation; remote
main still lacks the parent phases. Review as a stacked change. No dependencies, migrations,
production data changes, paid services, deployment, scientific methodology ranking or auto merge.
Real model/AOI/raster adapters, durable audit, distributed quotas and remote approvals remain pending.
The deterministic grammar is intentionally limited; DEMO samples are not scientific measurements.

## Publication outcome

Implementation `cf3a39b` was pushed to origin/feat/ai-gis-copilot-phase05. Actual draft PR creation
using the base above failed with `Post "https://api.github.com/graphql": Forbidden`. No PR was
opened; this is the prepared description. HTTPS Git push succeeded, while the GitHub API request
was blocked in this environment.

[Review the stacked diff and create the PR](https://github.com/HannR002/p4i-webgis/compare/feat%2Fgis-analysis-config-phase04...feat%2Fai-gis-copilot-phase05?expand=1).
Keep Phase 04 as the base until its parent phases are reconciled into main. No merge/deployment.
