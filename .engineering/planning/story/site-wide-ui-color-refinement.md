---
format: aep.planning-md/1
id: story:site-wide-ui-color-refinement
kind: story
status: implemented
title: Give the Website a richer, coherent visual system
summary: Apply twenty detailed color, interaction, responsive, and reading-surface refinements across the canonical Website shell.
tags:
- accessibility
- color-system
- ui
- website
relations:
- decomposes: epic:website-experience-refinement
scope:
- confidence: cited
  path: scripts/verify-navigation-layout.mjs
- confidence: cited
  path: src/components/ExperienceView.module.css
- confidence: cited
  path: src/css/custom.css
- confidence: cited
  path: src/pages/ecosystem.module.css
- confidence: cited
  path: src/pages/index.tsx
- confidence: cited
  path: src/pages/start.module.css
- confidence: cited
  path: tests/ux-contract.test.mjs
revision: 7
---
## Context

The current site has strong outcome-led information architecture and trustworthy shared components, but the visual system is uneven: the landing hero is expressive while interior pages and technical docs are mostly neutral, color is concentrated in small labels, active and hover states are understated, and the mobile composition needs a more intentional scale. The work stays Website-owned and composes the pinned Docs System components and tokens rather than forking them.

## Requested improvements

1. Establish a richer semantic light/dark palette for canvas, raised surfaces, ink, muted text, lines, focus, and four accent families.
2. Add subtle ambient canvas gradients that create depth without reducing text contrast.
3. Give the sticky navbar a refined translucent surface, hairline, compact brand treatment, and scroll-safe shadow.
4. Make active, hover, and focus navigation states unmistakable with color, shape, and motion.
5. Polish the theme control, mobile menu controls, and all touch targets as one control family.
6. Add a chromatic glow and layered grid treatment to the home hero.
7. Give the home headline a controlled accent treatment and safer responsive wrapping.
8. Turn the inspectability promise into a luminous status panel with distinct decision signals.
9. Strengthen primary and secondary calls to action with depth, arrow motion, and accessible focus states.
10. Create clearer section rhythm through alternating tinted bands and deliberate dividers.
11. Render the five-step loop as a connected, color-sequenced progression rather than five flat boxes.
12. Give each outcome gateway a stable accent identity and a clearer hover/focus affordance.
13. Make the closing reference panel a high-contrast destination rather than a quiet footer prelude.
14. Enrich shared page headers with layered color, a softer border, and a more dimensional shadow in both themes.
15. Refine shared content, project, adoption, and family cards with accent rails, elevation, and linked-title affordances.
16. Improve search fields, filter chips, selects, and active-filter tokens with stronger focus and selected states.
17. Improve typography rhythm, readable measures, balanced headings, and small-label tracking across landing and content views.
18. Give technical docs a tinted reading canvas, clearer sidebar selection, calmer breadcrumbs, and a more legible table-of-contents rail.
19. Polish tables, callouts, inline code, code panels, and diagrams so dense reference material belongs to the same visual family.
20. Tune narrow layouts, reduced-motion behavior, high-contrast focus, and touch spacing without horizontal clipping.

## Scope

- Website-wide semantic tokens and Docusaurus/shared-component composition in `src/css/custom.css`.
- Landing composition and polish in `src/pages/index.tsx` and `src/pages/start.module.css`.
- Discovery and experience rhythm in `src/pages/ecosystem.module.css` and `src/components/ExperienceView.module.css`.
- Focused regression assertions in `tests/ux-contract.test.mjs`.
- No source lock, bootstrap snapshot, imported repository content, Docs System implementation, or publication workflow change.

## Acceptance

The focused verification report records a passing four-route by two-width by two-theme matrix in which every numbered refinement maps to a screenshot observation or named UX assertion.

## Scheduling

Implement this story alone in the current run. It shares `src/pages/ecosystem.module.css` with `story:approachable-architecture-narrative`, `src/components/ExperienceView.module.css` with `story:blocked-path-recovery-guidance`, and `src/pages/index.tsx` with `story:plan-to-driven-implementation-handoff` and `story:verified-release-platform-facts`; do not schedule those stories concurrently.

## Evidence plan

Keep the supported dev server running for operator review, record before/after screenshots for representative routes and themes, run `npm run typecheck`, and run the focused UX/navigation tests; defer `npm run gate` and Atlas delivery gates until the release candidate.
