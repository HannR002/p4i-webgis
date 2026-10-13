# Phase 04 interactive review

Use feature branch `feat/gis-analysis-config-phase04`, continuing Phase 03 head 8f7243c.
See [configuration workflow and report](gis-analysis-configuration.md). Preserve local edits when
fetching/switching branches. With Node 22, the existing lockfile and GIS_DEMO_MODE=true in local
development settings, run npm run dev and open `/spatial/viewer?webmap=climate` in your local browser.

Open Analisis → Konfigurasi analisis GIS. Save a named AHP matrix or WLC input scenario, load or
duplicate it, and apply it to the existing recipe. Try zonal statistics with a fixture AOI and
classification rules at a stored coordinate. Flood mappings can be configured/saved but the panel
does not invoke GEE. Configurations persist only in this browser; export JSON to transfer settings.
Existing recipe drafts and JSON/PDF/PNG exports remain. No credentials required for local fixtures.

# Historical Phase 03 interactive review

Use branch `feat/phase-03-raster-engine` for the current raster workspace, based on verified
Phase 02 head 4d40a8e. See [Phase 03 report](phase-03-raster-report.md). Fetch the feature branch
into your local checkout without overwriting your existing edits. With Node 22, run npm ci,
enable GIS_DEMO_MODE=true in ignored local development settings and run npm run dev.

Open `/spatial/viewer?webmap=climate`, select the daily_mean band, then Pixel. Try center/manual
coordinates, masked cells and outside coverage. Select a fixture AOI, then Analisis for native
statistics/area, arithmetic and clip/mask descriptors. Save/load/undo/export preserve the band.
Use the no-basemap option for independent demo review. No Supabase/GEE secrets are required for
these fixtures; production refuses them. Real rasters and downloadable clipped files remain pending.

The cloud onboarding UI has no public interactive localhost preview. Screenshots in GitHub's
docs/evidence/phase-03 can be viewed or saved; workspace links are not guaranteed chat downloads.

# Historical Phase 02 interactive review

Use branch `feat/phase-02-geoportal-ux` for the current UI, based on Phase 01 local commit `35f9848`.
See [Phase 02 route inventory and evidence](phase-02-geoportal-report.md) and
[prepared PR content](phase-02-pr.md). Remote main did not yet contain Phase 01 at verification;
preserve local edits when reconciling the feature branch.

Use the existing lockfile with Node 22. Run `npm ci`, enable `GIS_DEMO_MODE=true` only in a local
development environment, then `npm run dev`. Begin at `/spatial/home`. Home search opens the
Webmap catalog; selecting a map opens the same Leaflet engine in the workspace. Try keyboard
panel tabs/center sampling, legend collapse, local save/load, Copilot and PNG/PDF export.
Demo never becomes a real scientific result; production refuses fixture data.

The cloud onboarding UI does not support interactive localhost links. Screenshots show the
actual app, and local browser startup provides full interaction. Do not infer that workspace
file links are downloadable chat attachments. Browser-generated map downloads are tested.

The older transfer instructions below apply to the original Phase 01 patch only.

# Reviewing the new portal

The onboarding UI has no public localhost preview. Cloud screenshots are static review artifacts,
not an interactive deployment. For the same interactive review as an IDE, run the checkout locally.
No production deployment, database migration or Git push is required.

Use Node.js 22 (hosting target) or Node.js 24, npm and the existing lockfile:

Phase 01 is on local branch `feat/phase-01-stabilization`; GitHub API access returned Forbidden.
The reviewable commit and patch/bundle include the earlier foundation plus stabilization.
See [the audit report](phase-01-stabilization-report.md). Chat file downloads may be unavailable;
these artifact paths describe files in the workspace, not guaranteed downloadable attachments.

To transfer the earlier cloud changes to your Antigravity checkout, download `p4i-gis-workspace.patch`
from the review artifacts. It was generated against baseline `dfe412c`. Preserve your local edits
and use a feature branch, then run `git apply --check p4i-gis-workspace.patch` before applying it
with `git apply p4i-gis-workspace.patch`. A failed check means the local checkout differs; resolve
the differences without resetting your work. The cloud feature branch has not been pushed.

```bash
cd p4i-webgis
npm ci
```

In ignored `.env.local`, add the non-secret flag:

```dotenv
GIS_DEMO_MODE=true
```

Run `npm run dev`; open the port reported by Next.js in your local browser. Start at
`/spatial/home`, browse Webmap/Data, then `/spatial/viewer`. The public fixture workflow requires no
Supabase or GEE credentials. Existing project/auth flows still require securely configured bindings.

In this managed cloud, Node 24 needs the inherited proxy/CA settings:

```bash
GIS_DEMO_MODE=true NODE_USE_ENV_PROXY=1 NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 0.0.0.0
```

Do not start a duplicate dev server in the same checkout. Live processes must restart after
snapshots. Keep secrets out of scripts/Git; never disable TLS verification or bypass network policy.
If OSM domains have not been applied from the saved draft, select “Tanpa basemap” for independent
fixture review. Production `npm run start` refuses fixtures even if the demo flag remains set.

Review checklist:

1. Open a thematic Webmap; search/filter datasets and inspect metadata.
2. Toggle/reorder/style/adjust opacity and zoom to raster/vector layers.
3. Open Pixel, click within coverage and review value/unit/resolution/provenance.
4. Click outside coverage: NoData, not zero-valued measurement.
5. Ask Copilot for rainfall/slope/boundaries; review, apply, then Undo/Redo.
6. Save a browser draft, reset and reopen; export/import validated JSON.
7. Export PNG/PDF; inspect watermark and metadata. Tiles may depend on CORS.
8. Review AHP consistency and save provisional weights; do not claim real analysis.
9. Check mobile navigation and panel collapse.
10. Keep real project access and flood computation separate from fixtures.
