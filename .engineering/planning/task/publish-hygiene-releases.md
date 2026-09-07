---
format: aep.planning-md/1
id: task:publish-hygiene-releases
kind: task
status: active
title: Deliver Worktree and Agentplugins release documentation
owner: codex-hygiene-release
revision: 3
---
## Intent

Deliver the released Worktree 0.4.0 and Agentplugins 0.8.1 documentation through the shared Website. Refresh the deterministic source lock from published commits, render the Atlas-owned bootstrap snapshot and verify Website and Atlas delivery gates.

## Acceptance

- Source lock references the published release changes and declared passive sources only.
- Snapshot binds the exact clean Atlas producer and committed Website inputs.
- Website gate and Atlas portal verification pass, then publish the exact Website commit through Atlas and verify its delivery.

## Authorization

Required public documentation delivery for the operator-authorized Worktree and Agentplugins releases on 2026-09-07.
