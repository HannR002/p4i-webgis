# Declarative map workspace

`lib/gis/contracts.ts` defines MapDocument/MapRecipe, MapViewport, MapLayerConfiguration and
MapLegend. Schema version 1 contains identity, title, description, basemap, viewport, dataset
identities, visibility/opacity/style, AOI identity, legend, optional provisional AHP metadata and
human/AI provenance. It contains no credentials, arbitrary URLs, Leaflet objects, large geometry
or raster arrays.

`parseRecipe` validates consumed fields, numeric bounds, layer uniqueness/type, known dataset
IDs, safe hex colors, legends and weight totals. It selects known fields in its output.
`parseMapAction` accepts a discriminated whitelist and rejects unknown tools/extra parameters.
`applyMapAction` checks access and availability; `executeMapPlan` applies actions atomically to
copies, leaving the original untouched on failure. Legends are regenerated after edits. Layer
order is bottom-to-top; the panel shows topmost first. Categories use class labels, not normalized
numeric codes.

`useWorkspaceStore` holds configurations, bounded history and small pixel responses. The last
30 recipe snapshots support Undo/Redo; divergent edits clear Redo. The activity log keeps 50
entries. Map drags update viewport without flooding history. Explicit local draft save/load uses
browser key `p4i-map-draft-v1`, not the database. JSON import is limited to 64 KB and revalidated.
Drafts are not cross-device persistence or authoritative project permissions.

`WorkspaceMapContent` adds recipe-controlled panes, pixel/measure click behavior, zoom/scale
controls and viewport syncing inside the existing `SpatialMap` MapContainer. Existing real
project/bbox geometry remains behind repository APIs. Synthetic AOI selection never sets the real
flood-analysis boundary identity.

Implemented: OSM/empty basemap, add/remove/reorder/show/hide/opacity/style/zoom-to-layer, metadata,
legend, fixture AOI, title/description, duplicate/reset, browser draft save/load, validated recipe
import/export, PNG/PDF, approximate two-point geodesic distance and Undo/Redo. Advanced symbology,
drawn AOIs, persistent maps and vector tiles are future work. Measures are not cadastral surveys.

Existing AHP computation is unchanged; consistency-checked weights can be stored as provisional
recipe metadata. The original viewer no longer invents WLC criteria from feature-name length:
incomplete data renders neutrally. A flood raster remains separate; its aggregate AOI score is
not silently assigned to unrelated polygons.

Workspace PDF adds title, AOI, layer sources, periods/resolutions, versions, weights and a demo/
provisional disclaimer. PNG includes the visible legend/title/demo watermark. Fixture exports do
not write project download history. Existing project exports are retained. Overlay visibility
is restored in `finally` after failures. Basemap capture depends on network policy and tile CORS.
