---
format: aep.planning-md/1
id: verification-report:publish-connectors-release-highlights
kind: verification-report
status: draft
title: Connectors release documentation delivery and retained feed gap
relations:
- verifies: story:publish-connectors-release-highlights
revision: 1
---
## Delivered documentation

[Website PR 10](https://github.com/beyond10x/website/pull/10) published the refreshed source lock and Atlas-generated release snapshot. Only the Connectors and Service SDK lock rows advanced. Runtime, dependency and workflow bytes are unchanged.

The local full Website gate passed all 99 tests, navigation, search, links and build contracts. [Website CI 34100461000](https://github.com/beyond10x/website/actions/runs/34100461000) passed. The managed Atlas portal check passed against the built artifact.

[Publication 34101442041](https://github.com/beyond10x/atlas/actions/runs/34101442041) completed using the current immutable-bundle mode. Its source set selects the released Connectors commit e80b7ae1b2151d13aa9786cf67ea05e66717ee35 and successful producer run 34098024830. Independent complete-layout verification passed 357 routes and 1,332 site files. All 1,714 files in the self-contained artifact match the durable publication commit ff4bb5c98db699f8529688633d41c15b53b7cd64.

The live root provenance and [Connectors overview](https://beyond10x.github.io/docs/connectors/) return HTTP 200 and match artifact bytes. The overview links to WHATS-NEW.md. Source-set freshness passed, and Atlas verified 37 repository states, 26 Pages repositories and 52 delivery routes.

## Remaining release-feed acceptance

The refreshed Website source snapshot contains the published v0.7.0 release, but the production [release feed](https://beyond10x.github.io/releases/) still contains older Connectors release facts. The current Atlas reconciliation workflow copies release-facts.json from the prior durable publication instead of collecting newer release facts. The live feed matches its immutable artifact, so artifact integrity is green while release-feed freshness is not.

The story remains active for this explicit remaining acceptance item. The next change belongs to the Atlas release-fact input owner: introduce a supported refresh of verified release facts into immutable bundle publication, preserve the existing runtime/control pins and authority checks, then prove v0.7.0 appears in the production feed. Do not use legacy Website publication to replace the current self-contained layout.

## Operational checks

An incorrect legacy dispatch was cancelled before changing Pages settings or deploying. The successful reconciliation above is the only publication from this delivery attempt.

The full unchanged organization fence retained three existing failures in primary checkouts: documentation manifest compatibility, the Website dependency pin and repository objective grounding. Its Rust, catalog, public Pages, projection, markdown and brand checks passed. The managed Website checks above passed independently; the whole organization fence is not claimed green.

Build caches were retired after source preservation checks. Publish this evidence before finishing the managed Website worktree. The remaining release-feed work is preserved by this active story rather than by an unpublished local checkout.
