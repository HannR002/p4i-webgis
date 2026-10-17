# Phase 13 evidence

These are actual local test results from Node 22.23.3 on 17 October 2026. All model inference tests use injected mocks; no Gemini/GEE inference or database mutation occurred. Logs use synthetic local settings.

- `verification-summary.json`: final aggregate and honest initial failures/corrections.
- `browser-exits.txt`: initial heading-order failure plus successful recheck; all final suites passed.
- `phase-13-vector-editor-final-results.json`: six browser workflows and four scoped Axe audits.
- `phase-09-readiness-production-isolation.json`: 12 local API checks.
- `phase-11-framework-framework-checks.json`: three image checks.
- `phase-12-isolation-isolation.json`: runtime/build dependency isolation.
- `google-*.json`: official public documentation excerpts, not account verification or inference evidence.
- `exports.json`: hashes/sizes of generated PNG/PDF downloads. PDF is omitted from Git to avoid a 7.5 MB binary.
- `editor-*.png`, `synthetic-map-export.png`, `synthetic-vector.geojson`: actual synthetic browser artifacts, safe for review/download.

The new QA harness originally assumed an SVG renderer and a nonexistent route/button label; it was corrected to the actual Canvas renderer and workspace controls. The product heading order and textarea accessible labels were also corrected before final passing checks. Historical Phase 01–12 evidence is unchanged.
