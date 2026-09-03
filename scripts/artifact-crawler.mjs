import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'parse5';
import {artifactFacts} from './artifact-contract.mjs';
import {compareUtf8} from './order-contract.mjs';

const referenceAttributes = new Set(['href', 'src', 'poster', 'action', 'formaction', 'data']);
const ignoredSchemes = /^(?:mailto:|tel:|data:|javascript:|blob:)/i;

export async function crawlArtifact({build, origin, redirects, declaredReferences = [], publicRepositories = []}) {
  const facts = await artifactFacts(build);
  const fileSet = new Set(facts.files.map((file) => file.path));
  const routeSet = new Set(facts.routes);
  const redirectByPath = new Map(redirects.redirects.map((redirect) => [normalizePublicPath(redirect.from), redirect]));
  const knownRepositories = new Set(publicRepositories);
  const diagnostics = [];
  const parsedDocuments = new Map();
  let referencesChecked = 0;
  let externalReferences = 0;
  let htmlDocuments = 0;
  let cssDocuments = 0;
  let svgDocuments = 0;

  for (const file of facts.files) {
    const absolute = path.join(build, ...file.path.split('/'));
    if (file.path.endsWith('.html') || file.path.endsWith('.svg')) {
      const source = await readFile(absolute, 'utf8');
      const parsed = parseMarkup(source);
      parsedDocuments.set(routeForFile(file.path), parsed);
      if (file.path.endsWith('.html')) htmlDocuments += 1;
      else svgDocuments += 1;
    }
  }

  const checkReference = (raw, baseUrl, context) => {
    const value = decodeEntities(String(raw).trim());
    if (!value || ignoredSchemes.test(value)) return;
    referencesChecked += 1;
    let resolved;
    try {
      resolved = new URL(value, baseUrl);
    } catch {
      diagnostics.push(diagnostic('invalid-url', context, value));
      return;
    }
    if (resolved.origin !== origin) {
      externalReferences += 1;
      const github = /^\/beyond10x\/([^/]+)(?:\/|$)/.exec(resolved.pathname);
      if (resolved.hostname === 'github.com' && github && !knownRepositories.has(github[1])) {
        diagnostics.push(diagnostic('private-or-uncatalogued-repository', context, resolved.href));
      }
      return;
    }
    const target = resolveInternalTarget(resolved.pathname, {fileSet, routeSet, redirectByPath, diagnostics, context});
    if (!target) return;
    if (resolved.hash) {
      const fragment = decodeFragment(resolved.hash.slice(1));
      if (!fragment) return;
      const parsed = parsedDocuments.get(target.route);
      if (!parsed) {
        diagnostics.push(diagnostic('fragment-on-non-document', context, `${resolved.pathname}${resolved.hash}`));
      } else if (!parsed.anchors.has(fragment)) {
        diagnostics.push(diagnostic('missing-fragment', context, `${resolved.pathname}${resolved.hash}`));
      }
    }
  };

  for (const [route, document] of parsedDocuments) {
    const pageUrl = new URL(route, `${origin}/`);
    const effectiveBase = document.baseHref ? new URL(document.baseHref, pageUrl) : pageUrl;
    for (const reference of document.references) {
      checkReference(reference.value, effectiveBase, `${document.fileHint ?? route} ${reference.attribute}`);
    }
    for (const css of document.inlineCss) {
      for (const value of cssReferences(css)) checkReference(value, effectiveBase, `${route} inline CSS`);
    }
  }

  for (const file of facts.files.filter((entry) => entry.path.endsWith('.css'))) {
    cssDocuments += 1;
    const source = await readFile(path.join(build, ...file.path.split('/')), 'utf8');
    const baseUrl = new URL(`/${file.path}`, `${origin}/`);
    for (const value of cssReferences(source)) checkReference(value, baseUrl, `${file.path} CSS`);
  }

  for (const reference of declaredReferences) {
    checkReference(reference.url, new URL('/', `${origin}/`), reference.context);
  }

  for (const redirect of redirects.redirects) {
    if (redirect.type === 'html') {
      checkReference(redirect.to, new URL('/', `${origin}/`), `redirect ${redirect.from}`);
    } else if (!fileSet.has(redirect.source)) {
      diagnostics.push(diagnostic('missing-alias-source', `alias ${redirect.from}`, `/${redirect.source}`));
    }
  }

  diagnostics.sort((left, right) => compareUtf8(left.code, right.code) || compareUtf8(left.context, right.context) || compareUtf8(left.target, right.target));
  return {
    report: {
      schema: 'b10x-website-quality/v1',
      status: diagnostics.length ? 'failed' : 'passed',
      routeCount: facts.routes.length,
      fileCount: facts.files.length,
      htmlDocuments,
      svgDocuments,
      cssDocuments,
      redirectsChecked: redirects.redirects.length,
      referencesChecked,
      externalReferences,
      diagnostics,
    },
    facts,
  };
}

