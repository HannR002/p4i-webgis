# Post-audit remediation R1 — map lifecycle integrity

Date: 2026-10-19. Scope: cumulative audit finding F03 only.

## Verified baseline and reproduction

- Clean starting checkout; remediation branch `fix/phase16-map-analysis-state-integrity` created from Phase 16 commit `086f13f8d95b8cdd6afd0ac85ac5d7fb5a2bd8a1`.
- GitHub PR #12 was rechecked after verification: open, draft, unmerged, head `feat/phase16-vector-spatial-analysis` at that same commit. This is the remediation PR target; `main` and existing PRs are untouched.
- Read repository `AGENTS.md`, applicable Next.js documentation, cloud setup/runtime skills, configured `start_skill`, and `/workspace/artifacts/cumulative-audit-2026-10-19/P4I_CUMULATIVE_INTEGRATION_AUDIT.md`. No cloud configuration was changed; this run does not certify that the running instance has adopted a newly published environment revision.
- Before editing, a synthetic in-memory probe using actual modules reproduced retained old results after Copilot replacement and catalog opening. Manual `action(createMap)` already cleared results. Evidence: `before-probe.log` in the artifact directory below.

## Root cause and correction

The central `replace()` operation replaced MapRecipe without consistently invalidating transient analysis state. Manual `createMap` performed a separate reset; Copilot and catalog bypassed it. Recipe IDs and feature IDs can be reused, so checking IDs or comparing serialized recipes cannot identify all lifecycle boundaries. Analysis estimates and pending request controllers also lived inside mounted React panels.

The workspace now distinguishes replacement (the safe default) from an explicit same-map `edit`. A single lifecycle policy atomically clears result, proposal, persisted-layer binding, selections, drawing state, pixel samples and editing references on replacement. A monotonic `mapEpoch` records boundaries even for identical recipes. History records whether a transition replaces the map: Undo/Redo restores recipe content, but never resurrects transient analysis or a persisted revision binding across that boundary. Stored draft/MapRecipe serialization is unchanged.

`VectorAnalysisPanel` keys its internal session by `mapEpoch`, disposing estimates, selections and outstanding requests on replacement. Existing abort, sequence, recipe-reference and vector-epoch response checks remain. Copilot previews and configuration-save approvals additionally check map epoch; delayed automatic responses retain the existing recipe/context/vector-epoch checks. Completed `createMap` plans trigger replacement even if the resulting recipe is byte-identical.

Same-map callers explicitly opt into `edit`, preserving valid analysis through colors, visibility, description, viewport and ordinary edit history. Selection follows the editor's effective first-layer fallback, resolved against the previous recipe, and cannot transfer to a different layer merely because its feature IDs match. Active vertex drags still require completion or cancellation before replacement.

## Lifecycle coverage

| Path | Policy and evidence |
| --- | --- |
| Manual createMap/reset | Replacement; unit and delayed-response browser flow |
| Copilot completed createMap | Replacement; unit plus actual deterministic Copilot browser response |
| Copilot reviewed createMap preview | Keep current result during preview; clear on application; browser |
| Catalog/template opening | Replacement; unit and client-side navigation browser |
| Direct recipe replacement / identical recipe | Replacement by default; unit |
| Validated MapRecipe import | Replacement; unit and browser |
| Opening local draft | Replacement; unit and browser, including stale preview refusal |
| Opening persisted project layer | Replacement, then attach newly loaded binding; unit and synthetic browser |
| Undo/Redo across replacement | Clear transient context in both directions; unit and browser |
| Styling, visibility, pan/zoom, same-map Undo/Redo | Preserve result; unit and browser |
| Feature deletion | Remove invalid selection/proposal references; unit |

Analysis results are separate persisted-source snapshots. This patch does not recompute them after editing a local copy or add new provenance semantics. Opening a project may attach its loaded revision, but no lifecycle operation writes or rolls back persisted revisions. Saving continues to require the existing explicit user action.

## Exact files changed

