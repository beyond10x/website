---
format: aep.planning-md/1
id: story:publish-connectors-schema3
kind: story
status: implemented
title: Deliver the reviewed GitLab and structured-rate documentation
refs:
- provider: github
  reference: beyond10x/connectors#18
relations:
- derived_from: story:publish-reviewed-connectors-cli
scope:
- confidence: inferred
  path: data/bootstrap/changes.json
- confidence: inferred
  path: data/bootstrap/ecosystem.json
- confidence: inferred
  path: data/bootstrap/metadata.json
- confidence: inferred
  path: data/bootstrap/release-facts.json
- confidence: inferred
  path: sources.lock.json
revision: 9
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

## Published source and deterministic refresh — 2026-09-06

Connectors PR18 merged at 2026-09-06T14:30:35Z by the normal bot-wrapper fast-forward. Main is 0c69450921ab1794c81dadec915b717a61bf0983, exact reviewed tree fdad9c0e21a3afb521a0b88fef222211293e5dc2. Repository CI34037821332 completed successfully: all twelve workspace gates, checks, four native platform builds and their smoke tests passed; the tag-only publish job was skipped. All nineteen introduced direct commits have the exact required bot author and committer. No release or tag was created.

The existing Node24 toolchain completed npm ci --ignore-scripts with the exact committed package lock, exit 0, and no source changes. Website's ordinary anonymous remote-backed sources:lock then completed with all twenty-four sources and unchanged roster, repository URLs, manifest paths and manifest digests. Its generated refresh advances Connectors 4b32397d to 0c694509, Devcenter 321880bd to 5657c42d, ESS 6c78676c to 06b5f1d1, and Workspace 0e870c70 to 35b204b2. Workspace's declared content digest stays unchanged; the first three receive the exact newly collected content digests. All other rows stay identical. This is the unmodified collector's complete output, not a selectively assembled JSON edit.

The source lock SHA256 is c709781ccaa1190430d2d24760c045c2a9b2d45a0364b4573e962fe62ac16365. Every locked commit already exists in its sibling Git object database; no primary checkout or ref was changed. The generated lock is checkpointed before Atlas's retained snapshot requires committed bytes. Subsequent snapshot, full Website gate, Atlas retained verification and new automatic production convergence are still required. The old live publication remains separately observed and supplies no claim of this source's delivery.

Persistent command/resource records and exact lock delta are under ~/.cache/cw6/p using the schema3-website prefix; the source merge receipt is schema3-main-published-readback.json. Minimum available disk for install was 15,737,065,472 bytes and for collection 15,534,948,352 bytes; neither command was interrupted. The prospective 12 GiB reserve remains in force.

## Verified implementation and delivery

Implementation and actual public delivery are verified by [the complete verification report](../verification-report/cli-schema3-website-delivery-20260906.md). Website source 5430e471 passed all 99 tests and its complete gate; Atlas retained-artifact verification passed. Automatic run 34039715421 published the new Connectors bundle, source-set freshness is true, full live delivery checks pass, and all 1,709 artifact files match durable mirror 31100dc7. The record preserves earlier baseline staleness and temporary convergence observations. No architecture acceptance, release, consumer migration or all-organization fence result is implied.
