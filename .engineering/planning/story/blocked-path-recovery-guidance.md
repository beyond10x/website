---
format: aep.planning-md/1
id: story:blocked-path-recovery-guidance
kind: story
status: draft
title: Explain what to do when an adoption path is blocked
summary: Turn paused and inaccessible path states into honest alternatives or explicit stops.
tags:
- adoption
- content-gap
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: data/experiences.json
- confidence: inferred
  path: src/components/ExperienceView.module.css
- confidence: inferred
  path: src/components/ExperienceView.tsx
revision: 3
---
## Gap

Atlas P2 calls for a status/dead-end signal when an advertised path is paused or inaccessible (`../atlas/docs/design/public-documentation-roadmap.md:144-147`); experience cards expose blockers, but the site offers no short recovery-oriented explanation of what a reader can do next.

## Proposal

Add blocked-path guidance that distinguishes paused support, approval-required access, private artifacts, and unpublished artifacts, then routes each state to a safe alternative or an explicit stop.

## Acceptance

Every advertised but non-actionable adoption path explains why it stops and offers either an honest public alternative or an explicit no-action-available finish line.

## Scheduling

Do not schedule this story concurrently with `story:entity-runtime-builder-path`, `story:operate-long-tail-services`, `story:plan-to-driven-implementation-handoff`, `story:research-evidence-learn-bridge`, or `story:verified-release-platform-facts` because they share `data/experiences.json`; it also shares `src/components/ExperienceView.module.css` with `story:site-wide-ui-color-refinement`.
