---
format: aep.planning-md/1
id: story:site-wide-code-fence-rendering-audit
kind: story
status: active
title: Make every rendered code fence readable and visibly highlighted
summary: Inventory the unified site’s code fences and harden source validation, Prism coverage, and visual presentation across every rendered docs route.
tags:
- adopter-experience
- docs-system
- documentation
- syntax-highlighting
- website
refs:
- provider: public-site
  reference: https://beyond10x.github.io/
- provider: repository
  reference: https://github.com/beyond10x/website
- provider: shared-renderer
  reference: https://github.com/beyond10x/docs-system
scope:
- confidence: cited
  path: CHANGELOG.md
- confidence: cited
  path: package-lock.json
- confidence: cited
  path: package.json
- confidence: cited
  path: scripts/code-contract.mjs
- confidence: cited
  path: scripts/generation-command.mjs
- confidence: cited
  path: sources.lock.json
- confidence: cited
  path: tests/code-contract.test.mjs
- confidence: cited
  path: tests/fixtures/code-fence-corpus.md
- confidence: cited
  path: tests/preview-workflow.test.mjs
revision: 5
---
## Problem

The unified documentation site contains fenced examples collected from many repositories, but passing a Markdown/build contract is not the same as looking good or being easy to read. We need to inspect the actual rendered output across the complete locked documentation corpus and make syntax highlighting, semantics, spacing, overflow, and light/dark presentation consistently trustworthy.

This is a Website-owned acceptance problem because Website composes and renders the public routes. Shared language normalization, Prism grammar coverage, components, and visual tokens remain owned by Docs System. Invalid source fences remain owned by the repository that authored them; fixes must never be made in the generated collection mirror.

## Requested improvement

Build a deterministic inventory of every fenced block in Website-authored pages and all documentation collected at the exact revisions in `sources.lock.json`. For each block, retain its source repository, source path, public route, declared language, normalized language, and whether the rendered HTML contains meaningful Prism tokens or deliberately plain `text`.

Use that inventory to inspect representative and exceptional rendered blocks in both themes and at desktop and narrow widths. Fix systemic rendering defects in Docs System, consume its pinned revision in Website, and route content defects—missing or misleading fence labels, malformed snippets, or unsuitable block boundaries—to the owning source repository.

The result should make input, terminal transcript, plain output, configuration, source code, diffs, and markup visibly distinct and pleasant to scan without pretending that plain text is syntax-highlighted.

## Acceptance criteria

- One deterministic report accounts for every Markdown fence in Website-authored content and every source locked by `sources.lock.json`; no rendered block is silently outside the audit.
- Every fence names a language or the explicit `text` fallback. Ambiguous aliases are normalized through the shared Docs System contract, and unsupported languages fail with the source repository, path, and public route.
- Every non-`text` language present in the corpus has a loaded Prism grammar and produces meaningful token markup in a representative fixture; `text` is accepted as intentionally unhighlighted.
- The rendered-site check rejects raw `<pre>`, missing language classes, unsupported languages, and language blocks that unexpectedly collapse to plain tokens.
- A visual specimen page or fixture covers every language and semantic class actually used by the corpus, including at least copyable commands, shell transcripts, plain output, configuration, source code, and diffs.
- Light and dark themes provide readable contrast, consistent padding and typography, clear block boundaries, usable copy controls, and no clipped content.
- Long lines, long unbroken tokens, line numbers, titles, and horizontal scrolling remain usable on desktop and narrow/mobile widths without breaking the surrounding page layout.
- A focused visual review records screenshots or equivalent review evidence for both themes and narrow/desktop layouts; it does not require a full Atlas gate for each iteration.
- Shared behavior is implemented and tested in Docs System first; Website consumes an exact published revision. Source-content fixes are committed in their owning repositories and then included through refreshed source locks.
- Website’s ordinary focused code-rendering checks and build keep the inventory and rendered guarantees from regressing.

## Source

Operator documentation review on 2026-09-03: “inspect all code fences rendered, make sure they do render in a nice way (code syntax highlighting, etc).”
