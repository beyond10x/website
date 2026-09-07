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
revision: 9
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

## Concurrent Website publication

While release binaries built, Website main advanced from `02271aa02022818a75a99ca3702c8cc00d135b1f` to `487649f62e30eee02aaf07f8ea023ae495bec061`, publishing Worktree and Agentplugins release data. The incoming task and bootstrap files are preserved. Native Git union merge retained the two disjoint CLI-generated AEP journal additions; native AEP validation checks their combined store. The source-lock conflict was resolved by rerunning the complete remote owner command, retaining Connectors' exact 0.7.2 release source. No repository instruction, dependency or workflow changed.

## Verified Website candidate

At Website commit `29b944d2dec6d49a852c71ade13ef9c6ff1d48f0`, native `npm run gate` completed all 19 steps with exit 0: 99 tests passed, 0 failed, 0 skipped; 358 HTML pages, 357 routes and 23,847 references were checked. Navigation checks covered both themes, desktop, mobile widths, reflow, pointer activation and keyboard drawer behavior. The configured critical-level npm audit passed while reporting 9 moderate and 20 high advisories in the unchanged dependency graph; it is not a claim of no advisories.

The built Connectors interfaces page contains `connectors inspect upgrade`. Atlas's native portal verifier passed: 24 locked public sources, 25 surfaces and 52 delivery records. The source lock selects published Connectors release commit `c30e4f2475f6288b5e83c87ed09843882a882123`; the Atlas snapshot includes the actual v0.7.2 release published at 2026-09-07T13:08:04Z. Gate transcript, exit status, portal result and built provenance are retained in coordinator evidence. These are the scoped delivery gates; no organization-wide workspace fence convergence is claimed.

Publish this verified source, then invoke the existing Atlas reconciliation and verify live root delivery. The existing production release-feed refresh limitation remains tracked separately in `story:publish-connectors-release-highlights`; the retained snapshot's current release facts do not claim to fix that workflow behavior.
