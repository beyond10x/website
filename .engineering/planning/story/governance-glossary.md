---
format: aep.planning-md/1
id: story:governance-glossary
kind: story
status: draft
title: Publish a searchable governance glossary
summary: Explain recurring beyond10x acronyms and terms while preserving repository authority.
tags:
- content-gap
- glossary
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: docusaurus.config.ts
- confidence: inferred
  path: src/pages/glossary.tsx
revision: 3
---
## Gap

The vision introduces Agentic Principles, Entity Runtime, AEP, ESS, Harness, Metaharness, Substrate, services, and connectors in eight lines (`src/pages/vision.mdx:8-19`), while the authored Website has no glossary route.

## Proposal

Publish a concise governance glossary for recurring terms and acronyms, with each definition scoped to beyond10x usage and linked to the repository that owns the technical detail.

## Acceptance

A reader can resolve every recurring beyond10x acronym and governance term from one searchable page without treating the glossary as technical authority.

## Scheduling

Do not schedule this story concurrently with `story:cross-project-troubleshooting-hub`; both are expected to update `docusaurus.config.ts`.
