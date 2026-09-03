---
format: aep.planning-md/1
id: story:operate-long-tail-services
kind: story
status: draft
title: Extend Operate to honest long-tail service paths
summary: Add remaining public services only when their owner-supplied access and artifacts make them actionable.
tags:
- content-gap
- operate
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: data/experience-pages.json
- confidence: inferred
  path: data/experiences.json
- confidence: inferred
  path: src/pages/operate.tsx
revision: 3
---
## Gap

The Operate experience currently names AEP Service and Connectors (`data/experience-pages.json:267-318`), while Atlas P2 reserves Agent Platform, Eventlog, Identity, Secrets, Workflow, and Workspace for honest service-operation paths (`../atlas/docs/design/public-documentation-roadmap.md:132-136`).

## Proposal

Add the remaining services only as their source owners publish route-verified v4 experience metadata, access, support, and obtainable artifacts; keep planned or paused services visible without manufacturing deployment calls to action.

## Acceptance

Every long-tail service that appears in Operate has an owner-supplied, artifact-backed path, and every service without one remains explicitly planned or paused rather than actionable.

## Scheduling

Do not schedule this story concurrently with `story:contribution-authority-map`, `story:entity-runtime-builder-path`, `story:plan-to-driven-implementation-handoff`, or `story:research-evidence-learn-bridge` because they share `data/experience-pages.json`; it also shares `data/experiences.json` with `story:blocked-path-recovery-guidance` and `story:verified-release-platform-facts`.
