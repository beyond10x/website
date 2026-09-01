# AGENTS.md — website

The change contract for the authored source of the public beyond10x organization website.
Organization-wide naming and coordinated-migration rules live in `atlas/AGENTS.md`.

## Serves

- **O2 — decisions as data, with evidence.** Discovery, source revisions, relationships, routes,
  changes, and publication provenance are explicit and reproducible.
- **O5 — the generic agent platform.** The public receives one coherent entry point from vision to
  adoption and technical reference.

## Boundary

- This repository owns organization narrative, journeys, information architecture, visual shell,
  collection orchestration, and the root site build.
- Technical claims and documentation stay owned by their individual public repositories. Import
  only paths declared by their `b10x-docs/v3` manifests at commits in `sources.lock.json`.
- Collect sources through bounded bare Git object stores. Never create source worktrees, execute
  source code, load repository sidebars, or accept active MDX. Preserve the canonical collection
  index and extracted passive tree for each exact source revision so Atlas can verify locked content
  independently.
- For a coordinated preview whose locked source commits have not been pushed, set
  `B10X_SOURCE_WORKSPACE` to the absolute parent of the sibling repositories. This changes only the
  lock and Git-object fetch origins: `npm run sources:lock` requires clean checked-out `main` heads,
  while extraction still uses the exact locked commits and never reads dirty worktree bytes. Leave
  it unset for production and ordinary remote-backed builds.
- `beyond10x.github.io` is a generated deployment mirror. Do not author content there.
- `getting-started` is predecessor history, not an authority or a source dependency. It remains an
  explicit compatibility-only façade; do not add it to the 19-source lock.

## Presentation

- Compose discovery, profile, search, feed, API, and reference views from the shared Docs System
  components and semantic tokens. Keep Website-only components for organization narrative or an
  interaction that has no reusable cross-site meaning.
- Do not render raw `<pre>` elements. Use shared code components for React examples and label every
  Markdown fence: `bash` is copyable input, `shell-session` is a prompt/transcript, and `text` is
  intentionally plain output. Add real language grammars through the shared Prism contract.
- Shared-component usage and both source/build code-rendering contracts are gate requirements, not
  visual-review conventions.

## Gate

```bash
npm ci --ignore-scripts
npm run gate
```

Broken links and anchors fail the build. Lock, registry, route map, feeds, and provenance output
must be deterministic. Production provenance requires a nonzero full Website commit and the exact
19 source commits. The artifact crawler must cover manifest URLs, effective redirect targets, alias
sources, and rendered same-origin links. Use `npm run sources:freshness` as an explicit promotion
check against moving remote heads; never make rebuilding an immutable Website commit depend on
those heads remaining unchanged. File and route inventories are ordered by UTF-8 bytes, never by a
process locale. Reusable Pages workflows execute only their own immutable runtime revision; the
deployed Website revision is data, not executable tooling. Publication credentials and
bot-authenticated GitHub operations remain in private Atlas tooling; never commit credential
machinery or tokens here.
