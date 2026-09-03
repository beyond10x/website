---
format: aep.planning-md/1
id: task:deliver-website-ui-refinement
kind: task
status: implemented
title: Deliver the approved Website UI revision
summary: Refresh deterministic public inputs, render the Atlas snapshot, and publish one verified Website artifact.
tags:
- delivery
- website
refs:
- provider: website
  reference: 0ed89f734bc78215fb12bd6d71306724d65f2d28
relations:
- decomposes: story:site-wide-ui-color-refinement
revision: 4
---
## Context

The approved UI revision is published at `0ed89f734bc78215fb12bd6d71306724d65f2d28`. The coordinator freshness check found that the committed Website source lock no longer matches the anonymous remote `main` heads for AEP, Devcenter, and ESS. Public delivery requires a newly committed exact lock and an Atlas-produced bootstrap snapshot before the unified artifact can be published.

## Scope

- Refresh `sources.lock.json` from anonymous public remote heads.
- Accept only exact commits that are already remotely available.
- Render `data/bootstrap/{ecosystem.json,changes.json,release-facts.json,metadata.json}` from a clean committed Atlas producer.
- Do not alter authored UI, imported source repositories, experience definitions, or release metadata by hand.

## Acceptance

- The lock refresh is deterministic and pins the observed public commits.
- Atlas snapshot metadata binds the committed Website inputs and clean Atlas producer.
- The complete Website gate and Atlas portal/delivery gates pass against the final Website commit.
- Website and Atlas commits are bot-authored, published, and the root plus catalog-driven facades converge on one Website commit.

## Evidence plan

Record the source-lock check that exposed drift, the full Website gate, Atlas verification commands, the publication workflow run, and the final live provenance convergence.
