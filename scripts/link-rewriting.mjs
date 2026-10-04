//! Rewriting a source repository's links into the unified layout.
//!
//! Every document is flattened to `<repository>/<route>/index.md`, so a link written relative to
//! where the file sits in its own repository does not resolve here. These functions translate one
//! at a time, against the routes the assembled site actually publishes.
//!
//! Extracted from `prepare-site.mjs` so the translation can be tested without running a build.
//! `prepare-site.mjs` executes on import and takes a generation lease, so nothing could import it.
import path from 'node:path';
import {quarantinedRouteTarget} from '../src/quarantine-routes.mjs';
import {sourceKey} from './source-routing.mjs';

export {quarantinedRouteTarget};

export function rewriteLinks(body, context) {
  const markdown = body.replace(/(!?\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, destination) => {
    const resolved = resolveLink(destination, context, {image: label.startsWith('!')});
    return resolved === destination ? match : `${label}(${resolved})`;
  });
  const withAttributes = markdown.replace(/(<[A-Za-z][A-Za-z0-9.-]*\b[^>]*?\s(?:href|src)=["'])([^"']+)(["'])/g, (match, prefix, destination, quote) => {
    const resolved = resolveLink(destination, context, {image: /\ssrc=["']$/i.test(prefix)});
    return `${prefix}${resolved}${quote}`;
  });
  // A reference-style link definition is the third form a relative link is written in, and until
  // this existed it was the one that went through unrewritten. `[formats]: ./formats.md` in
  // ess/website/docs/reference/spec-versions.md reached the unified build pointing at a sibling
  // that does not exist once the document is flattened to `ess/reference/spec-versions/index.md`,
  // and failed the build for every repository. The repository's own Docusaurus reads the file
  // where it sits, so nothing before the shared build could see it.
  return withAttributes.replace(
    /^([ ]{0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]*>|\S+)([ \t]*(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\))?[ \t]*)$/gm,
    (match, prefix, destination, title) => {
      const bracketed = destination.startsWith('<') && destination.endsWith('>');
      const target = bracketed ? destination.slice(1, -1) : destination;
      const resolved = resolveLink(target, context, {image: false});
      if (resolved === target) return match;
      return `${prefix}${bracketed ? `<${resolved}>` : resolved}${title}`;
    },
  );
}

export function resolveLink(destination, context, {image}) {
  const resolved = resolvePublishedLink(destination, context, {image});
  if (!context.quarantined?.size) return resolved;
  return quarantinedRouteTarget(resolved, context.quarantined) ?? resolved;
}

/** A copy of a Website projection (registry, manifests, ledger) with every quarantined route redirected. */
export function redirectQuarantinedUrls(value, quarantined) {
  if (typeof value === 'string') return quarantinedRouteTarget(value, quarantined) ?? value;
  if (Array.isArray(value)) return value.map((item) => redirectQuarantinedUrls(item, quarantined));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redirectQuarantinedUrls(item, quarantined)]));
  }
  return value;
}

const WEBSITE_ORIGIN = 'https://beyond10x.github.io';

/**
 * Where the unified site publishes each collected post, keyed by the URL its own project site
 * publishes it at. A source declares that URL through a feed on its own project path: ESS declares
 * `https://beyond10x.github.io/ess/releases/rss.xml`, so its post `slug: set-effects` lives at
 * `/ess/releases/set-effects/` there and at `/updates/field-notes/ess/set-effects/` here.
 */
export function projectPostRoutes(manifests, posts) {
  const bases = new Map();
  for (const manifest of manifests) {
    const repository = manifest.repository.id;
    for (const surface of manifest.surfaces ?? []) {
      for (const feed of surface.feeds ?? []) {
        let url;
        try { url = new URL(feed.url); } catch { continue; }
        if (url.origin !== WEBSITE_ORIGIN || !url.pathname.startsWith(`/${repository}/`)) continue;
        const base = url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
        if (base === `/${repository}/`) continue;
        if (!bases.has(repository)) bases.set(repository, new Set());
        bases.get(repository).add(base);
      }
    }
  }
  const routes = new Map();
  for (const {repository, slug, route} of posts) {
    const cleaned = String(slug ?? '').replace(/^\/+|\/+$/g, '');
    if (!cleaned) continue;
    for (const base of bases.get(repository) ?? []) routes.set(`${base}${cleaned}/`, route);
  }
  return routes;
}