export function parseMarkup(source) {
  const document = parse(source, {sourceCodeLocationInfo: false});
  const references = [];
  const anchors = new Set();
  const inlineCss = [];
  let baseHref;
  visit(document, (node) => {
    const attributes = new Map((node.attrs ?? []).map((attribute) => [attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name, attribute.value]));
    for (const attribute of node.attrs ?? []) {
      const name = attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name;
      if (referenceAttributes.has(attribute.name) || name === 'xlink:href') {
        references.push({attribute: name, value: attribute.value});
      } else if (attribute.name === 'srcset') {
        for (const value of srcsetReferences(attribute.value)) references.push({attribute: 'srcset', value});
      } else if (attribute.name === 'style') {
        inlineCss.push(attribute.value);
      }
    }
    if (attributes.get('id')) anchors.add(attributes.get('id'));
    if (node.tagName === 'a' && attributes.get('name')) anchors.add(attributes.get('name'));
    if (node.tagName === 'base' && attributes.get('href') && !baseHref) baseHref = attributes.get('href');
    if (node.tagName === 'meta' && /^refresh$/i.test(attributes.get('http-equiv') ?? '')) {
      const refresh = /(?:^|;)\s*url\s*=\s*(.+)$/i.exec(attributes.get('content') ?? '');
      if (refresh) references.push({attribute: 'meta-refresh', value: stripQuotes(refresh[1].trim())});
    }
    if (node.tagName === 'style') {
      inlineCss.push((node.childNodes ?? []).filter((child) => child.nodeName === '#text').map((child) => child.value ?? '').join(''));
    }
  });
  return {references, anchors, inlineCss, baseHref};
}

export function cssReferences(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const references = [];
  for (const match of withoutComments.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s][^)]*?))\s*\)/gi)) {
    references.push((match[1] ?? match[2] ?? match[3] ?? '').trim());
  }
  for (const match of withoutComments.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gi)) {
    references.push(match[1]);
  }
  return references;
}

export function srcsetReferences(source) {
  if (/^\s*data:/i.test(source)) return [];
  return source.split(',').map((candidate) => candidate.trim().split(/\s+/, 1)[0]).filter(Boolean);
}

function resolveInternalTarget(pathname, {fileSet, routeSet, redirectByPath, diagnostics, context}) {
  let current = normalizePublicPath(pathname);
  const visited = new Set();
  while (redirectByPath.has(current)) {
    if (visited.has(current)) {
      diagnostics.push(diagnostic('redirect-cycle', context, pathname));
      return undefined;
    }
    visited.add(current);
    const redirect = redirectByPath.get(current);
    if (redirect.type === 'alias') return {file: redirect.source};
    let next;
    try {
      next = new URL(redirect.to, 'https://beyond10x.github.io/');
    } catch {
      diagnostics.push(diagnostic('invalid-redirect-target', context, redirect.to));
      return undefined;
    }
    current = normalizePublicPath(next.pathname);
  }

  const relative = decodePath(current).replace(/^\/+/, '');
  if (!relative) return routeSet.has('/') ? {route: '/'} : missing();
  const route = `/${relative.replace(/\/$/, '')}/`;
  if (routeSet.has(route)) return {route};
  if (routeSet.has(current)) return {route: current};
  for (const candidate of [relative, `${relative}/index.html`, relative.replace(/\/$/, '')]) {
    if (!fileSet.has(candidate)) continue;
    return /\.(?:html|svg)$/i.test(candidate) ? {route: routeForFile(candidate), file: candidate} : {file: candidate};
  }
  return missing();

  function missing() {
    diagnostics.push(diagnostic('missing-internal-target', context, pathname));
    return undefined;
  }
}

function visit(node, callback) {
  callback(node);
  for (const child of node.childNodes ?? []) visit(child, callback);
  if (node.content) visit(node.content, callback);
}

function routeForFile(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

function normalizePublicPath(value) {
  let pathname;
  try {
    pathname = new URL(value, 'https://beyond10x.github.io/').pathname;
  } catch {
    pathname = value;
  }
  const decoded = decodePath(pathname);
  const normalized = `/${decoded.replace(/^\/+|\/+$/g, '')}`;
  return normalized === '/' ? '/' : normalized;
}

function decodePath(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function decodeFragment(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function decodeEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function stripQuotes(value) {
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

function diagnostic(code, context, target) {
  return {code, context, target};
}
