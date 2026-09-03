---
format: aep.planning-md/1
id: story:entity-runtime-builder-path
kind: story
status: draft
title: Add Entity Runtime to the builder experience
summary: Give deterministic state-transition mechanics a distinct, source-owned builder path.
tags:
- build
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
  path: src/pages/build/agent-systems.tsx
revision: 3
---
## Gap

Atlas P2 identifies Entity Runtime as a future `build-agent-systems` source (`../atlas/docs/design/public-documentation-roadmap.md:132-136`), but the current builder sequence covers Agent Plugins, Harness, Substrate, and Metaharness without an Entity Runtime choice (`data/experience-pages.json:151-215`).

## Proposal

Add a builder path for deterministic state and operation decisions once Entity Runtime supplies the required v4 experience metadata and a runnable public artifact or source-owned guide.

## Acceptance

A builder can choose Entity Runtime for deterministic state-transition mechanics without mistaking it for the agent loop, specification layer, or external-effects boundary.

## Scheduling

Do not schedule this story concurrently with `story:contribution-authority-map`, `story:operate-long-tail-services`, `story:plan-to-driven-implementation-handoff`, or `story:research-evidence-learn-bridge` because they share `data/experience-pages.json`; it also shares `data/experiences.json` with `story:blocked-path-recovery-guidance` and `story:verified-release-platform-facts`.
