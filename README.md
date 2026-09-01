# beyond10x website

The authored source for the unified public beyond10x website at
<https://beyond10x.github.io/>. It combines organization-owned vision and adoption journeys with
technical documentation selected by each public repository.

The source contract is deliberately split:

- `sources.yaml` lists the exact 19 active sources and the separate compatibility-only predecessor
  repositories; compatibility entries never enter the source lock.
- `sources.lock.json` pins an exact commit and content digest for every source.
- each repository's `b10x.docs.yaml` declares the public, passive content it permits the site to
  publish.
- `legacy-routes.json` describes project Pages compatibility façades.
- the generated site carries byte-identical `/.well-known/b10x-docs.json` and `PROVENANCE.json`,
  plus `/._b10x/deployment.json` in the artifact and on the public URL.

Collection uses bare Git object databases and never creates worktrees or runs source code.
Each build also records the canonical Docs System collection index for every locked source beside
the extracted passive tree. Atlas uses those indexes to verify every selected byte and the locked
`contentSha256` independently before publication.

## Develop

```console
npm ci --ignore-scripts
npm run gate
npm start
```

Node 24 is the supported build runtime. `npm run gate` is the reproducible production gate: it
builds only the exact commits in the source lock, verifies artifact/deployment digests, and crawls
every same-origin manifest, redirect, alias, and rendered HTML link. The empty-lock bootstrap
fixture is accepted only with `B10X_BOOTSTRAP_FIXTURE=1` (or `npm run gate:fixture`) while bringing
up a new catalog; it is never valid production provenance.

When the source lock intentionally names local commits that have not been pushed yet, preview those
exact Git objects from sibling checkouts:

```console
B10X_SOURCE_WORKSPACE=/absolute/path/to/beyond10x npm run sources:lock
B10X_SOURCE_WORKSPACE=/absolute/path/to/beyond10x npm run gate
B10X_SOURCE_WORKSPACE=/absolute/path/to/beyond10x npm start
```

`B10X_SOURCE_WORKSPACE` is an explicit local-preview input and must name the directory whose direct
children are the 19 repositories. The lock command requires every checkout to have a clean `main`
checked out, then pins that exact local HEAD. Collection fetches those locked commits from each
checkout's Git object database into the same bounded bare cache; source worktree bytes are never
used as publication input. With the variable unset, including in production, lock resolution and
collection remain remote-only.

Provenance file and route inventories use explicit UTF-8 byte-lexical order. Verifiers in other
languages must use the same ordering contract; locale-sensitive comparison is not permitted.

Refresh `sources.lock.json` only through the deterministic lock command after repository-owned
manifest changes have merged. Atlas and release operators can run `npm run sources:freshness` to
compare the committed lock with the current 19 remote `main` heads; moving-tip freshness is kept
separate from rebuilding an immutable Website commit. The generated `beyond10x.github.io` artifact
is published by Atlas-owned bot automation, not from developer credentials in this repository.

Active and retired repository Pages sites are redirect façades. They call
`.github/workflows/redirect-facade.yml` at an immutable Website commit, verify downloaded aliases
against the deployed root provenance, and publish their own façade provenance. The reusable
workflow executes the generator and dependency lock from its own immutable `job.workflow_sha`;
the newly deployed Website revision is checked out separately and parsed only as data.
`getting-started` remains explicitly admitted only for this permanent compatibility role.

Apache-2.0.
