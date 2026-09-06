---
format: aep.planning-md/1
id: story:publish-connectors-schema3
kind: story
status: active
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
revision: 4
---
## Outcome

Deliver the reviewed GitLab/source-fidelity and structured-rate documentation from Connectors PR18 through the existing public Website. This is the documentation obligation of the approved Connectors CLI wave and serves Website's existing O2 evidence and O5 coherent public-entry objectives. Candidate0c694509 passed all twelve local workspace gates and independent unit review; remote verification34037821332 is still running. The first batch's implemented delivery record remains unchanged.

## Acceptance

After the exact source reaches Connectors main with passing repository CI, run Website's ordinary remote-backed sources:lock collector and inspect every changed source/manifest/content digest. Commit the generated lock before Atlas renders its four bootstrap outputs from a clean current published managed producer. Run the required remote-backed Website gate and Atlas retained-lock portal/artifact checks. All locked commits must exist remotely; source primaries and preview overrides are not publication evidence.

Track the exact passive source bundle for the new Connectors main and the automatic Atlas publication that selects it. Production uses b10x-docs-source-set/v1 and publication-layout/provenance v2; retained-lock preview output is a separate validation path. Verify exact bundle/run/artifact/source identity, root/façade convergence and current Website runtime. Do not dispatch the old lock-based docs publish path over a newer automatic production. If an Atlas verifier lacks the v2 artifact capability, record its exact gap and use the applicable Website publication verifier plus Atlas source-set freshness/live Pages checks; never call a refused command green.

## Scope

Only sources.lock.json, data/bootstrap/ecosystem.json, changes.json, release-facts.json, metadata.json and coordinator-owned planning records. Repository-owned public documentation is already in the reviewed Connectors source; no authored Website UI, source roster, contract, delivery tooling, runtime pin, credentials or external consumer code is changed. The installed Node24 toolchain and existing pinned npm lock serve the gate. Preserve current automatic production and previous delivered revisions. No release, tag or live provider operation is assigned.

## Workspace and resources

Managed tree wt-5b72ec73c229, branch docs/cli-schema3-source-lock, exact published Website base d35d9297046f8f0af16c671dc1a372a7be33baa1. Scratch is under ~/.cache/cw6/p/schema3-website*. AEP recording actor is agent:cli-ten-slack-first. The wave's prospective12GiB reserve and single compiling workspace govern local builds; dependency installation and rendering remain paused until sufficient measured headroom and the compile slot are available. Source discovery and planning are read-only or isolated reversible preparation.
