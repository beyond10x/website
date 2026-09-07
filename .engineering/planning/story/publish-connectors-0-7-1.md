---
format: aep.planning-md/1
id: story:publish-connectors-0-7-1
kind: story
status: active
title: Publish Connectors 0.7.2 documentation
summary: Deliver the inspection command documentation through the existing source lock and Atlas publication.
relations:
- informed_by: story:publish-connectors-release-highlights
scope:
- confidence: cited
  path: data/bootstrap
- confidence: cited
  path: sources.lock.json
revision: 7
---
## Acceptance

Publish the Connectors 0.7.2 command documentation through the existing Website delivery, with a remote-backed deterministic source lock and Atlas-generated snapshot, passing Website/Atlas delivery checks and live evidence that the new inspect-upgrade documentation is present.

## Delivery scope

After Connectors source and release publication, regenerate sources.lock.json with npm run sources:lock, review all changed source rows and bot-commit the lock. Generate the four bootstrap files with the clean current Atlas producer and exact pinned Docs System CLI; commit them and run the Website gate against remote sources. Invoke existing Atlas bundle reconciliation, verify source identity and live delivery, then finish only this managed worktree after publication.

The release-facts freshness defect remains owned by story:publish-connectors-release-highlights: current Atlas bundle reconciliation reuses the prior production release facts. Refreshing the retained Website snapshot records the current release but does not claim that this repairs the production feed. No custom publication script, workflow change or dependency/runtime-pin migration is part of this documentation delivery.

## Authority

Operator approval on2026-09-07: "approved, do it, then cut release with that", continuing the requested release documentation and managed cleanup. The source release is Connectors story:release-0-7-1. The exact clean Atlas authority is d10b7484d64c28830774c9dae0ec531fcc47acb2; Website starts at remote main02271aa02022818a75a99ca3702c8cc00d135b1f in managed wt-connectors-071-docs-20260907. No primary checkout changes.

## Published source lock

Connectors release source `c30e4f2475f6288b5e83c87ed09843882a882123` is published on main and under the annotated v0.7.2 tag. The actual release workflow is https://github.com/beyond10x/connectors/actions/runs/34123190042; archives are still being built. Source-bundle delivery can proceed from this published source; the Atlas snapshot waits for the release to become visible so its retained release facts include v0.7.2.

Native `npm run sources:lock` ran with Node 24.20.0, remote origins and the full 24-source roster. Seven rows changed and were reviewed: agentplugins, Connectors, devcenter and worktree changed revision and content hash; ESS, service-sdk and workflow changed revision only. Manifest hashes, source roster, Website dependencies and immutable runtime/workflow pins did not change. Connectors is locked to the exact release commit above. The native collection transcript and complete lock diff are retained in assigned coordinator scratch.
