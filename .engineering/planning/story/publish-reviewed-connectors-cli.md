---
format: aep.planning-md/1
id: story:publish-reviewed-connectors-cli
kind: story
status: active
title: Deliver the reviewed Connectors CLI documentation
refs:
- provider: github
  reference: beyond10x/connectors#17
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
revision: 5
---
## Outcome

Deliver the reviewed Connectors CLI first batch through the existing public Website. This task is the Website delivery obligation of Connectors story personal-local-writes-are-usable and the approved CLI wave, represented remotely by Connectors PR17. It changes generated discovery inputs only; repository-owned CLI documentation is already reviewed with source.

## Acceptance

After the first batch reaches Connectors main, refresh sources.lock.json with the deterministic remote source collector and review every changed source entry. Record the exact published Connector commit. Commit the lock before rendering the Atlas-owned bootstrap snapshot from a clean, current managed Atlas producer. Use the matching remote-backed Website gate and Atlas portal/live delivery gates. Publish source commits through organization bot authority and the existing Atlas documentation publication path. Record exact commit/run provenance and actual failures; do not claim delivery from a preview or substitute local primary bytes.

## Scope

sources.lock.json and the four deterministic files data/bootstrap/ecosystem.json, changes.json, release-facts.json and metadata.json. AEP is coordinator-owned. No authored Website UI or public API is changed. Keep B10X_SOURCE_WORKSPACE unset and preserve the current production source-set path.

## Published source and deterministic lock — 2026-09-06

Connectors PR17 is merged at4b32397df2cc2f5bd5ee1c5737891163fb750957 through the normal bot-authorized fast-forward path. Its complete CI34022162900 passed all twelve workspace gates, repository checks and four platform builds; the release publish job was skipped. The passive source bundle for this exact main commit succeeded in34023890652.

The ordinary remote-backed sources:lock collector selected this exact Connector commit. It advanced five published repository revisions: AEP, Connectors, Devcenter, ESS and Workspace. Only AEP, Connectors and ESS change declared document content; all manifest digests remain unchanged. The source roster and URL policy are unchanged. Raw collector output and the old/new digest comparison are retained under `~/.cache/cw6/p/website-cli-source-lock.log` and `website-cli-lock-delta.json`. No preview or source-set override was set. Website gate, deterministic snapshot and publication remain pending.