function projectPostTarget(destination, context) {
  if (!context.projectPostRoutes?.size) return undefined;
  let url;
  try {
    url = destination.startsWith('/') && !destination.startsWith('//')
      ? new URL(destination, WEBSITE_ORIGIN)
      : new URL(destination);
  } catch {
    return undefined;
  }
  if (url.origin !== WEBSITE_ORIGIN) return undefined;
  const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const route = context.projectPostRoutes.get(pathname);
  return route ? `${route}${url.search}${url.hash}` : undefined;
}

function resolvePublishedLink(destination, context, {image}) {
  const post = image ? undefined : projectPostTarget(destination, context);
  if (post) return post;
  if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(destination)) return destination;
  const suffixIndex = destination.search(/[?#]/);
  const target = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : destination.slice(suffixIndex);
  let decoded;
  try { decoded = decodeURI(target); } catch { return destination; }
  const base = decoded.startsWith('/')
    ? decoded.replace(/^\/+/, '')
    : path.posix.normalize(path.posix.join(path.posix.dirname(context.file.sourcePath), decoded));
  const roots = [base];
  const repositoryPrefix = `${context.file.repository}/`;
  if (decoded.startsWith('/') && base.startsWith(repositoryPrefix)) roots.push(base.slice(repositoryPrefix.length));
  for (const rootCandidate of roots) {
    for (const candidate of sourceCandidates(rootCandidate, {rootRelative: decoded.startsWith('/')})) {
      const document = context.routeBySource.get(sourceKey(context.file.repository, candidate));
      if (document) return `${document}${suffix}`;
      const fieldNote = context.blogRouteBySource.get(sourceKey(context.file.repository, candidate));
      if (fieldNote) return `${fieldNote}${suffix}`;
      const asset = context.assetBySource.get(sourceKey(context.file.repository, candidate));
      if (asset) return `${asset}${suffix}`;
    }
  }
  if (decoded.startsWith('/')) return `${canonicalSectionUrl(context.file.repository, decoded)}${suffix}`;
  if (image) return `https://raw.githubusercontent.com/beyond10x/${context.file.repository}/${context.commit}/${encodeURI(base)}${suffix}`;
  return `${context.repositoryUrl}/blob/${context.commit}/${encodeURI(base)}${suffix}`;
}

function sourceCandidates(target, {rootRelative}) {
  const cleaned = target.replace(/^\.\//, '').replace(/\/$/, '');
  const roots = rootRelative ? [cleaned, `static/${cleaned}`, `website/static/${cleaned}`, `docs/${cleaned}`, `website/docs/${cleaned}`] : [cleaned];
  return [...new Set(roots.flatMap((candidate) => /\.(?:md|mdx)$/i.test(candidate)
    ? [candidate]
    : [candidate, `${candidate}.md`, `${candidate}.mdx`, `${candidate}/README.md`, `${candidate}/README.mdx`, `${candidate}/index.md`, `${candidate}/index.mdx`]))];
}

export function canonicalSectionUrl(repository, url) {
  if (url.startsWith(`https://beyond10x.github.io/${repository}/docs/`)) return url.replace(`https://beyond10x.github.io/${repository}/docs/`, `/docs/${repository}/`);
  if (url === `https://beyond10x.github.io/${repository}/` || url === `/${repository}/`) return `/docs/${repository}/`;
  if (url.startsWith(`/${repository}/docs/`)) return url.replace(`/${repository}/docs/`, `/docs/${repository}/`);
  if (url === `/${repository}/api` || url === `/${repository}/api/`) return `/api/${repository}/`;
  if (url.startsWith('/docs/') && !url.startsWith(`/docs/${repository}/`)) return `/docs/${repository}/${url.slice('/docs/'.length)}`;
  return url;
}
