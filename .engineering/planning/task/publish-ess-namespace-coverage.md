---
format: aep.planning-md/1
id: task:publish-ess-namespace-coverage
kind: task
status: active
title: Deliver the native namespace-coverage documentation
revision: 3
---
Refresh the retained Website source lock after ESS PR #12 is merged, render the corresponding Atlas-owned snapshot, and run the Website and Atlas delivery gates required by workspace policy. ESS owns the public source; this task adds no authored technical claims or tool/runtime changes to Website.

Use the existing remote source-lock writer and preserve its complete roster. Record the exact ESS source revision, all other rows the native writer advances, snapshot producer, checks and actual source-set publication. Do not hand-edit lock rows or generated bootstrap output. Public source remains restricted to declared manifests, and no private adopter observations are inputs.

User instruction on 2026-09-07: merge the tested collector fix. This task records the documentation delivery required by the source and workspace contracts. It authorizes no release tag or binary publication. Any observed gate refusal remains visible; a completed source merge and production delivery are separate facts.
