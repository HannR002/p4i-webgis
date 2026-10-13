# Phase 04: reusable GIS analysis configurations in the existing workspace

Analysis settings can now be named, saved locally, loaded, duplicated and reused instead of being
lost when configuring a new scenario. One typed GISAnalysisConfiguration model records inputs,
bands/units/native resolution/period, parameters, weights, classifications, provenance and revision.
It integrates with existing MapRecipe/history and PDF/JSON export.

The panel restores existing AHP preferences, inspects derived weights/CR and shares the old WLC
formula for explicit input scenarios. Raster configurations execute existing bounded DEMO operations.
Flood records four experimental inputs/mappings but does not invoke an unavailable configurable
GEE adapter. Buffer/vector overlay remain unavailable. No methodology ranking, grading, expert
approval or VALIDATED workflow is implemented; high CR does not block configuration save/apply.

Typed AI-facing list/select/draft/propose/prepare tools validate IDs, metadata and permissions,
without executing or saving proposals. Local repository handles revisions, conflicts/corruption,
size limits and storage failures. Production tables and dependency manifests remain unchanged.

## Verification

- Node 22.23.3 lint/typecheck, 154 tests/25 files and build passed.
- New Chromium configuration CRUD/persistence, AHP/WLC, real JSON/PDF downloads and provider flows passed.
- Eight desktop/mobile Axe audits: zero violations; no overflow/page errors in tested states.
- Phase 02 responsive flows and Phase 03 pixel/raster/export regressions passed.
- New browser QA made zero GEE calls; no migration, deployment, billable work or merge.
- [Repository report and screenshots](https://github.com/HannR002/p4i-webgis/blob/feat/gis-analysis-config-phase04/docs/gis-analysis-configuration.md).

## Dependency and limitations

Base: feat/phase-03-raster-engine (8f7243c), preserving actual completed Phase 01–03. Remote main
still lacks those parent phases; review Phase 04 as a stacked diff before reconciling main.
Local DEMO raster outputs/scenario math are not real scientific measurements. Real data adapters,
configurable flood execution, raster harmonization/products and shared server storage remain pending.

Publication and actual PR attempt outcome will be recorded after verification.
