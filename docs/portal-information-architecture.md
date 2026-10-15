# P4I geospatial portal

P4I Spatial Analytics is the GIS vertical of P4I Consultant, owned by Yayasan P4I.
Navigation takes inspiration from professional national geoportal information architecture,
without reusing INA-Geoportal branding, artwork, images, or an exact layout.

| Route               | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `/spatial/home`     | Portal entry, workspace shortcuts and featured maps                        |
| `/spatial/webmap`   | Searchable thematic map recipes                                            |
| `/spatial/data`     | Search/filter dataset metadata and inspect provenance                      |
| `/spatial/viewer`   | Map builder, layers, pixel inspection, Copilot and exports                 |
| `/spatial/analysis` | Workspace opened on existing AHP/flood panels                              |
| `/spatial/ai`       | Workspace opened on Copilot                                                |
| `/spatial/help`     | Local help cards; final PDF documentation can be linked later              |
| `/spatial`          | Preserved original project viewer, entitlements, lead capture and analysis |

The original `/spatial` route keeps its behavior so existing client-portal links work. A visible
link opens the new portal. A route group adds shared left navigation/top bar without wrapping
or breaking the original fullscreen viewer. Desktop uses compact persistent navigation and a
map/context panel. Mobile has a navigation toggle and stacks the map above its scrollable panel.
Cards use P4I's teal/slate visual language. Account links reuse existing authentication.

Webmaps are declarative configurations, not validated analytical results. Current example
datasets are synthetic and labeled. Unconfigured production catalogs show definitions as
unavailable and data endpoints refuse fixture access. Public fixture GeoJSON is downloadable
only in explicit development demo mode. Restricted production downloads remain behind existing
server authorization. Raster downloads, real metadata URLs and final thumbnails await providers.

See [local review](local-review.md) and [map builder](map-builder-architecture.md).