- `store/useWorkspaceStore.ts`: centralized policy, explicit lifecycle argument, epoch and history boundary tracking.
- `components/gis/CopilotPanel.tsx`: createMap handling, preview/approval epoch guards, removal of redundant binding reset.
- `components/gis/VectorAnalysisPanel.tsx`: map-scoped session lifecycle; copied results are same-map edits.
- `components/gis/MapWorkspace.tsx`: description/weights edits explicitly remain in the map; redundant draft binding reset removed.
- `components/gis/AnalysisConfigurationPanel.tsx`: configuration application marked as same-map editing.
- `components/gis/ComputeJobCard.tsx`: applying a compute result marked as same-map editing.
- `components/gis/VectorProjectStorage.tsx`: reverting local edits marked as same-map editing; project opening retains replacement semantics.
- `tests/mapLifecycle.test.ts`: 15 regression cases covering lifecycle, selection, atomicity and revision preservation.
- `tests/fixtures/vector-analysis-lifecycle.json`: bounded synthetic point/document/result shared by unit and browser tests; not a real measurement.
- `scripts/qa/remediation-r1-map-lifecycle.mjs`: nine browser flows, delayed response, real Leaflet overlay assertions and accessibility checks.
- `docs/POST_AUDIT_REMEDIATION_R1.md`: this report.

No API authorization, dependency, migration or Phase 15/16 SQL proposal files changed. No new engine or persistence mechanism was introduced.

## Verification evidence

Runtime: Node.js 22.23.3, npm 10.9.9. Local demo mode, `AI_PROVIDER=demo`, Gemini/GEE disabled, vector storage disabled, Supabase configured to an unavailable loopback endpoint. No real external database or provider request was needed.

| Check | Final result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 422 passed, 37 skipped; 48 passing files, 2 skipped files |
| `npm run build` | PASS |
| Existing browsers Phase 01–07 | All seven suites PASS |
| Existing Phase 13 vector editor | PASS, including manual editing, draft reload, PNG/PDF downloads |
| Existing Phase 14 vector digitizing | PASS, including drag Undo/Redo, snapping, import and attribute editing |
| New R1 browser regression | Nine flows PASS; no page errors, forbidden calls or project-storage writes |
| Accessibility | No reported axe violations in R1 at 1480/390 px and Phase 13/14 at 1480/768/390/320 px |

The existing Phase 13 browser initially caught selection loss after rename under the first-layer fallback. The central selection policy was corrected and two unit regressions added; Phase 13, Phase 14, R1, and all required application checks then passed. Initial R1 harness runs also needed a canvas-compatible overlay selector and avoidance of reselecting the already active project. No existing regression tests were removed or weakened.

The 37 skipped tests require a disposable PostGIS fixture. No fixture was started: this task permits those tests only with explicit authorization under the environment instructions, which was not supplied for this run. Phase 15 storage and Phase 16 real-DB browser suites were consequently not rerun. The R1 browser intercepts storage reads and analysis responses with the clearly synthetic fixture while exercising actual workspace, Copilot, reducer and Leaflet components. It proves UI lifecycle behavior, not database computation, RLS or persisted write behavior. Unit tests separately assert no fetch/storage side effect and unchanged source revisions.

Local logs and screenshots: `/workspace/artifacts/remediation-r1/`. Final summaries: `verification-final.json`, `browser-regression-results.json` (initial sweep, including the subsequently fixed Phase 13 failure), `browser-final-summary.json` and each final browser directory's `results.json`. Screenshots in `remediation-r1-map-lifecycle-final/`: `before-replacement.png`, `after-replacement.png`, `preserved-presentation.png`. These machine-local artifacts are not required to run the committed tests.

Reproduce with the safe local demo environment described above:

```sh
npm run lint
npm run typecheck
npm test
npm run build
# In a separate terminal, with real providers disabled:
npm run dev -- --hostname 127.0.0.1 --port 3000
# Set P4I_PLAYWRIGHT_MODULE, P4I_CHROMIUM and P4I_AXE_SCRIPT to installed tools.
# P4I_QA_ARTIFACTS selects the output directory.
node scripts/qa/remediation-r1-map-lifecycle.mjs
```

## Integration impact and remaining gates

R1 addresses F03 with local regression evidence and is suitable for focused review into the Phase 16 branch. The default replacement semantics are intentional: future callers editing an existing map must explicitly select `edit`; history is session-only, so no persisted format migration is needed.

This is not unconditional approval of the cumulative integration. Other cumulative audit findings—including dependency disposition, legacy upload containment, authorization-policy differences, database foundation, durable state and CI/human review gates—remain outside this patch. Production remains **NO-GO** pending those controls, real integration verification and human UAT. No external Supabase access, Gemini/GEE call, migration, automatic save/publication, merge or deployment was performed.
