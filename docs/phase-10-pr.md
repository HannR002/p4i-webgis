# Phase 10: cumulative Phase 01–09 integration audit — DO NOT MERGE YET

**Recommendation: NO-GO merge while dependency advisories remain unresolved; NO-GO production.**
This cumulative PR targets main and preserves the complete existing Phase09 ancestry (18 ahead,
zero behind at audit). No cherry-pick/rebase/duplicate phase commits. Existing stacked draft PRs
#1–#5 remain intact; after remediation and review, prefer an ordinary ancestry-preserving merge.

The audit found a service-role download-history metadata leak after entitlement revocation.
The API now rechecks project access and returns private/no-store responses; five regression tests
cover revoked access, missing projects, staff, authentication and provider failure. Two historical
browser scripts were updated for current catalog/Copilot/NoData/advisory-CR behavior. No new product
features, dependencies or migrations were introduced by Phase10.

Verification: clean npm ci; baseline 257 tests; final lint/typecheck/build and 262 tests/37 files;
nine browser suites, 39 Axe audits with no detected violations, 12 local production isolation/rate
checks, and two fresh local PostGIS/PostgREST replays totaling 340 checks. Initial QA failures and
security regression failures are documented, not hidden. No external database or paid service use.

**Open blocker:** npm audit reports 22 affected packages (3 critical/15 high); production-only audit
reports 12 (1 critical/8 high). Exploitability is not asserted. Review compatible upgrades/triage;
do not blindly apply the suggested breaking Earth Engine downgrade. Functional passes are not a waiver.

Read [integration/security audit](PHASE_10_INTEGRATION_AUDIT.md) and
[current evidence](evidence/phase-10/verification-summary.json). Public repository history scan found
no real secret candidate within its documented scope. Live foundation DDL, real GIS/AI/GEE adapters,
durable persistence, upload/abuse controls, hosting and human UAT remain production gates.
No deployment, visibility change, merge, external migration or actual client publication occurred.
