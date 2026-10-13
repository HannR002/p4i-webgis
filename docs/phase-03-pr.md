# Add typed raster provider, band-aware Pixel Inspector and bounded local GIS operations

Pixel sampling previously lacked explicit native-grid/encoding semantics and raster processing
was contract-only. The existing Leaflet/MapRecipe workspace now queries a typed async provider,
displays actual returned band/raw/physical values, and supports bounded deterministic DEMO
statistics, classification and point arithmetic. Clip/mask returns an honest subset descriptor.

Selected-band styling/legends, local draft/undo/JSON and PDF metadata share the same dataset
semantics. Provider inputs/results are runtime validated; all operands checked for permissions;
NoData and categories handled explicitly; incompatible grids never silently resampled. Existing
AHP/WLC, Flood, Copilot and exports remain available.

## Validation

- Node 22.23.3 lint, typecheck, **123 tests / 22 files**, production build passed.
- Chromium raster flows, selected-band persistence and genuine JSON/PNG/PDF downloads passed.
- Four new desktop/mobile Axe audits: zero violations; no page errors/horizontal overflow.
- Phase 02 regression passed across 320/390/768/1024/1480 px.
- Production pixel/process refuse fixtures (503); client-bundle secret markers absent.
- [Report/screenshots](https://github.com/HannR002/p4i-webgis/blob/feat/phase-03-raster-engine/docs/phase-03-raster-report.md) and [adapter contract](https://github.com/HannR002/p4i-webgis/blob/feat/phase-03-raster-engine/docs/raster-real-data-adapter-contract.md).

## Scope and dependency

Real GEE/PostGIS/GeoTIFF data adapters, full raster outputs/resampling and scientific calibration
remain pending. Local fixtures are visibly DEMO; clip/mask does not generate a GeoTIFF. No new
dependencies, migration, credentials, billable computations, deployment or automatic merge.

Stack on `feat/phase-02-geoportal-ux` (4d40a8e), because remote main still lacks Phase 01/02.
Review Phase 03 separately, then reconcile parents before any main merge.

Implementation commit `1d7e395` was pushed to origin/feat/phase-03-raster-engine.
Actual draft PR creation with base feat/phase-02-geoportal-ux failed:
`Post "https://api.github.com/graphql": Forbidden`. No PR was opened. The Git push succeeded;
the GitHub API request is blocked in this environment. Prepared content and evidence are published.

[Review the stacked diff and create a PR](https://github.com/HannR002/p4i-webgis/compare/feat%2Fphase-02-geoportal-ux...feat%2Fphase-03-raster-engine?expand=1).
Keep feat/phase-02-geoportal-ux as the base while its parent changes remain absent from main.
