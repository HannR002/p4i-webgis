# Yayasan P4I — acceptance matrix, Phase 09

15 October 2026 (Asia/Jakarta). **Human UAT has not been conducted or accepted.** Automated
engineering tests are listed separately; they are not interviews, usability research, acceptance
signatures or scientific accuracy evidence. Use synthetic data until authorized real staging exists.

For every case record tester/role, target/build, date, dataset/config version, steps, observed
result, evidence, defect ID and PASS/FAIL/BLOCKED. Only the appointed Yayasan P4I representative
may accept business suitability. Reviewer access requires explicit project grants; super_admin
alone is not evidence of professional qualification.

| ID | Actor and scenario | Expected acceptance result | Engineering evidence / remaining dependency | Human result |
|---|---|---|---|---|
| U01 | Visitor opens Home/Webmap/Data/Help | Search/filter, readable provenance and correct availability; working View Map | Existing portal browser suite; real catalog pending | NOT_RUN |
| U02 | Visitor uses mobile/keyboard | No overlapping controls; focus/menu/escape/tabs usable | Automated responsive/Axe checks; manual assistive technology pending | NOT_RUN |
| U03 | Visitor requests restricted project/private deliverable | Denied without leaking content/identity | Unit/HTTP + Phase08 synthetic direct PostgREST | NOT_RUN |
| U04 | B2B A signs in and views entitled A | Valid session, correct stored role, public + A only | Real Supabase account/session/staging prerequisites missing | BLOCKED |
| U05 | B2B B requests A; A entitlement revoked | B denied; A loses future restricted access/download | Synthetic PostgREST and consulting tests; real accounts pending | BLOCKED |
| U06 | Managerial analyst opens/creates project and map | Authorized project operations; no entitlement/user-role administration | Server guards tested; real project creation not exercised externally | BLOCKED |
| U07 | Super admin manages roles/entitlements/audit | Authorized action logged; metadata cannot elevate role; no automatic scientific reviewer role | Unit + synthetic SQL audit tests; real admin UAT pending | BLOCKED |
| U08 | Analyst creates map from catalog | Layer order/opacity/style/legend/AOI, draft save/load and Undo/Redo work | DEMO browser; authoritative catalog/AOI pending | NOT_RUN |
| U09 | Analyst imports boundary SHP/GeoJSON | Correct CRS/control points/Multipart/holes; topology reviewed; licensed provenance retained | Synthetic transformed SHP/GeoJSON tests; actual P4I handover pending | BLOCKED |
| U10 | User inspects pixel and NoData | Provider value matches authoritative reference, correct band/unit/time/grid; NoData displayed | DEMO native values tested; real raster reference missing | BLOCKED |
| U11 | User asks AI to make a map | Only authorized known datasets/AOIs; preview or reversible changes; no invented locations | DEMO browser + injected structured transport tests; approved LLM pending | NOT_RUN |
| U12 | User requests local AHP/WLC/GIS analysis | Valid weights/CR, bounded deterministic result, visible assumptions/provenance | Local engine/browser tests; no scientific accuracy claim | NOT_RUN |
| U13 | User requests expensive/unknown-cost analysis | Explicit expiring approval for available operations; unavailable remains unavailable | Local 1600-cell approval/UNKNOWN flood browser tests | NOT_RUN |
| U14 | User cancels/retries; provider fails | No late map overwrite, bounded retry, no fabricated fallback | Local tests; real provider cancellation/recovery pending | NOT_RUN |
| U15 | Analyst prepares report | Map/legend/config/source/period/limits, DEMO/experimental labels, no invented approval | DEMO actual PDF/PNG/JSON downloads inspected | NOT_RUN |
| U16 | Assigned reviewer requests changes then approves exact revision | Comments/checks retained, independent authorized review, new revision needs new approval | Phase07 browser/HTTP service tests | NOT_RUN |
| U17 | Authorized publisher releases to client | Exact approved immutable revision; no AI publication; other clients/unpublished revisions hidden | Development simulation only; durable real release adapter pending | BLOCKED |
| U18 | Client downloads released report | Entitled published revision only; safe file, private cache policy and correct metadata | DEMO PDF/JSON tests; official client release pending | BLOCKED |
| U19 | Operations verifies restart/load/backup restore | Jobs/approvals survive correctly; quotas, backups, incident response demonstrated | Process-local persistence does not meet criterion | BLOCKED |
| U20 | P4I accepts commercial/data/privacy terms | Approved provider/data rights, retention and spending scope documented | Requires owner/legal/business decisions; no evidence fabricated | BLOCKED |

Recommended sessions: (1) local DEMO product walkthrough U01–03/U08/U11–16, clearly labeled;
(2) authorized staging integration with real source reference points and separate synthetic user
accounts; (3) operational/security recovery and formal business acceptance. Production remains
blocked until required real-data, authorization and recovery cases pass with recorded human results.
Scientific methodology validation/ranking is out of scope; deliverable completeness, interpretation,
authorized release and professional quality remain valid reviewer responsibilities.
