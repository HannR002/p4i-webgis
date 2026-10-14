# Phase 07: GIS consulting deliverables, independent review and client release

Analysts can now create versioned reports from the existing MapRecipe, attach owned
Phase 06 analysis results, request independent review and simulate releasing an approved
revision only to the entitled DEMO client. Revision changes preserve prior published
snapshots. Reviewer and publisher grants are explicit; AI can prepare drafts and cannot
approve or release. Admin identity alone confers no professional review authority.

The existing portal/Map Workspace/Copilot gain entry points to one consulting UI. Server
workflow/DTO/download checks isolate projects, omit drafts and internal notes from client
responses, bind decisions to immutable revision hashes, reject stale writes and provide
real PDF/JSON report downloads with status, provenance, map context, configuration and
limitations. Existing GIS, project management, admin/audit and export functionality remain.

## Validation

- Phase 06 baseline at `0481801`: lint/typecheck/build and 209 tests/30 files pass.
- Phase 07: lint/typecheck/tests/build; 226 tests/32 files, including 17 new tests.
- Chromium full draft/Copilot/actual compute attachment/revision request/approval/simulated
  release/client workflow; real redacted PDF/JSON downloads; published revision retention.
- Client/project and anonymous-room isolation; no implicit admin review grant; no AI approval.
- Desktop/390px/768px responsive checks and three WCAG AA audits; zero overflow/page errors.
- Existing Phase 06 browser regression and production adapter refusal verified.
- No GEE calls, dependencies, migrations, live client publication, deployment or auto merge.

## Scope and dependency

Review as a stacked change on `feat/ai-gis-analysis-phase06` (`0481801`); Phase 06 PR #2
remains open/draft and main does not contain these prior phases.

The available workflow is an isolated, expiring **development simulation**. No live
persistence/reviewer assignment adapter is configured, so production endpoints refuse
access even with the DEMO flag. Real project/auth/entitlement integration, durable storage
and independent official publication authorization are documented prerequisites.
Scientific methodology validation/ranking are explicitly out of scope; review assesses
professional deliverable completeness, interpretation, authorized release and quality.

[Workflow, boundaries and screenshots](client-deliverable-workflow.md) ·
[Implementation report](implementation-report.md) ·
[Verification evidence](evidence/phase-07/verification-summary.json).
