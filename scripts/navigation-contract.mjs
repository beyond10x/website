import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'parse5';
import {artifactFacts} from './artifact-contract.mjs';
import {compareUtf8} from './order-contract.mjs';

export const PRIMARY_ROUTE_MATRIX = Object.freeze([
  '/',
  '/start/',
  '/learn/',
  '/build/',
  '/products/',
  '/operate/',
  '/contribute/',
  '/docs/',
  '/search/',
  '/ecosystem/',
  '/updates/',
  '/releases/',
  '/architecture/',
]);

export async function verifyRenderedNavigation({build, origin = 'https://beyond10x.github.io', redirects = {redirects: []}}) {
  const facts = await artifactFacts(build);
  const files = new Set(facts.files.map((file) => file.path));
  const routes = new Set(facts.routes);
  const documents = new Map();
  const diagnostics = [];
  let linksChecked = 0;

  for (const file of facts.files.filter((entry) => entry.path.endsWith('.html'))) {
    const route = routeForFile(file.path);
    documents.set(route, parseNavigationMarkup(await readFile(path.join(build, ...file.path.split('/')), 'utf8')));
  }

  for (const route of PRIMARY_ROUTE_MATRIX) {
    if (!routes.has(route)) diagnostics.push({source: 'primary route matrix', target: route, reason: 'missing route'});
  }

  for (const [sourceRoute, document] of documents) {
    for (const link of document.links) {
      if (!link.navigation && !PRIMARY_ROUTE_MATRIX.includes(sourceRoute)) continue;
      const resolved = resolveNavigationTarget(link.href, sourceRoute, {origin, files, routes, redirects});
      if (!resolved || resolved.external) continue;
      linksChecked += 1;
      if (!resolved.exists) {
        diagnostics.push({source: `${sourceRoute} (${link.label || 'unlabelled link'})`, target: resolved.pathname, reason: 'missing target'});
        continue;
      }
      if (resolved.fragment && resolved.route) {
        const target = documents.get(resolved.route);
        if (!target?.anchors.has(resolved.fragment)) {
          diagnostics.push({source: `${sourceRoute} (${link.label || 'unlabelled link'})`, target: `${resolved.pathname}#${resolved.fragment}`, reason: 'missing fragment'});
        }
      }
    }
  }

  diagnostics.sort((left, right) => compareUtf8(left.source, right.source) || compareUtf8(left.target, right.target));
  if (diagnostics.length) {
    throw new Error(`rendered navigation has ${diagnostics.length} defect(s):\n${diagnostics.map((item) => `- ${item.source} -> ${item.target} (${item.reason})`).join('\n')}`);
  }
  return {routeCount: routes.size, documentCount: documents.size, linksChecked};
}

export function parseNavigationMarkup(source) {
  const document = parse(source);
  const links = [];
  const anchors = new Set();
  visit(document, (node, ancestors) => {
    const attributes = new Map((node.attrs ?? []).map((attribute) => [attribute.name, attribute.value]));
    if (attributes.get('id')) anchors.add(attributes.get('id'));
    if (node.tagName === 'a') {
      if (attributes.get('name')) anchors.add(attributes.get('name'));
      if (attributes.has('href')) links.push({
        href: attributes.get('href'),
        label: nodeText(node).replace(/\s+/g, ' ').trim(),
        navigation: ancestors.some(isNavigationContainer),
      });
    }
  });
  return {links, anchors};
}

export function resolveNavigationTarget(raw, sourceRoute, {origin, files, routes, redirects = {redirects: []}}) {
  if (!raw || /^(?:mailto:|tel:|data:|javascript:|blob:)/i.test(raw)) return undefined;
  let url;
  try {
    url = new URL(raw, new URL(sourceRoute, `${origin}/`));
  } catch {
    return {external: false, exists: false, pathname: raw};
  }
  if (url.origin !== origin) return {external: true, exists: true, pathname: url.href};
  let pathname = decodePath(url.pathname);
  const redirectByPath = new Map((redirects.redirects ?? []).map((redirect) => [normalizePath(redirect.from), redirect]));
  const visited = new Set();
  while (redirectByPath.has(normalizePath(pathname))) {
    const key = normalizePath(pathname);
    if (visited.has(key)) return {external: false, exists: false, pathname, reason: 'redirect cycle'};
    visited.add(key);
    const redirect = redirectByPath.get(key);
    if (redirect.type === 'alias') {
      return {external: false, exists: files.has(redirect.source), pathname, file: redirect.source, fragment: decodeFragment(url.hash.slice(1))};
    }
    const redirected = new URL(redirect.to, `${origin}/`);
    pathname = decodePath(redirected.pathname);
  }
  const relative = pathname.replace(/^\/+/, '');
  const route = relative ? `/${relative.replace(/\/+$/, '')}/` : '/';
  const directRoute = routes.has(pathname) ? pathname : routes.has(route) ? route : undefined;
  const trimmed = relative.replace(/\/+$/, '');
  const file = [relative, `${trimmed}/index.html`, trimmed].find((candidate) => candidate && files.has(candidate));
  return {
    external: false,
    exists: Boolean(directRoute || file || (!relative && routes.has('/'))),
    pathname,
    route: directRoute ?? (file?.endsWith('.html') ? routeForFile(file) : undefined),
    fragment: decodeFragment(url.hash.slice(1)),
  };
}

function routeForFile(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

function nodeText(node) {
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(nodeText).join(' ');
}

function visit(node, callback, ancestors = []) {
  callback(node, ancestors);
  for (const child of node.childNodes ?? []) visit(child, callback, [...ancestors, node]);
  if (node.content) visit(node.content, callback, [...ancestors, node]);
}

function isNavigationContainer(node) {
  if (node.tagName === 'nav' || node.tagName === 'footer') return true;
  const classes = (node.attrs ?? []).find((attribute) => attribute.name === 'class')?.value?.split(/\s+/) ?? [];
  return classes.includes('navbar') || classes.includes('b10x-content-card');
}

function decodePath(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function decodeFragment(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function normalizePath(value) {
  const pathname = decodePath(new URL(value, 'https://beyond10x.github.io/').pathname);
  const normalized = `/${pathname.replace(/^\/+|\/+$/g, '')}`;
  return normalized === '/' ? '/' : normalized;
}
