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
