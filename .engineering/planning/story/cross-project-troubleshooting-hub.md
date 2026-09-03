---
format: aep.planning-md/1
id: story:cross-project-troubleshooting-hub
kind: story
status: draft
title: Create a symptom-first troubleshooting hub
summary: Route journey failures to owning diagnostics or explicit authority and access stops.
tags:
- content-gap
- troubleshooting
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: inferred
  path: docusaurus.config.ts
- confidence: inferred
  path: src/pages/troubleshooting.tsx
revision: 3
---
## Gap

The authored Website has no cross-project troubleshooting route, even though its six experiences hand readers across installation, specification, planning, preview, execution, and service-operation boundaries.

## Proposal

Create a symptom-first troubleshooting hub that routes failures to the owning repository, preserves exact error text and source revision, and distinguishes retryable local setup problems from access, support, and authority refusals.

## Acceptance

A reader with a failed Website journey can select the observed symptom and reach the owning diagnostic guide or an explicit access/authority stop without guessing which repository to search.

## Scheduling

Do not schedule this story concurrently with `story:governance-glossary`; both are expected to update `docusaurus.config.ts`.
