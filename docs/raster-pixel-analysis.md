# Raster and pixel architecture

Vectors describe Point, LineString, Polygon and MultiPolygon features. Rasters describe a grid
with bands, cell resolution, CRS, units, period, NoData and resampling semantics. The catalog
supports both; full raster arrays never enter browser state.

RasterDataset, RasterLayer, RasterMetadata, RasterBand, RasterStyle, PixelSample and RasterStatistics
are provider-neutral contracts. Earth Engine objects stay outside UI/domain contracts. Metadata
includes source, license, version, classification, coverage and provenance. Degree resolution is
reported as degrees, not silently claimed as metre scale.

`GisDataProvider` supplies catalog, vectors and samples. Production currently returns typed
unavailable states, never invented measurements. Development requires `GIS_DEMO_MODE=true` AND
`NODE_ENV=development`; query parameters cannot enable it. Tests verify production isolation.

Synthetic grids cover a small rectangle near Jambi: rainfall 0.05°, slope 0.01°, land cover 0.005°,
soil 0.02°. Sampling is deterministic within each native synthetic cell. Outside coverage returns
null/NoData, never zero. Period/version have no scientific significance. Categories have explicit
labels and nearest resampling. Continuous data declares bilinear as its intended real-adapter
display method. The demo preview deliberately uses a generalized 16×16 grid per display tile,
not a scientific resampled product; the legend states this. Pixel Inspector independently samples
native cells and reports location, value, unit/class, source, band, version, CRS, resolution,
period, method and provenance.

`POST /api/gis/pixel` validates finite coordinates and at most eight known dataset IDs, checks
server permissions and returns no-store responses. SVG tile paths bound zoom/coordinates/colors;
each tile is a fixed small set of safe rectangles. No user code or arbitrary URLs are evaluated.

`RasterOperation` whitelists sampling, zonal statistics, clipping, reclassification, normalization
and weighted overlay; `RasterAnalysisService` describes the future service boundary. Only fixture
sampling/visualization are currently implemented. Other operations, masking, slope generation and
remote flood products are explicitly unavailable, not fake scores. No free-form raster calculator.

A future Earth Engine adapter must keep credentials/objects server-side and retrieve authoritative
AOIs by identity. Record scale/CRS, dataset/model versions, immutable period and method. Mixed grids
need explicit harmonization; different pixels are not automatically equivalent. Continuous global
calibration differs from categorical susceptibility lookup; never min-max normalize class codes.
Propagate NoData masks. Soil legend, rainfall thresholds, slope direction, weights and calibration
remain `TODO(P4I-GIS-VALIDATION)`. Heavy computation belongs outside Hostinger RAM/CPU.
