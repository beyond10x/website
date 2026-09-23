---
format: aep.planning-md/1
id: story:homepage-action-count
kind: story
status: draft
title: Reduce the homepage to one primary action and four others
revision: 1
---
## Problem

The 2026-09-23 navigation review counted 9 competing calls to action on the homepage. Website #22
kept one primary action (to `/start/`) and 4 gateway cards. The live regression check at Website
`a175d5d` still counts about 8 distinct action targets on `/`
(`~/.cache/b10x-site-review-20260923/regress-results.md`, R8 row).

Constraints: `tests/ux-contract.test.mjs` pins the hero's secondary link ("Learn safe agentic
coding") and the four gateway cards' accents and order; `data/journeys.mjs` is the one source of
outcome routes.

## Acceptance

- The homepage shows one primary action and no more than four other distinct action targets above
  the footer.
- Every removed target stays reachable from `/start/` or the footer.
- A test in `tests/` counts distinct action targets on the built `/` and fails above five.

## Scope

- `src/pages/index.tsx`, `src/pages/index.module.css`
- `tests/ux-contract.test.mjs` only where it pins a removed element
