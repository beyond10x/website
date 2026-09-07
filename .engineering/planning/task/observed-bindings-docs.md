---
format: aep.planning-md/1
id: task:observed-bindings-docs
kind: task
status: archived
title: Refresh native observed-binding documentation delivery
revision: 6
---
The synchronous Website follow-through for ESS observed bindings is superseded by the organization-wide asynchronous completion rule in Atlas b40fcb0a065a95b0b427dff9cccae52c1b71ea94, AGENTS.md (Organization-wide source release completion), and the operator's instruction that ordinary ESS releases must not drive synchronous Website/Atlas machinery.

ESS bbbe0de65e01ad7dc22fd329bb5f73d70e648d1d is published on main (PR 13 merged); its exact Gate and documentation source bundle passed. Backend specs 4adb6790427ec58b7311e7c227230f42c3502af3 and system specs db2aba914b8db0f3eef9ec71094e950f90ea03e6 are published and usable independently.

The previous source-lock refresh and Atlas snapshot were produced under the old completion rule. Those generated changes are withdrawn from this branch. Its final difference from the original base is this AEP disposition only. No runtime, source-set, route or delivery-control change is needed. The existing passive source bundle and scheduled Atlas reconciler own publication; no additional run is dispatched by this task.

The attempted local Website gate did not complete successfully: a test Unix socket path exceeded the host path limit. This is not reported as a green gate. No live documentation publication has been verified by this task. Archive the obsolete synchronous task rather than claiming that the original full-publication acceptance was implemented. Temporary evidence remains outside repositories.
