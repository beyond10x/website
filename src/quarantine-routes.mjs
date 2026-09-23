//! The one rule for a link into a quarantined source, shared by site preparation
//! (`scripts/link-rewriting.mjs`) and the Website's own pages and components (`src/lib/published.ts`).
//!
//! Every route prefix under which a source's pages, profile, specifications, data, field notes and
//! assets are published. A quarantined source publishes none of them, so a link into any of them goes
//! to the repository on GitHub instead — outside this origin, so outside what the crawler resolves
//! (operator decision, 2026-09-22, for `/docs/<repo>/` and `/ecosystem/<repo>/`; the same holds for
//! every other route the source would have owned).
const sourceOwnedRoute = /^(?:https:\/\/beyond10x\.github\.io)?\/(?:docs|ecosystem|api|components|data|source-assets|updates\/field-notes)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:[/?#]|$)/;

export function quarantinedRepositoryTarget(repository, quarantined) {
  return quarantined?.has(repository) ? `https://github.com/beyond10x/${repository}` : undefined;
}

/** Whether a URL is exactly what the rule sends a quarantined source's routes to, and nothing else. */
export function isQuarantinedRepositoryUrl(url, quarantined) {
  const repository = /^https:\/\/github\.com\/beyond10x\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(String(url))?.[1];
  return repository !== undefined && Boolean(quarantined?.has(repository));
}

export function quarantinedRouteTarget(url, quarantined) {
  if (typeof url !== 'string' || !quarantined?.size) return undefined;
  return quarantinedRepositoryTarget(sourceOwnedRoute.exec(url)?.[1], quarantined);
}

/**
 * What a lookup built from the published registry resolves a quarantined surface key
 * (`<repository>/<surface>`) to: the fields a link renders — name, target, repository — pointing at
 * the repository on GitHub. Anything else resolves to undefined.
 */
export function quarantinedSurfaceLink(key, quarantined) {
  const [repository, id] = String(key).split('/');
  const url = quarantinedRepositoryTarget(repository, quarantined);
  return url === undefined || !id ? undefined : {key, id, name: repository, canonicalUrl: url, repository: {id: repository, url}};
}

/**
 * A surface lookup built from the published registry, completed with every requested key of a
 * quarantined surface, so a reference to one renders as a link to its GitHub repository rather than
 * an anchor with no target. Quarantined surfaces never enter the registry itself (coordinator
 * decision, wave 2 U2); this completion exists only in the lookup a page renders from.
 */
export function completeSurfaceLookup(surfaces, keys, quarantined) {
  const completed = new Map(surfaces);
  for (const key of keys) {
    if (completed.has(key)) continue;
    const link = quarantinedSurfaceLink(key, quarantined);
    if (link) completed.set(key, link);
  }
  return completed;
}
