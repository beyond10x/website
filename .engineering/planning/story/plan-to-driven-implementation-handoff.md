---
format: aep.planning-md/1
id: story:plan-to-driven-implementation-handoff
kind: story
status: draft
title: Explain the handoff from governed plan to driven implementation
summary: Add an honest ADP handoff after the planning path without implying execution authority.
tags:
- adp
- content-gap
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: data/experience-pages.json
- confidence: inferred
  path: data/experiences.json
- confidence: inferred
  path: src/pages/index.tsx
revision: 3
---
## Gap

The first practitioner path explicitly ends at a critic-reviewed plan, and the home page says `aep drive` is optional, experimental, and does not complete implementation (`src/pages/index.tsx:75-78`). There is no Website-owned handoff that explains when a planned story is ready to drive, what the driver enforces, or what evidence returns to the plan.

## Proposal

Add a distinct plan-to-implementation handoff that keeps ADP experimental, explains readiness and refusal states, links only to source-owned ADP instructions, and never implies that planning approval grants execution authority.

## Acceptance

A rendered handoff presents one pre-launch decision contract containing the stop/start choice, readiness evidence, authority boundary, and terminal outcomes for an ADP-driven story.

## Scheduling

Do not schedule this story concurrently with `story:blocked-path-recovery-guidance`, `story:contribution-authority-map`, `story:entity-runtime-builder-path`, `story:operate-long-tail-services`, or `story:research-evidence-learn-bridge` because they share `data/experience-pages.json` or `data/experiences.json`; it also shares `src/pages/index.tsx` with `story:site-wide-ui-color-refinement` and `story:verified-release-platform-facts`.
