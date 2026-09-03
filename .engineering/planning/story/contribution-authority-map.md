---
format: aep.planning-md/1
id: story:contribution-authority-map
kind: story
status: draft
title: Separate source, Website, and Atlas contribution authority
summary: Make the three-owner documentation transaction explicit for maintainers.
tags:
- content-gap
- contribute
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: data/experience-pages.json
- confidence: inferred
  path: src/pages/contribute.tsx
revision: 3
---
## Gap

Atlas P1 asks Contribute to separate source-author, Website-shell, and Atlas-delivery responsibilities (`../atlas/docs/design/public-documentation-roadmap.md:107-108`); the current sequence covers source ownership and Website preview but compresses final delivery into a generic updates check (`data/experience-pages.json:321-379`).

## Proposal

Publish a three-owner contribution map that tells maintainers which repository changes, where preview authority ends, and which bot-governed Atlas transaction publishes root and façades.

## Acceptance

A maintainer can choose the source-owner, Website-shell, or Atlas-delivery path without being instructed to edit generated content or use personal publication credentials.

## Scheduling

Do not schedule this story concurrently with `story:entity-runtime-builder-path`, `story:operate-long-tail-services`, `story:plan-to-driven-implementation-handoff`, or `story:research-evidence-learn-bridge` because they share `data/experience-pages.json`.
