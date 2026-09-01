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
  source code, load repository sidebars, or accept active MDX.
- `beyond10x.github.io` is a generated deployment mirror. Do not author content there.
- `getting-started` is predecessor history, not an authority or a source dependency. It remains an
  explicit compatibility-only façade; do not add it to the 19-source lock.

## Gate

```console
npm ci --ignore-scripts
npm run gate
```

Broken links and anchors fail the build. Lock, registry, route map, feeds, and provenance output
must be deterministic. Production provenance requires a nonzero full Website commit and the exact
19 source commits. The artifact crawler must cover manifest URLs, effective redirect targets, alias
sources, and rendered same-origin links. Use `npm run sources:freshness` as an explicit promotion
check against moving remote heads; never make rebuilding an immutable Website commit depend on
those heads remaining unchanged. Publication credentials and bot-authenticated GitHub operations
remain in private Atlas tooling; never commit credential machinery or tokens here.
