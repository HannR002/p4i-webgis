# Reconcile GIS workspace and stabilize map state, AHP and demo isolation

Base: `main` (`dfe412c`). Head: `feat/phase-01-stabilization` (local).
This is a prepared PR description, not an opened GitHub PR. GitHub GraphQL returned Forbidden.

The previous GIS implementation existed only as local changes. This changeset includes that
portal/workspace foundation and fixes regressions found by source audit and browser testing:
late Copilot replies no longer overwrite Undo, cancelled pixel requests leave a usable state,
and layer order updates the Leaflet panes. The AHP editor now works independently of legacy AOI
selection. Demo workspaces exclude retained real flood results; legacy mock recommendations are
unavailable in production. Recipe import checks access and AOI identity, errors are visible, and
PDF export preserves map aspect ratio.

## Validation

- Frozen-lockfile npm ci; Node 22.23.3 / npm 10.9.9.
- Lint, TypeScript, 75 tests / 17 files and production build pass; no skipped tests.
- Actual Chromium desktop 1480×960 and mobile 390×844 smoke/regression runs, zero page errors.
- PNG/PDF/JSON downloads, AHP consistency, delayed-response conflicts and production isolation checked.
- [Screenshots and full audit](phase-01-stabilization-report.md#6-bukti-dan-cara-mengulang).

## Limits and follow-up

Staging public list works, but boundary and project-vector RPCs return PGRST202. Real account
login/B2B/admin mutation/audit, GEE, scientific validation, real raster/LLM adapters and DB map
persistence remain pending. No migrations, external writes, production deployment, paid calls,
resource creation, push, merge or history rewrite occurred. GitHub visibility is unverified.

The file list includes the prior uncommitted foundation because none of it was on remote main.


## Complete changeset file list

- `.env.example`
- `app/api/ai-recommendation/route.ts`
- `app/api/gis/actions/route.ts`
- `app/api/gis/catalog/route.ts`
- `app/api/gis/copilot/route.ts`
- `app/api/gis/pixel/route.ts`
- `app/api/gis/tiles/[id]/[z]/[x]/[y]/route.ts`
- `app/api/gis/vector/[id]/route.ts`
- `app/spatial/(portal)/ai/page.tsx`
- `app/spatial/(portal)/analysis/page.tsx`
- `app/spatial/(portal)/data/page.tsx`
- `app/spatial/(portal)/help/page.tsx`
- `app/spatial/(portal)/home/page.tsx`
- `app/spatial/(portal)/layout.tsx`
- `app/spatial/(portal)/viewer/page.tsx`
- `app/spatial/(portal)/webmap/page.tsx`
- `app/spatial/gis.css`
- `app/spatial/page.tsx`
- `components/AhpSimulatorPanel.tsx`
- `components/ExportImageButton.tsx`
- `components/ExportPdfButton.tsx`
- `components/SpatialMap.tsx`
- `components/gis/CopilotPanel.tsx`
- `components/gis/MapWorkspace.tsx`
- `components/gis/PixelInspector.tsx`
- `components/gis/PortalPages.tsx`
- `components/gis/PortalShell.tsx`
- `components/gis/WorkspaceMap.tsx`
- `components/gis/WorkspaceMapContent.tsx`
- `components/gis/useGisCatalog.ts`
- `docs/ai-gis-copilot-architecture.md`
- `docs/backend-provider-architecture.md`
- `docs/evidence/phase-01/ahp-workspace.png`
- `docs/evidence/phase-01/browser-regression.log`
- `docs/evidence/phase-01/browser-smoke.log`
- `docs/evidence/phase-01/copilot-plan.png`
- `docs/evidence/phase-01/map-workspace.png`
- `docs/evidence/phase-01/mobile-catalog-error.png`
- `docs/evidence/phase-01/mobile-workspace.png`
- `docs/evidence/phase-01/pixel-inspector.png`
- `docs/evidence/phase-01/portal-home.png`
- `docs/evidence/phase-01/production-isolation.json`
- `docs/flood-analysis-architecture.md`
- `docs/implementation-report.md`
- `docs/local-review.md`
- `docs/map-builder-architecture.md`
- `docs/phase-01-pr.md`
- `docs/phase-01-stabilization-report.md`
- `docs/portal-information-architecture.md`
- `docs/raster-pixel-analysis.md`
- `lib/gis/catalog.ts`
- `lib/gis/contracts.ts`
- `lib/gis/mode.ts`
- `lib/gis/recipe.ts`
- `lib/gis/validation.ts`
- `lib/server/ai/contracts.ts`
- `lib/server/ai/index.ts`
- `lib/server/ai/providers/demo.ts`
- `lib/server/ai/tools/registry.ts`
- `lib/server/gis/context.ts`
- `lib/server/gis/contracts.ts`
- `lib/server/gis/http.ts`
- `lib/server/gis/index.ts`
- `lib/server/gis/providers/demo.ts`
- `scripts/qa/phase-01-regression.mjs`
- `scripts/qa/phase-01-smoke.mjs`
- `store/useWorkspaceStore.ts`
- `tests/ahpPanel.test.tsx`
- `tests/gisCopilot.test.ts`
- `tests/gisRaster.test.ts`
- `tests/gisRecipe.test.ts`
- `tests/gisRoutes.test.ts`
- `tests/legacyRecommendation.test.ts`
- `tests/spatialMapIsolation.test.tsx`
- `tests/workspaceStore.test.ts`
