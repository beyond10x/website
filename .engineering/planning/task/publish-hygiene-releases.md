---
format: aep.planning-md/1
id: task:publish-hygiene-releases
kind: task
status: implemented
title: Deliver Worktree and Agentplugins release documentation
owner: codex-hygiene-release
revision: 5
---
## Intent

Deliver the released Worktree 0.4.0 and Agentplugins 0.8.1 documentation through the shared Website. Refresh the deterministic source lock from published commits, render the Atlas-owned bootstrap snapshot and verify Website and Atlas delivery gates.

## Acceptance

- Source lock references the published release changes and declared passive sources only.
- Snapshot binds the exact clean Atlas producer and committed Website inputs.
- Website gate and Atlas portal verification pass, then publish the exact Website commit through Atlas and verify its delivery.

## Authorization

Required public documentation delivery for the operator-authorized Worktree and Agentplugins releases on 2026-09-07.

## Delivery evidence — 2026-09-07

Worktree 0.4.0 is published at https://github.com/beyond10x/worktree/releases/tag/0.4.0 from 8d6b1075f72222351a2f214ca9ff34349720e2b2. Agentplugins 0.8.1 is published at https://github.com/beyond10x/agentplugins/releases/tag/0.8.1 from 22e85aa77c024fb6914354f24c4656e1c4251419. Both releases are authored by b10x-bot[bot]; source gates and the Agentplugins release workflow passed.

The native Website lock writer advanced Agentplugins, Connectors, Devcenter, ESS, Service SDK, Workflow and Worktree from their published remote heads. Lock input commit 02b2d471ce91779994d9ae2acb3c0129c684722a has lock SHA-256 cac5fe0a8e29a1652caa3cfcabb57993fc5adb6dd4e20a405614dcf5c68f0a07. Native Atlas snapshot at clean producer d10b7484d64c28830774c9dae0ec531fcc47acb2 produced snapshot commit f99d43f9a5986f645ec64de4f5ea9084cc2837a3.

On that snapshot commit, Node 24 npm run gate passed all 99 tests, source and build code contracts, browser navigation/reflow, search, crawling, and provenance verification for 357 routes and 1,332 files. The first run encountered temporary-directory quota errors; the successful run used task-owned disposable scratch without weakening any test. Native Atlas docs verify-portal passed for 24 locked sources, 25 surfaces and 52 delivery records.

Production source-set publication completed successfully in https://github.com/beyond10x/atlas/actions/runs/34122475288. Its source set selects Worktree 8d6b1075f72222351a2f214ca9ff34349720e2b2 from producer run 34121852365 and Agentplugins 22e85aa77c024fb6914354f24c4656e1c4251419 from producer run 34122137943. It retains Website runtime fc4571534765c098ed861bc326da4d3da0d1df63 and Atlas controls d10b7484d64c28830774c9dae0ec531fcc47acb2. Source-set SHA-256: 34c1bec747605d5b4ec1e701eedb2e81e28cd62701af1c81afbbdc9e46a4d8c9.

The downloaded self-contained publication passed the native verifier for 355 routes, 1,325 files and publication layout v2. Live production provenance, the Workspace Hygiene page and the Connectors plugin page were byte-identical to that verified artifact. Provenance SHA-256: d659e10474f0204fb7a3a20efca8d0be9dee034318431e735009f78128aabba6.

Worktree 0.4.0 and all six Agentplugins 0.8.1 plugins are installed locally. The installed Worktree, wave and Connectors skills match the release bytes. The Worktree and Agentplugins release trees and their disposable compiler/dependency output were removed through exact reviewed managed GC; useful reports were retained separately.
