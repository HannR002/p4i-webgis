# Real GIS and AI integration readiness — Phase 09

15 October 2026, Asia/Jakarta. This is an integration runbook, not authorization to upload,
run billable services, publish client data or deploy. No real P4I dataset was supplied.

## Boundary and soil handover

P4I must supply authoritative source files or approved staging asset references, custodians,
version/date, geographic scope, field/code hierarchy, CRS/PRJ, license and redistribution rights.
For soil, additionally supply band names, units, survey period, native grid/scale/offset, class
legend, NoData mask/sentinel and the intended meaning of any susceptibility mapping. No soil
asset ID, official classes or official thresholds are invented by this implementation.

A bounded local dry-run now supports GeoJSON with explicit `EPSG:4326` or `EPSG:3857`, and one
zipped SHP dataset with matching DBF and a valid PRJ accepted by proj4. Other GeoJSON projections
must be converted offline (for example with GDAL) with a documented CRS decision. Do not change
a CRS label without transforming coordinates. SHP PRJ transforms use proj4 through shpjs; invalid
PRJ is rejected before shpjs can silently ignore it. Coordinates are 2D XY/longitude-latitude in
the result, Polygon is normalized to MultiPolygon, and holes/multipart rings are preserved.

```sh
npm run import:boundaries -- \
  --input=/approved/local/boundaries.geojson --level=provinsi \
  --source=P4I --source-version=OWNER_SUPPLIED_VERSION \
  --source-crs=EPSG:4326 --code-field=kode --name-field=nama \
  --license=OWNER_SUPPLIED_USAGE_TERMS --report=/tmp/p4i-import-report.json
```

For ZIP use `--source-crs=prj`; for kota/kecamatan also specify `--parent-code-field=kode_parent`.
Do not run this example against a missing or invented source file. Tests use synthetic files only.
The report contains input SHA256, source/version/license declaration, source/target CRS, feature
and coordinate counts, random batch ID and `STRUCTURAL_ONLY_POSTGIS_TOPOLOGY_REVIEW_REQUIRED`.
No feature attributes/geometry or credentials are dumped into the dry-run report.

Local caps: 32 MiB input before file read, 64 MiB total expanded ZIP, 100 ZIP members, 5,000
features, 250,000 coordinates, PRJ at most 16 KiB. ZIP64/split/encrypted archives, path traversal,
CRC/size mismatch and excessive inflation are refused. ZIP decompression is bounded using Node
22 zlib; no files are extracted. Limits are engineering containment, not measured national-scale
capacity. JSON/SHP parsing still allocates an in-memory bounded batch; split large sources offline.

Closed, finite, nondegenerate rings and geographic bounds are checked locally. Self-intersections,
hole containment, polygon overlap and administrative parent consistency require PostGIS review.
No local “valid” label implies topological correctness. Future authorized staging procedure:

1. Complete Phase 08 verified foundation and target authorization gates.
2. Inspect the dry-run report, provenance and projection against known control points.
3. Only with upload authorization, add `--execute --confirm=STAGE_BOUNDARIES
   --environment=staging --target-host=<configured hostname>`. Flags are operator safeguards,
   not proof that organizational permission exists. No execute command ran in this phase.
4. Inserts use 200-row batches into import staging. A failed insert reports batch ID/offset;
   earlier batches may exist. Do not rerun blindly or claim an atomic import. Inspect only that
   batch and arrange authorized cleanup/retry. Nothing promotes automatically.
5. Review `ST_IsValidDetail`, SRID, feature counts, extent, duplicate source codes and parent links.
   Compare `ST_MakeValid` changes before invoking historical promotion, which may repair topology.
   Retain original input hash and the provenance in staged raw properties; promotion currently
   carries source/version but does not preserve the full raw provenance in the canonical table.
6. Approve publication of public boundaries separately. National upload is not authorized here.

The existing PostGIS viewport RPC uses a GiST bbox/intersection filter, level, public flag,
topology-preserving simplification and a 1,500-row cap. SpatialMap uses provinsi at zoom ≤5,
kota at ≤8, then kecamatan, with progressively finer tolerance. The API now caps viewport area
in square degrees (64,800 / 400 / 25 respectively) and minimum tolerance (0.005 / 0.001 / 0.0001).
The cap is a conservative request envelope, not a scientific area measure. The API returns 400
for oversized/unsimplified requests, plus process-local 120 requests/minute and 8 concurrent
requests. Existing cache headers are 30 seconds + 60 seconds stale-while-revalidate. Real database
query plans, payload sizes, cold/warm latency and tile strategy remain to be benchmarked.

## Earth Engine operation mapping

The server Node SDK and historical flood graph exist. Phase 09 blocks the legacy endpoint,
service and initializer before any DB/credential/auth/compute operation because they lacked the
Phase 06 governed job adapter. An authenticated valid legacy request returns 503/unavailable;
unauthenticated requests retain 401. Credentials or a client confirmation cannot enable it.
This prevents a real-cost bypass; it does not remove the Flood UI/configuration foundation.

