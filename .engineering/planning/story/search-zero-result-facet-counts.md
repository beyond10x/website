---
format: aep.planning-md/1
id: story:search-zero-result-facet-counts
kind: story
status: draft
title: Facet counts agree with the relevant search results
revision: 1
---
## Problem

On `/search/`, a query that matches nothing still shows nonzero facet counts beside
"Showing 0 of 0 matching pages" — for example "Adopter (1)" for `zzzznomatchqqq11`
(observed live at Website `a175d5d`, `regress-02-playwright.mjs` R3_facets, 2026-09-23).

Inferred cause, not verified: `src/pages/search.tsx` takes facet counts from Pagefind's
per-search `response.filters`, which counts every raw Pagefind match. The relevance filter
`isRelevantSearchResult` (`src/search-result-contract.mjs`) then drops the nonsense matches from
the result list, but not from the counts.

## Acceptance

- For a query whose relevant result count is 0, every facet count shown is 0 or the facet is hidden.
- For a real query (`worktree`), each facet count equals the number of relevant results carrying
  that facet value.
- `scripts/verify-search.mjs` asserts both against the built site.

## Scope

- `src/pages/search.tsx` (facet count source)
- `src/search-result-contract.mjs` (shared relevance predicate)
- `scripts/verify-search.mjs` (built-site assertion)
