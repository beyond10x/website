---
format: aep.planning-md/1
id: task:publish-connectors-schema3
kind: task
status: implemented
title: Publish exact schema3 source documentation and verify delivery
refs:
- provider: github
  reference: beyond10x/connectors#18
relations:
- decomposes: story:publish-connectors-schema3
revision: 6
---
## Outcome

The reviewed GitLab and structured-rate documentation is delivered from exact Connectors main 0c69450921ab1794c81dadec915b717a61bf0983. The ordinary Website source-lock refresh, Atlas snapshot, full Website gate, retained-artifact validation and automatic bundle publication are verified. This serves Website O2 evidence and O5 coherent public entry. The generated maintenance changes proceed through the normal Website PR; production continues to use its unchanged pinned runtime and automatic source-set owner.

## Acceptance

After the exact source reaches Connectors main with passing repository CI, run Website's ordinary remote-backed sources:lock collector and inspect every changed source/manifest/content digest. Commit the generated lock before Atlas renders its four bootstrap outputs from a clean current published managed producer. Run the required remote-backed Website gate and Atlas retained-lock portal/artifact checks. All locked commits must exist remotely; source primaries and preview overrides are not publication evidence.

Track the exact passive source bundle for the new Connectors main and the automatic Atlas publication that selects it. Production uses b10x-docs-source-set/v1 and publication-layout/provenance v2; retained-lock preview output is a separate validation path. Verify exact bundle/run/artifact/source identity, root/façade convergence and current Website runtime. Do not dispatch the old lock-based docs publish path over a newer automatic production. If an Atlas verifier lacks the v2 artifact capability, record its exact gap and use the applicable Website publication verifier plus Atlas source-set freshness/live Pages checks; never call a refused command green.

## Scope

Only sources.lock.json, data/bootstrap/ecosystem.json, changes.json, release-facts.json, metadata.json and coordinator-owned planning records. Repository-owned public documentation is already in the reviewed Connectors source; no authored Website UI, source roster, contract, delivery tooling, runtime pin, credentials or external consumer code is changed. The installed Node24 toolchain and existing pinned npm lock serve the gate. Preserve current automatic production and previous delivered revisions. No release, tag or live provider operation is assigned.

## Workspace and resources

Managed tree wt-5b72ec73c229, branch docs/cli-schema3-source-lock, exact published Website base d35d9297046f8f0af16c671dc1a372a7be33baa1. Scratch is under ~/.cache/cw6/p/schema3-website*. AEP recording actor is agent:cli-ten-slack-first. The wave's prospective12GiB reserve and single compiling workspace govern local builds; dependency installation and rendering remain paused until sufficient measured headroom and the compile slot are available. Source discovery and planning are read-only or isolated reversible preparation.

## Verified implementation and delivery

Implementation and actual public delivery are verified by [the complete verification report](../verification-report/cli-schema3-website-delivery-20260906.md). Website source 5430e471 passed all 99 tests and its complete gate; Atlas retained-artifact verification passed. Automatic run 34039715421 published the new Connectors bundle, source-set freshness is true, full live delivery checks pass, and all 1,709 artifact files match durable mirror 31100dc7. The record preserves earlier baseline staleness and temporary convergence observations. No architecture acceptance, release, consumer migration or all-organization fence result is implied.
