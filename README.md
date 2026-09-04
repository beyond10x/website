# beyond10x website

The authored source for the unified public beyond10x website at
<https://beyond10x.github.io/>. It combines organization-owned vision and audience-first experiences with
technical documentation selected by each public repository.

The source contract has a production bundle path and a retained local/legacy lock path:

- `sources.yaml` lists the complete active-source roster and the separate compatibility-only predecessor
  repositories; compatibility entries never enter the source lock.
- `b10x-docs-source-set/v1` selects one immutable, normalized Docs System bundle from the latest
  successful `main` producer run in every active source repository.
- `sources.lock.json` is the deterministic projection of that source set in production and remains
  the direct input for local preview and migration compatibility.
- each repository's `b10x.docs.yaml` declares the public, passive content it permits the site to
  publish.
- `legacy-routes.json` describes project Pages compatibility façades.
- the generated site carries byte-identical `/.well-known/b10x-docs.json` and `PROVENANCE.json`,
  plus `/._b10x/deployment.json` in the artifact and on the public URL.

Production collection reads only normalized bundle directories selected by Atlas and validates
their repository, commit, run, manifest, collection, content, and file digests before rendering.
It never checks out a source repository or runs source code. The local/legacy path continues to use
bounded bare Git object databases and likewise never creates worktrees or executes source code.
Both paths preserve the canonical Docs System collection index beside every passive source tree.

## Develop

Install the Node 24 dependencies once:

```bash
npm ci --ignore-scripts
```

For the normal edit-and-review loop, prepare the locked documentation once and start Docusaurus
with hot module replacement:

```bash
npm run dev -- --host 127.0.0.1 --port 3000 --no-open
```

`npm start` is an alias for the same safe path. Host and port arguments after `--` are passed to
Docusaurus. The preview shows a small revision, working-tree and generated-input status badge on
any non-production origin; the badge cannot appear on the canonical production origin.

When `.generated/` already represents the inputs you intend to review, skip collection on a
restart:

```bash
npm run dev:fast -- --host 127.0.0.1 --port 3000 --no-open
```

Fast mode requires the completion marker from a successful preparation and refuses a changed source
lock. It labels the running site **reused generated inputs** so other stale source content cannot
look fresh. Changes under `src/` hot-reload in either mode. Changes to source locks, manifests,
imported repository docs, bootstrap data or the experience catalog require `npm run dev` again.

Preview and production generation hold one cross-platform workspace lease. Stop a running preview
with `Ctrl-C` before `npm run gate` or `npm run preview:build`; overlapping commands fail clearly
instead of deleting generated modules underneath the review server.

For a local static compile without search indexing, crawl, redirects or provenance checks, run:

```bash
npm run preview:build
```

If the exact locked commits already exist in the direct sibling checkouts, the supported local
object path avoids remote fetch latency without reading dirty worktree bytes:

```bash
B10X_SOURCE_WORKSPACE=/absolute/path/to/beyond10x npm run dev -- --no-open
```

Before pushing, unset `B10X_SOURCE_WORKSPACE` and run the complete production gate:

```bash
unset B10X_SOURCE_WORKSPACE
npm run gate
```

Node 24 is the supported build runtime. `npm run gate` uses the source set named by
`B10X_DOCS_SOURCE_SET` when present; otherwise it builds the exact commits in the local/legacy
source lock. It verifies artifact/deployment digests and crawls every same-origin manifest,
redirect, alias, and rendered HTML link. The empty-lock bootstrap fixture is accepted only with
`B10X_BOOTSTRAP_FIXTURE=1` (or `npm run gate:fixture`) while bringing up a new catalog; it is never
valid production provenance.

When the source lock intentionally names local commits that have not been pushed yet, preview those
exact Git objects from sibling checkouts:

```bash
B10X_SOURCE_WORKSPACE=/absolute/path/to/beyond10x npm run sources:lock
B10X_SOURCE_WORKSPACE=/absolute/path/to/beyond10x npm run gate
B10X_SOURCE_WORKSPACE=/absolute/path/to/beyond10x npm start
```

`B10X_SOURCE_WORKSPACE` is an explicit local-preview input and must name the directory whose direct
children are the repositories in `sources.yaml`. The lock command requires every checkout to have a clean `main`
checked out, then pins that exact local HEAD. Collection fetches those locked commits from each
checkout's Git object database into the same bounded bare cache; source worktree bytes are never
used as publication input. With the variable unset, including in production, lock resolution and
collection remain remote-only. Production fetches use explicit anonymous HTTPS credentials and
discard developer and system Git configuration, URL rewrites, credential helpers, askpass programs,
and SSH-agent access. The source
roster therefore contains only repositories that anonymous HTTPS can fetch; private research
corpora never become Website inputs just because a developer can access them locally.

Before pushing Website, push every commit named by the lock and run `npm run gate` once with
`B10X_SOURCE_WORKSPACE` unset. This makes remote publication availability part of the handoff
instead of relying on commits that exist only in a local object database.

Provenance file and route inventories use explicit UTF-8 byte-lexical order. Verifiers in other
languages must use the same ordering contract; locale-sensitive comparison is not permitted.

## Presentation contract

Docs System is the shared component and design-token library; Website owns composition and the
organization shell. Discovery and profile views should use its headers, fact grids, callouts,
search/filter controls, card grids, project cards, and code/diagram renderers before adding a
site-specific equivalent. Narrative visuals on the home page remain Website-owned.

Every fenced block must name its semantics: `bash` for copyable input, `shell-session` for prompts
and output, and `text` for plain output or diagrams. The shared Prism list loads the remaining
language grammars. `npm run gate` rejects unlabeled or ambiguous `console` fences, raw React
`<pre>` elements, and rendered code that bypasses Prism.

Refresh the retained `sources.lock.json` only through the deterministic lock command after
repository-owned manifest changes have merged. Production freshness is decided by Atlas from the
latest successful bundle artifact for every source, not by Website or a moving Git checkout. The
generated `b10x-publication-layout/v2` stores `site/` beside the exact source bundles and bootstrap
inputs on `beyond10x.github.io`'s `published` branch; Pages uploads only `site/`. Publication is
performed by Atlas-owned bot automation, never by developer credentials in this repository.

Active and retired repository Pages sites are stable redirect façades. They call
`.github/workflows/redirect-facade.yml` at an immutable Website runtime and bind v2 provenance to
the repository's stable canonical/profile routes plus the runtime and caller control commits. A
fixed Website snapshot is accepted only during the one-time v1-to-v2 migration to preserve legacy
alias bytes; later content promotions do not rebuild or deploy façades. The reusable workflow
executes the generator and dependency lock from its own immutable `job.workflow_sha`.
`getting-started` remains explicitly admitted only for this permanent compatibility role.

Apache-2.0.
