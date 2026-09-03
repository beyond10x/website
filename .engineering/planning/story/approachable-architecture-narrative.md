---
format: aep.planning-md/1
id: story:approachable-architecture-narrative
kind: story
status: draft
title: Make the architecture map approachable by boundary
summary: Add edge semantics, common ownership questions, and focused entry points around the full graph.
tags:
- architecture
- content-gap
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: src/pages/architecture.tsx
- confidence: inferred
  path: src/pages/ecosystem.module.css
revision: 3
---
## Gap

The architecture page currently provides one large dependency graph and its deterministic download (`src/pages/architecture.tsx:12-22`), but no concise legend, boundary-oriented reading path, or examples of how to answer a common ownership question.

## Proposal

Add an approachable architecture narrative above the graph: explain edge semantics, distinguish conceptual reading order from dependencies, and offer focused entry points for planning, building agents, operating services, and documentation delivery.

## Acceptance

A first-time reader can use the architecture page to identify an owning boundary and interpret an edge before interacting with the full graph.

## Scheduling

Do not schedule this story concurrently with `story:site-wide-ui-color-refinement`; both land on `src/pages/ecosystem.module.css`.
