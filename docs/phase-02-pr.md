# Polish P4I geoportal catalogs and accessible map workspace

Home, Webmap, Data, Help and the workspace now share a coherent navigation and visual system.
Home search opens filtered Webmaps; cards show actual Leaflet previews, access, sources and data
availability. Unavailable maps offer an honest state instead of a working-data action.

The workspace retains the existing SpatialMap, layer/AOI controls, AHP/WLC, Flood entry point,
Pixel Inspector, Copilot and PDF/PNG export. It adds keyboard tabs/center sampling, collapsible
legend/panel with map resize, proper loading controls, editable title/description and persistent
Copilot conversations between panels. Mobile navigation is a modal dialog with focus containment
and Escape/return-focus behavior.

## Validation

- Node 22.23.3: lint, typecheck, 81 tests / 19 files and production build pass.
- Real Chromium flows at 320/390/768/1024/1480 px; no page errors, horizontal overflow or map-control overlaps.
- Axe: 7 routes × desktop/mobile, zero violations in tested states.
- Local draft/undo/redo, AI plan/apply/undo, AHP, keyboard interactions and actual JSON/PNG/PDF downloads checked.
- Production unavailable catalog/workspace and fixture refusal checked.
- [Route inventory, screenshots, QA and limitations](phase-02-geoportal-report.md).

## Integration note

Remote main was still dfe412c at task start; Phase 01 (35f9848) existed locally, contrary to the
assumed merged baseline. This branch includes that parent plus Phase 02. Review the UI-specific
diff against 35f9848, and reconcile Phase 01 before treating this as a Phase 02-only PR.

Implementation commit 45c15fd was pushed successfully to origin/feat/phase-02-geoportal-ux.
The actual draft PR creation command failed with GraphQL Forbidden; no PR was opened.
[Create the PR on GitHub](https://github.com/HannR002/p4i-webgis/pull/new/feat/phase-02-geoportal-ux).
This file is prepared PR content. No merge, force push, deployment, database migration, paid service or
production data change is part of this change. Real data/GEE/LLM and account happy-path QA remain pending.
