---
format: aep.planning-md/1
id: story:render-ess-contracts
kind: story
status: active
title: Render shared ESS contracts and Mandate outlook
scope:
- confidence: cited
  path: docusaurus.config.ts
- confidence: cited
  path: package-lock.json
- confidence: cited
  path: package.json
- confidence: cited
  path: scripts
- confidence: cited
  path: sources.yaml
- confidence: cited
  path: src/components
- confidence: cited
  path: tests
revision: 7
---
# Publish browsable ESS contracts with Mandate outlook documentation

## Outcome

Website recognizes the existing ESS-owned ess-docs/1 passive projection and renders it through the shared Docs System contract viewer. Mandate owns its outlook and generated inputs. The user reviews a local version in Brave before website publication.

## Acceptance

Given collected ess-docs/1 data from an admitted source, when Website prepares and renders its reference, then its validated static summary, downloadable projection, shared interactive viewer, search and deep links are available; invalid projections fail preparation and unrelated catalogs retain their existing rendering.

## Scope

- scripts/prepare-site.mjs and scripts/ess-contract-reference.mjs: format selection, validation and passive reference generation.
- src/components/EssContractReference.tsx: fetch wrapper for shared presentation.
- package.json and package-lock.json: immutable shared Docs System dependency.
- tests: format selection, malformed input, escaping and byte-preserving downloads.
- sources.yaml: Mandate roster admission follows the reviewed Atlas catalog change.

## Dependencies and verification

Depends on Docs System story:shared-ess-contract-viewer and Mandate's foundation contracts and publication manifest. No new ESS domain or command semantics are introduced. Run unit tests, type checking, the relevant source/build rendering gates and a browser integration check. Production gate requires published immutable inputs; local preview evidence does not substitute for that gate.

## Publication condition

Operator requested a Brave review before this website goes out. Finish a concrete local preview and validation first; keep website publication pending that review. This is one integration story, with no decomposition panel.

## Local verification, 2026-09-17

The shared viewer integration passed 102 Website unit tests, TypeScript checking, production site build, source/build code rendering checks and the complete Website gate against the existing source roster. That gate verified 345 routes, 346 HTML documents, search, responsive/keyboard navigation, rendered diagrams/tables, and publication provenance. A separate Mandate preview exercised the actual format-selection helper, passive fetch wrapper and shared viewer with the unedited ESS projection. Browser checks cover navigation, declaration search, deep links and reload/history, focus, mobile width, diagrams and dark theme.

Website now pins Docs System's immutable review-branch commit. New Mandate source admission and final publication require the coordinated catalog/source changes and the operator's requested website review. The preview is local evidence, not an assertion that the public site has been deployed.

## Mandate roster integration

The roster now includes Mandate. The source lock was generated through the documented coordinated workspace path from clean exact commits, including published Mandate 2e6ea48e45b72740d8d8c5ca4045b322007a0654 and Docs System 669cc593d5adde421f16c93aa3547dcf73c77c10 candidate sources. Both are available remotely. The bound bootstrap snapshot and complete 26-source gate must be regenerated before this branch is pushed. Atlas's global admission currently refuses because paused Zwirn still depends on retired Platform; decision-blocker:paused-source-admission in Atlas records the prerequisite. This does not establish public delivery or replace the requested local review.
