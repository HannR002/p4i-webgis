# Raster and pixel architecture — Phase 03

Raster sampling and bounded local processing run through the existing Leaflet/MapRecipe workspace.
The browser receives metadata, small samples, statistics and subset descriptors, never full raster
arrays. All currently available datasets and measurements are explicitly **DEMO**. Production
returns unavailable when no real provider is configured; it never substitutes fixtures.

## Contracts and execution boundary

`lib/gis/contracts.ts` defines RasterDataset, RasterBand, RasterMetadata, RasterStyle, PixelSample,
RasterStatistics, RasterOperation and RasterProcessingResult. The async RasterProvider supplies a
metadata catalog, coordinate sampling and validated operations. `lib/server/gis/rasterProvider.ts`
bridges the existing GIS provider; SpatialMap, Leaflet, MapRecipe, access checks and the local draft
store remain the integration points.

Metadata records CRS, native grid, resolution/unit, nominal spatial scale, selected band,
band kind/unit/encoding, NoData sentinel/mask, period, version and provenance. Band scale/offset
encode physical values (`physical = raw * scale + offset`); they differ from nominal spatial scale.
Degree pixels are reported in degrees. Runtime parsers validate inputs and whitelist responses,
removing uncontracted fields including full arrays and internal fields.

## Coordinate and value semantics

- API coordinates are `{x, y, crs}`: longitude/latitude for EPSG:4326, easting/northing in metres
  for EPSG:3857. Legacy latitude/longitude requests still work. Leaflet lat/lon order is explicitly
  converted. Only these two CRSs and north-up, pixel-area grids are supported locally.
- The grid origin is its upper-left outer corner; pixel size is positive x and negative y. West
  and north bounds are included; east and south bounds excluded. Indices are zero-based. Requested
  coordinates and native cell centers are distinct fields. Floating point errors at exact cell
  edges are snapped consistently; unsupported CRS and Mercator poles are rejected.
- Nearest returns one native cell. Bilinear reads up to four cell centers for continuous bands,
  propagating missing positive-weight neighbors. Categories require nearest; codes are labels,
  never interpolated quantities. Outside coverage, masked source cells, incomplete interpolation
  have explicit NoData reasons; unclassified point operations return masked results. Unknown
  provider category codes/labels are rejected; valid zero remains a measurement.
- Classification intervals are `[min, max)`, validated for overlaps. Continuous palette ranges
  clamp display colors; unknown categorical colors are transparent.
- Point comparisons warn about resolution/CRS differences. Arithmetic and overlay require matching
  CRS, native origin/resolution/dimensions and period. No implicit resampling occurs. An explicit
  future target-grid contract is parsed but execution currently returns unavailable.

## Genuinely functional locally

`GIS_DEMO_MODE=true` **and** `NODE_ENV=development` enable small synthetic grids near Jambi,
version `demo-v2`: rainfall 4×4 (0.05°), slope 20×20 (0.01°), land cover 40×40 (0.005°), soil
10×10 (0.02°). Each has a deliberate masked cell at row 1/column 1. Rainfall's daily_mean band
illustrates encoding (scale 1/365, mm/hari); it is not observed daily rainfall. Periods, classes
and values have no scientific authority.

| Capability | Local behavior |
| --- | --- |
| Pixel Inspector | Map clicks, keyboard center and manual lat/lon queries call the provider; display actual returned raw/physical values, band, class, cell/center, units, encoding, CRS/resolution, version, period and provenance. |
| Zonal statistics | Server-resolved fixture AOI; native cell-center selection; valid/NoData counts and min/max/mean for continuous bands; histogram for categories. Mean unweighted, NoData excluded. |
| Area/distance | Shared spherical approximation, radius 6,371,008.8 m; polygon holes subtracted. AOI area shows its method; workspace two-point distance shares the utility. Not survey/ellipsoidal precision. |
| Vector selection | Tested point-in-polygon and feature-ID selection utilities; outer boundaries included, holes/hole boundaries excluded. No new remote selection service. |
| Classification/normalization | Validated point operations, half-open classes and explicit calibration bounds; class codes cannot be normalized as continuous magnitudes. |
| Arithmetic | Point add/subtract/multiply/divide with raster or typed constant. Add/subtract require equal units; multiply/divide compose units. NoData propagates, division by zero masked. No eval/expression language. |
| Weighted overlay | Point result on matching continuous grids/units, validated weights summing to 1. No inferred weights or full raster output. |
| Clip/mask | Computed native window, band/grid/version, center rule and selected/valid/NoData counts. `artifact: null`: no GeoTIFF or masked raster file created. |

Local AOI execution is capped at 4,096 native cells before iteration. Nationwide rasters are never
loaded. Demo SVG tiles use a bounded 16×16 preview per tile with shared sampling/color helpers;
they are not scientific resampled products. Catalog previews were refreshed from the renderer.

## API and workspace integration

POST /api/gis/pixel accepts up to eight known datasets, optional selected bands and nearest/bilinear.
POST /api/gis/process accepts the operation union. Both enforce existing server-derived roles and
entitlements on every operand before querying. Bodies are bounded to 64 KiB; unknown keys, IDs
and operations rejected. Responses are private/no-store: invalid input 400, denied 403, invalid
provider response/failure 502, unavailable capability 503. Sampling has a five-second budget and
passes an AbortSignal; adapters must honor it.

MapRecipe schema 1 adds optional raster style.band; old recipes use the default band. Band selection
resets the physical style range; tile URL and legend use that band. Visibility/opacity/order,
local save/load/import/export and undo/redo remain. PDF metadata includes band kind/unit/encoding,
native grid, NoData, version and provenance. AHP/WLC, Flood, Copilot and JSON/PNG/PDF remain.
Processing summaries are transient, not persisted in recipes or exported as scientific reports.

## Awaiting real-data access

Earth Engine, PostGIS and GeoTIFF adapters are not implemented/configured here. Production
sampling/processing remains unavailable. Real catalog/tiles, arbitrary CRS/rotated grids,
cross-grid resampling, area-weighted/ellipsoidal statistics, full raster algebra and downloadable
clip/mask products await a separately authorized adapter/data task. Real processing needs bounded
windows or asynchronous jobs and enforceable time/cancellation budgets; Next maxDuration alone
is not a portable runtime timeout.

See [adapter contract](raster-real-data-adapter-contract.md), [Phase 03 evidence](phase-03-raster-report.md)
and [local review](local-review.md). No migrations, deployment, real credentials or billable jobs.
