---
format: aep.planning-md/1
id: story:verified-release-platform-facts
kind: story
status: draft
title: Surface verified release and platform facts
summary: Expose current release, platform, artifact, hosted, and deployment availability from verified Website inputs.
tags:
- content-gap
- releases
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: data/bootstrap/release-facts.json
- confidence: inferred
  path: data/experiences.json
- confidence: inferred
  path: src/pages/availability.tsx
- confidence: inferred
  path: src/pages/index.tsx
revision: 3
---
## Gap

Atlas P2 asks the landing page to surface current release and platform facts from verified artifacts (`../atlas/docs/design/public-documentation-roadmap.md:144-149`), while the current home page contains no generated release or platform facts (`src/pages/index.tsx:56-157`).

## Proposal

Add a compact, generated home-page fact strip for current supported plugin and CLI releases, published platforms, and snapshot provenance, with links to the existing detailed release and artifact records.

## Acceptance

A rendered home-page fact strip shows current release, platform, artifact, and snapshot facts solely from verified Website inputs, with unsupported Windows and unbuilt historical archives absent.

## Scheduling

Do not schedule this story concurrently with `story:blocked-path-recovery-guidance`, `story:entity-runtime-builder-path`, `story:operate-long-tail-services`, or `story:research-evidence-learn-bridge` because they share `data/experiences.json`; it also shares `src/pages/index.tsx` with `story:site-wide-ui-color-refinement` and `story:plan-to-driven-implementation-handoff`.
