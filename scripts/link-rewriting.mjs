//! Rewriting a source repository's links into the unified layout.
//!
//! Every document is flattened to `<repository>/<route>/index.md`, so a link written relative to
//! where the file sits in its own repository does not resolve here. These functions translate one
//! at a time, against the routes the assembled site actually publishes.
//!
//! Extracted from `prepare-site.mjs` so the translation can be tested without running a build.
//! `prepare-site.mjs` executes on import and takes a generation lease, so nothing could import it.
import path from 'node:path';
import {sourceKey} from './source-routing.mjs';

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
