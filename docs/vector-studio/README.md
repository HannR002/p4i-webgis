# Vector Map Studio — ArcGIS results and reviewed AI composition

This change follows the owner's clarified workflow: ArcGIS performs overlay/scoring; the website displays the resulting vector data and helps users compose another map. It does not recalculate WLC/AHP, fabricate geography, or sample scientific values from basemap image pixels.

## Run

Use Node.js 22.23.3 or a newer supported 22.x patch, matching the current repository engine contract. Install from the lockfile with `npm ci --ignore-scripts`, then `npm run dev`. Open `/spatial/studio` on the same machine. No production database or model is required for local vector composition. The Studio link is available in normal portal navigation; academic synthetic-only previews continue to reject this real-file workflow.

1. In ArcGIS, prepare the final geometry and attributes. Prefer GeoJSON FeatureCollection exported/projected to WGS84. Esri JSON is a different format.
2. Alternatively select one ZIP containing `.shp`, `.shx`, `.dbf`, `.prj` at the root, or select those components together (+`.cpg` if needed). A bare `.shp` is insufficient.
3. Enter the data origin and actual license/permission status. The ArcGIS checkbox records the user's declaration; it does not authenticate the source.
4. Import. Parsing runs in a dedicated worker. No source file is sent to the application backend or a model.
5. Select a layer, inspect attributes, change its name/color/opacity/order, and optionally filter its attributes using reviewed local rules or a configured model.
6. Save an immutable snapshot in browser IndexedDB, or download a portable `.p4imap.json` document. Browser storage is not a shared project database. Restore does not imply publication.
7. Export visible/filtered features as GeoJSON with source file SHA-256, CRS, permission notes, styles and basemap attribution. The original source geometry/attribute values are retained.

GeoJSON supports Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon and GeometryCollection; null geometry rows are retained but not drawn. The schema validates coordinates, ring closure, metadata, file hashes and limits, not full geographic topology. Fix invalid geometry in ArcGIS before publishing. SHP import is independently tested with generated binary fixtures, stored/deflated ZIP and a known UTM projection reference. Layer files/project layout (`.lyrx`, `.aprx`), M values, renderer categories, label rules and cartographic layouts are not automatically transferred by a shapefile.

## Basemap and “pixel” behavior

All user data layers are vectors. The optional OpenStreetMap Standard basemap is a raster image tile backdrop, not a scientific raster dataset. It is off by default, labelled, visibly attributed and requested only for the viewport. Source/license information is preserved in exports. No bulk/offline tile download is provided. Clicking the background reports coordinates, not building/soil/flood attributes extracted from its color. Vector features expose attributes from their actual input data.

If the requirement becomes an entirely vector basemap, MapLibre with an approved OSM-derived vector tile service is a later bounded change. OSM vector tiles exist, but a tile view is not an unrestricted authoritative dataset for every variable in the world. A global-data ingestion/query feature needs explicit source, theme, coverage, license and scale decisions.

## AI model integration

Two distinct engines are labelled:

- **Rules, not LLM:** local, deterministic commands such as `judul: Peta Program`, `warna: #146b70`, `fokus`, `filter: status = aktif`, `hapus filter`, `sembunyikan`, `tampilkan`.
- **Ollama model:** optional server-side integration with schema-constrained output, input/output limits, cancellation, fixed loopback endpoint, authenticated active users, origin checks and per-process request containment. Geometry and row data are not sent. Metadata consent is required. Requests produce a proposal; an independent reducer validates it against the current document revision and available layer IDs/fields before the user applies it. No arbitrary SQL/code/URLs, geometry creation, overlay, score computation or publication actions are allowed.

No model or paid service was activated during implementation. To use a local model, an operator must already have Ollama and a suitable installed model on the same server as Node. Start the Ollama daemon with `OLLAMA_NO_CLOUD=1` (this is a daemon setting, not proof supplied by the web app). Configure only after checking local hardware, model license and authentication:

```dotenv
VECTOR_STUDIO_AI_PROVIDER=ollama
VECTOR_STUDIO_AI_ENABLED=true
VECTOR_STUDIO_AI_MODEL=<installed-local-model-name>
VECTOR_STUDIO_AI_LOCAL_ONLY_ACK=true
```

Do not select cloud aliases or assume an API subscription follows from ChatGPT Plus. The disabled defaults in `.env.example` do not make any calls or download models. A local loopback address and an operator acknowledgement alone cannot attest daemon billing/privacy settings. Actual model inference, response quality, latency and resource requirements remain unverified. Hosting a model on the existing Hostinger plan is not assumed feasible. A hosted API provider is a separate configuration/data-processing/cost decision; no keys belong in client components.

## Limits and evidence

10 MiB input per package; ZIP actual decompression capped at 25 MiB with size/CRC checks; worker 15-second limit; up to 8 layers, 10,000 total features and 150,000 vertices per layer; 20 browser snapshots without silent deletion. These are containment limits, not measured performance/SLA guarantees. Large datasets should later use approved server-side import, PostGIS and vector tiling.

49 new tests cover geometry/metadata, actual shapefile parsing, projection, ZIP resource declarations, source-preserving composition, snapshot adapter via fake-indexeddb, mocked model contracts, route guards, initial server-rendered UI and the combined import/save/export lifecycle. Browser E2E, real IndexedDB in a browser, real source files from P4I, real model inference and shared project persistence remain unverified. Model transport tests do not prove AI quality. Full regression and HTTP/build results are documented in the accompanying audit evidence.

No merge, production database mutation, destructive migration, deployment, GEE/paid AI activation or GitHub Actions unlock is part of this change. Legacy AHP/raster modules remain available in their previous routes; they are not part of the new Studio's workflow.

## Key files

- `lib/gis/studio/model.ts`: vector document/source schema, validation and provenance export.
- `lib/gis/studio/import.ts`, `shapefileBounds.ts`, `import.worker.ts`: bounded file decoding, projection and hashing.
- `lib/gis/studio/plans.ts`: safe presentation actions and independent proposal application.
- `lib/gis/studio/storage.ts`: immutable local snapshots and separate lightweight summary index.
- `components/gis/studio/`: vector UI, map and attributes.
- `app/api/gis/studio-plan/route.ts`, `lib/server/ai/studio/ollama.ts`: optional authenticated model adapter.

## Primary references

- Node.js runtime: https://nodejs.org/en/about
- GeoJSON/WGS84: https://www.rfc-editor.org/info/rfc7946/
- Shapefile components: https://doc.esri.com/en/arcgis-enterprise/latest/share/shapefiles.html
- ArcGIS Features To JSON: https://pro.arcgis.com/en/pro-app/latest/tool-reference/conversion/features-to-json.htm
- shpjs API: https://github.com/calvinmetcalf/shapefile-js
- Leaflet 1.9.4: https://leafletjs.com/reference-1.9.4.html
- OSM tile policy: https://operations.osmfoundation.org/policies/tiles/
- OSM vector tile policy: https://operations.osmfoundation.org/policies/vector/
- Ollama generate/schema: https://docs.ollama.com/api/generate
- Ollama cloud-disable setting: https://github.com/ollama/ollama/blob/main/docs/faq.mdx
