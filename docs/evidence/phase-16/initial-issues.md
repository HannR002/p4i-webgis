# Initial failures and corrections

- First SQL run: ambiguous PL/pgSQL `value` identifier. Renamed measurement variable and qualified JSON array values; preserved `postgis-initial.log`.
- Initial correctness cases used a remote point outside the intentional one-degree extent. Moved the synthetic point inside the permitted region; the extent restriction was retained. Buffer area comparison now uses the documented 32-gon approximation rather than an exact circle. Independent radius and ellipsoid checks remain.
- Initial Copilot browser execution rejected the new output kind. Added it to existing strict result validation and added a full planner/executor/response regression test.
- First browser overlay check waited for visibility of a zero-size Leaflet pane container. Changed it to verify the attached pane and its visible actual renderer.
- Initial panel layout had inline controls. Added scoped layout/spacing and repeated desktop/mobile Axe/overflow checks in the final suite.

Final passes are recorded separately in verification-summary.json; exploratory failed logs are retained.
