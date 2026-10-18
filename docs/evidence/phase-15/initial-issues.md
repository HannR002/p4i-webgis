# Initial local verification issues and final disposition

- PostgreSQL readiness initially observed the temporary initialization server; readiness now targets TCP and the final server.
- First SQL integration run: 1 passed / 11 failed after a PL/pgSQL alias ambiguity. Qualified JSON aliases fixed the root cause.
- Subsequent SQL run: 11 passed / 1 failed because anonymous denial correctly returned 401 rather than the test's expected 403. Assertion corrected.
- One overlapping local fixture restart caused a setup attempt before the state file existed; final DB verification used a completed fresh fixture and passed all 14 cases.
- Same-project selection cleared its layer list without changing the effect dependency; the event now resets only on an actual project change.
- Code/security review added explicit null-operation refusal, optional JSON type checks, role-bound entitlement checks and a delayed-save identity guard. Direct RPC and real browser regressions passed.
- A stale Phase 14 local production server initially caused 404 for the new endpoint; it was stopped and the current build passed all seven boundary checks.
- Initial Phase 03 browser run timed out during development hot reload; complete stable rerun passed, including native statistics, NoData, exports and accessibility.
- An intermediate diagnostic build was interrupted; the reported final build uses explicit dummy local bindings and passed.

No failed/aborted run is counted as passed. No external DB migration or production deployment occurred.
