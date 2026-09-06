---
format: aep.planning-md/1
id: task:publish-reviewed-connectors-cli
kind: task
status: implemented
title: Publish the reviewed Connectors CLI documentation
refs:
- provider: github
  reference: beyond10x/connectors#17
relations:
- decomposes: story:publish-reviewed-connectors-cli
revision: 5
---
## Outcome

Deliver the reviewed Connectors CLI first batch through the existing public Website. This task is the Website delivery obligation of Connectors story personal-local-writes-are-usable and the approved CLI wave, represented remotely by Connectors PR17. It changes generated discovery inputs only; repository-owned CLI documentation is already reviewed with source.

## Acceptance

After the first batch reaches Connectors main, refresh sources.lock.json with the deterministic remote source collector and review every changed source entry. Record the exact published Connector commit. Commit the lock before rendering the Atlas-owned bootstrap snapshot from a clean, current managed Atlas producer. Use the matching remote-backed Website gate and Atlas portal/live delivery gates. Publish source commits through organization bot authority and the existing Atlas documentation publication path. Record exact commit/run provenance and actual failures; do not claim delivery from a preview or substitute local primary bytes.

## Scope

sources.lock.json and the four deterministic files data/bootstrap/ecosystem.json, changes.json, release-facts.json and metadata.json. AEP is coordinator-owned. No authored Website UI or public API is changed. Keep B10X_SOURCE_WORKSPACE unset and preserve the current production source-set path.

## Verified source and live delivery — 2026-09-06

Website source PR5 merged at7600eaf61952b7896f1e196881427dd5e84d4be4 after production gate99/99, CI34025485980 and Atlas portal verification24 sources/25 surfaces/52 records passed. The committed deterministic snapshot binds Atlasf3b9f99b, the prior committed lock inputfc64c9ff and exact file digests. This is the retained-lock source update, not the artifact currently deployed by the bundle publisher.

Existing Atlas publication34024493096 successfully delivered immutable source-setv2 e68b6b02e92ce94126fc0ecee7540772472e25ad386183305b6f53565ddc94f2 using Website runtimefc4571534765c098ed861bc326da4d3da0d1df63. Live provenance names the exact Connectors4b32397df2cc2f5bd5ee1c5737891163fb750957 and producer34023890652/artifact9986420081. The live Atlas delivery gate then passed37 repository states,26 Pages repositories and52 routes with one Website commit. A manual older-lock publication was unnecessary and was not dispatched.

The later scheduled34024834663 failed in source-level resolution/snapshot before publishing; retained output gives exit1 without a specific cause. This does not represent an all-green scheduler claim or alter the verified delivered revision. Exact evidence is indexed in `~/.cache/cw6/p/website-cli-delivery-evidence-inventory.json`. The original failed snapshot command's wrong Docs System path and its corrected successful run remain retained. No release, tag or new live Slack invocation occurred.
