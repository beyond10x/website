---
format: aep.planning-md/1
id: story:research-evidence-learn-bridge
kind: story
status: draft
title: Connect Learn to source-owned research evidence
summary: Add an optional evidence branch without burdening the first practitioner checklist.
tags:
- content-gap
- learn
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: data/experience-pages.json
- confidence: inferred
  path: data/experiences.json
- confidence: inferred
  path: src/pages/learn/safe-agentic-coding.tsx
revision: 3
---
## Gap

Atlas P1 asks Learn to include the reviewed principle-to-practice bridge and Research evidence (`../atlas/docs/design/public-documentation-roadmap.md:105-106`); the current Learn sequence links the conceptual bridge and several implementation boundaries but no explicit Research evidence step (`data/experience-pages.json:84-143`).

## Proposal

Add a clearly optional evidence-reading branch that connects a claim to its source-owned research without putting research papers into the first practitioner checklist.

## Acceptance

A Learn reader can inspect the evidence behind a principle through a source-owned Research route while the primary practical sequence remains unchanged and short.

## Scheduling

Do not schedule this story concurrently with `story:contribution-authority-map`, `story:entity-runtime-builder-path`, `story:operate-long-tail-services`, or `story:plan-to-driven-implementation-handoff` because they share `data/experience-pages.json`; it also shares `data/experiences.json` with `story:blocked-path-recovery-guidance` and `story:verified-release-platform-facts`.
