---
format: aep.planning-md/1
id: epic:website-experience-refinement
kind: epic
status: implemented
title: Refine the canonical Website experience
summary: Unify the visual shell and retain evidence-based content follow-ups for the next documentation increments.
tags:
- adopter-experience
- website
refs:
- provider: repository
  reference: https://github.com/beyond10x/website
revision: 4
---
## Outcome

Make the canonical beyond10x Website feel deliberate, expressive, and coherent from the outcome-led landing page through generated technical documentation, while keeping future content gaps independently schedulable.

## Evidence

- `src/pages/index.tsx:56-157` owns the current landing-page composition.
- `src/css/custom.css:1-245` owns Website-wide shell overrides.
- `../atlas/docs/design/public-documentation-roadmap.md:130-160` records the remaining P2 adoption and content direction.

## Acceptance

The Website has one implemented visual-refinement story and a reviewed backlog of independently schedulable content stories, each tied to an observed Website or Atlas roadmap gap.
