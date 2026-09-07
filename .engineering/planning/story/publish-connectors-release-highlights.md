---
format: aep.planning-md/1
id: story:publish-connectors-release-highlights
kind: story
status: active
title: Publish Connectors release highlights and v0.7.0 facts
relations:
- derived_from: story:publish-connectors-auth
scope:
- confidence: cited
  path: data/bootstrap
- confidence: cited
  path: sources.lock.json
revision: 5
---
## Outcome

Deliver the Connectors v0.7.0 documentation overview link and current release facts through the existing Website publication pipeline, after the approved release source is published.

## Acceptance

The complete Website gate and managed Atlas portal check pass for published source, and the resulting public Website artifact and live Connectors overview contain the WHATS-NEW.md link with verified production provenance and current release facts.

## Delivery

Regenerate the complete sources.lock.json with the Website owner command after Connectors main contains the reviewed release. Inspect every changed source row and verify remote availability. Commit the lock before using Atlas to regenerate its four bootstrap documents. Preserve runtime, dependency, workflow and source-roster pins.

Run the full Website gate, normal GitHub publication and the organization delivery verifiers. Record the actual full Atlas fence result separately from the managed portal check, including any existing primary-workspace failures. Retire completed managed worktrees through the worktree CLI after publication and verification.

This is one delivery story without a decomposition; no critic panel is scheduled.

## Verified delivery and remaining work — 2026-09-07

The Connectors overview and WHATS-NEW.md link are published, artifact-verified and live. Website PR 10, the full Website gate, managed Atlas portal check and immutable-bundle publication 34101442041 passed. Source-set freshness and live Pages verification passed. See verification-report:publish-connectors-release-highlights for the exact evidence.

The production release feed still reuses older release facts, although the updated Website source snapshot includes v0.7.0. This story remains active for that acceptance item. Atlas must provide a supported release-fact refresh within current immutable-bundle publication before the feed can be declared current. The user-requested GitHub release and Connectors documentation have been delivered; do not recut or republish the release to address this feed issue.
