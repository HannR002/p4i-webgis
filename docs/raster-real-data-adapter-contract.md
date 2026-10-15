# Real-data raster adapter contract

Phase 03 provides the boundary below; it does not configure or implement a real Earth Engine,
PostGIS or GeoTIFF adapter. `getRasterProvider()` currently selects a local development fixture
bridge or an unavailable provider. A real adapter needs a server registry plus catalog/tile
integration; an SDK call in the UI is insufficient.

```ts
interface RasterProvider {
  id: string;
  mode: 'demo' | 'available' | 'unavailable';
  catalog(): readonly Dataset[];
  samplePixel(request: {
    datasetId: string;
    band?: string;
    coordinate: RasterCoordinate;
    resampling: 'nearest' | 'bilinear';
    signal?: AbortSignal;
  }): Promise<ServiceResult<PixelSample>>;
  execute(operation: RasterOperation): Promise<RasterProcessingResult>;
}
```

The authoritative types are in `lib/gis/contracts.ts`; this sketch describes the boundary.

## Catalog and sampling requirements

1. Register immutable, server-approved dataset/band IDs and access levels. Resolve real AOI IDs to
   authoritative server geometry. Reuse server role/entitlement checks for every operand before
   querying. Never accept roles, credentials, arbitrary source URLs, SQL, SDK objects or expression
   code from a MapRecipe/client request.
2. Return validated CRS, north-up native grid, pixel resolution/unit, nominal spatial scale,
   raw-to-physical band scale/offset, categories or continuous range, sentinel/mask semantics,
   period/version and authoritative source/license/provenance. Current code accepts only
   EPSG:4326/3857 pixel-area grids; other projections/rotated grids require an explicit extension
   with transformation tests. Degree pixel sizes cannot be reported as metres.
3. Sample the coordinate in its stated CRS/axis order. Return requested geographic location,
   native cell index/center, actual method, raw/physical values, unit, selected band and version.
   Never use tile colors or invented fallback values as measurements. Nearest category samples
   must map to documented labels. If the service cannot supply declared cell/method/encoding,
   return unavailable or explicitly extend the contract rather than inventing raw data.
4. Represent NoData with null values and reasons; zero is valid. Bilinear continuous samples
   propagate contributing masks and identify the interpolated raw/physical result.
5. Read one point or a bounded server window. Keep secrets, tokens, raster arrays and SDK objects
   outside responses/UI. `checkedSample` enforces metadata/value/cell consistency, whitelists fields
   and has a five-second timeout with AbortSignal. Honor it in network/SDK calls and cap concurrency
   and response size. Translate outages to safe provider errors. No production fixture fallback.

## Processing and artifacts

RasterOperation is an allowlisted union. `parseRasterOperation` validates coordinates, operands,
classes, constants, weights and explicit alignment. `parseProcessingResult` validates and strips
uncontracted fields. A real adapter must also validate result provenance against actual operation
inputs and resolved metadata.

Report native cell-center/unweighted statistics as that method. Categories return counts/histograms,
never code averages. Count masked cells separately; empty sets have null aggregates. Scientific
weighting and area method must be explicit. The current statistics contract accepts spherical AOI
area; other methods need a contract extension rather than mislabeling.

Cross-grid work requires a declared target CRS/grid/method, matching temporal intent and class-safe
resampling. Local execution rejects mismatched native grids and returns unavailable for explicit
resample plans. The browser never harmonizes arrays. The local 4,096-cell ceiling is a fixture guard,
not authorization for unlimited remote work.

Clip/mask currently returns a window/mask descriptor with `artifact: null`. Real artifacts need a
separately designed authorized, bounded job/download contract, lifecycle, NoData mask, native grid,
source band/version and provenance. No arbitrary client URL. `execute()` currently has no job queue
or general cancellation parameter: introduce enforceable processing budgets/cancellation before
heavy real execution. Next `maxDuration` alone is not a portable runtime timeout.

## Request examples

Public fixture examples work only in development demo mode. Replace them with approved real
catalog IDs when adding an adapter. The daily_mean band is a synthetic encoding demonstration.

Submit to `/api/gis/pixel`:

```json
{
  "datasetIds": ["demo-rainfall"],
  "coordinate": {"x": 103.545, "y": -1.625, "crs": "EPSG:4326"},
  "bands": {"demo-rainfall": "daily_mean"},
  "resampling": "nearest"
}
```

Existing callers can use latitude/longitude instead of coordinate. Projected requests use
EPSG:3857 and actual transformed metre coordinates; do not relabel longitude/latitude as metres.

Submit to `/api/gis/process`:

```json
{
  "operation": "zonal-statistics",
  "datasetId": "demo-rainfall",
  "band": "daily_mean",
  "aoiId": "demo-aoi-west"
}
```

```json
{
  "operation": "arithmetic",
  "left": {"datasetId": "demo-rainfall", "band": "rainfall"},
  "right": {"constant": 2, "unit": "1"},
  "operator": "divide",
  "coordinate": {"x": 103.545, "y": -1.625, "crs": "EPSG:4326"},
  "alignment": {"mode": "native-only"}
}
```

Arithmetic produces one point result, not a new raster.

## Future adapter acceptance

Reuse rasterEngine, rasterProvider and rasterRoutes test suites. Add authoritative expected
cell/value, scale/offset and mask fixtures; test both CRSs, edges/centers, categories, permission
denial before network access, malformed DTOs, cancellation/outages, resolution/period mismatch
and unconfigured production refusal. Verify selected-band legend/draft/export against metadata.
Real accuracy needs authorized staging data and reference values; synthetic tests alone cannot
establish it. No real credentials or paid computation are needed for the current local suite.