`lib/gis/externalDataRequirements.ts` contains typed onboarding source requirements reusing
RasterBand fields. It deliberately does not fabricate a native RasterGrid or register those
sources as an available data catalog. Use the provider's actual projection transform, coverage,
mask and metadata before constructing an existing RasterDataset/RasterMetadata object.

| Source | Existing/prepared semantics | Still to verify |
|---|---|---|
| CHIRPS `UCSB-CHG/CHIRPS/DAILY`, precipitation | mm/day; inclusive period → exclusive next-day end; sum produces period mm; native 0.05° | Daily completeness, native grid/coverage, license/attribution and missing observation policy |
| SRTM `USGS/SRTMGL1_003`, elevation | Metres; terrain slope derived in degrees; nominal 1 arc-second; 2000 epoch | Voids, actual projection/resolution/coverage and suitability or approved replacement DEM |
| ESA WorldCover v200, Map | Categorical 2021 product, nominal 10 m; nearest only; codes explicitly mapped | Exact native grid, mask, source terms and acceptable age for requested project |
| P4I soil | Asset/band/grid/classes/period/rights unknown | Owner data and class meaning; existing 1–4 susceptibility mapping remains experimental |

| Requested capability | Current code | Production adapter requirement |
|---|---|---|
| Tiles/flood visualization | Historical `getMapId` graph and existing map tile display | Governed job, approved asset IDs, short-lived result access, tile renewal/revocation and no token logging |
| AOI clipping | Existing `.clip(aoi)` graph; local RasterOperation clip contract | Resolve authorized server AOI geometry, complexity/area limit and explicit target grid |
| Pixel sample | Existing async RasterProvider/PixelSample contract, actual DEMO sampling | GEE adapter must return native raw/physical values, NoData mask, CRS/resolution/period/version and cell semantics |
| Zonal statistics | Local native-center statistics; historical flood `reduceRegion` | Authorized scale/CRS/reducer, valid/NoData counts, category histogram instead of mean class code |
| Weighted overlay | Local validated weighted overlay; historical four-source WLC graph | Align grid/CRS explicitly, continuous resampling choice, nearest categories, common valid mask, validated weights |
| Flood susceptibility | Experimental thresholds/configuration/legacy graph | Governed adapter and data access; no claim of official scientific accuracy |

The prepared legacy reduction now uses explicit EPSG:4326, scale 250 m, `bestEffort:false`,
maxPixels 1,000,000 and tileScale 4; model version is bumped to avoid reusing old cache semantics.
This is an engineering limit, not a validated analytical scale. Upsampling CHIRPS never creates
250 m rainfall detail. The legacy graph is **not sufficient** for production: common-mask
statistics, native projection inspection, missing-date coverage and integration into RasterProvider
are pending. Null/empty/boolean/string results no longer become zero; invalid [0,1] values or
categorical histograms fail instead of silently clamping/fabricating measurements.

Before actual GEE analysis, the owner must establish commercial registration appropriate to paid
P4I consulting, Cloud project/IAM/service-account asset access, current billing terms and ceilings,
data terms, durable jobs/usage/approval and provider cancellation/recovery. Do not assume a
noncommercial registration covers paid consulting, that a configured binding proves access, or
that an HTTP timeout cancels GEE work. No registration, billing activation, credential test or
external analysis was executed. Reference documentation (not legal/billing verification):

- https://developers.google.com/earth-engine/guides/access
- https://developers.google.com/earth-engine/guides/commercial_noncommercial
- https://cloud.google.com/earth-engine/pricing
- Official source catalog links in `externalDataRequirements.ts`.

## AI readiness

No LLM vendor/model/paid endpoint was selected. The running factory returns DEMO only when
explicitly permitted by development mode; an explicit `AI_PROVIDER=real`, unknown name or disabled
selection returns unavailable instead of falling back to fixtures. Production DEMO remains refused.

`createStructuredAIProvider` is a tested server-only integration seam implementing the existing
AIProvider interface. A future approved transport receives the authorized planning context,
immutable GIS Tool Registry, system constraints, byte/time limits and AbortSignal. Output must
pass the existing plan validator; execution still rechecks ACL, dataset/AOI IDs, arguments,
results and approval policy through the existing executor. No model-supplied role or tool can
approve/publish. A trusted binding requires provider/model identity, authorization reference and
approved processing scope. This interface is not a connected HTTP provider.

The adapter records only provider/model, elapsed time, outcome and provider-returned token counts
(or null); cost remains UNKNOWN. It does not log prompts, map geometry, credentials or private
provider error text. Missing usage persistence fails the request closed. Tests inject a local
transport; there is no real pricing/billing ledger. Future HTTP transport must enforce stream
byte limits before JSON parsing, exact HTTPS destination/redirect policy, timeout/cancellation,
server-only secrets, approved retention/region/subprocessor terms and durable usage/budget
reservation. A failed real request must remain failed; there is no fallback to fabricated output.

Per-process Copilot containment is 60 requests/minute, 4 concurrent requests, existing 64 KiB
request/128 KiB planning/256 KiB response envelopes, plus registry/compute limits. These are not
per-client commercial quotas or distributed abuse protection. Configure trusted edge rate limits,
tenant budgets and durable accounting before production.
