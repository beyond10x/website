import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts} from './artifact-contract.mjs';
import {ROOT_OWNED_REDIRECTS} from './root-redirect-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const origin = 'https://beyond10x.github.io';
const {files, routes} = await artifactFacts(build);
const fileSet = new Set(files.map((file) => file.path));
const routeSet = new Set(routes);
const failures = [];

const redirects = JSON.parse(await readFile(path.join(build, '.well-known', 'b10x-redirects.json'), 'utf8'));
const rootOwnedPaths = new Set(ROOT_OWNED_REDIRECTS.map((redirect) => normalizePath(redirect.from)));
const facadePaths = new Set(
  redirects.redirects
    .map((redirect) => normalizePath(redirect.from))
    .filter((redirect) => !rootOwnedPaths.has(redirect)),
);
for (const redirect of ROOT_OWNED_REDIRECTS) {
  const route = routeForPublicPath(redirect.from);
  if (!routeSet.has(route)) failures.push(`root-owned redirect ${redirect.from} is missing from the root artifact`);
}
for (const redirect of redirects.redirects) {
  if (redirect.type === 'html') requirePublicPath(redirect.to, `redirect ${redirect.from}`);
  else if (!fileSet.has(redirect.source)) failures.push(`alias ${redirect.from} references missing /${redirect.source}`);
}

const registry = JSON.parse(await readFile(path.join(root, '.generated', 'data', 'ecosystem.json'), 'utf8'));
for (const surface of registry.surfaces) {
  for (const [label, url] of [
    ['canonicalUrl', surface.canonicalUrl],
    ['adoption.url', surface.adoption?.url],
    ...(surface.sections ?? []).map((section) => [`section ${section.label}`, section.url]),
  ]) checkSameOrigin(url, `${surface.repository.id} ${label}`);
}
const manifests = JSON.parse(await readFile(path.join(root, '.generated', 'data', 'manifests.json'), 'utf8'));
for (const manifest of manifests) {
  for (const surface of manifest.surfaces ?? []) {
    for (const [label, url] of [
      ['canonicalUrl', surface.canonicalUrl],
      ['adoption.url', surface.adoption?.url],
      ...(surface.sections ?? []).map((section) => [`section ${section.label}`, section.url]),
    ]) checkSameOrigin(url, `${manifest.repository.id}/${surface.id} ${label}`);
  }
}

for (const file of files.filter((entry) => entry.path.endsWith('.html'))) {
  const html = await readFile(path.join(build, ...file.path.split('/')), 'utf8');
  const pageUrl = new URL(routeForFile(file.path), `${origin}/`);
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const destination = decodeEntities(match[1]);
    if (/^(?:mailto:|tel:|data:|javascript:|#)/i.test(destination)) continue;
    let resolved;
    try { resolved = new URL(destination, pageUrl); } catch { failures.push(`${file.path} contains invalid URL ${destination}`); continue; }
    if (resolved.origin !== origin) continue;
    requirePublicPath(resolved.pathname, `${file.path} -> ${destination}`);
  }
}

if (failures.length) throw new Error(`artifact crawl found ${failures.length} broken internal reference(s):\n${failures.slice(0, 100).map((failure) => `- ${failure}`).join('\n')}`);
process.stdout.write(`crawled ${routes.length} routes and ${files.length} files with no broken same-origin references\n`);

function checkSameOrigin(value, context) {
  if (!value) return;
  let resolved;
  try { resolved = new URL(value, `${origin}/`); } catch { failures.push(`${context} has invalid URL ${value}`); return; }
  if (resolved.origin === origin) requirePublicPath(resolved.pathname, context);
}

function requirePublicPath(value, context) {
  const pathname = decodeURIComponent(value).replace(/^\/+/, '');
  if (!pathname) {
    if (!routeSet.has('/')) failures.push(`${context} points to missing /`);
    return;
  }
  const route = `/${pathname.replace(/\/$/, '')}/`;
  if (routeSet.has(route) || facadePaths.has(normalizePath(`/${pathname}`)) || fileSet.has(pathname) || fileSet.has(`${pathname}/index.html`) || fileSet.has(pathname.replace(/\/$/, ''))) return;
  failures.push(`${context} points to missing ${value}`);
}

function normalizePath(value) {
  const pathname = `/${value.replace(/^\/+|\/+$/g, '')}`;
  return pathname === '/' ? '/' : pathname;
}

function routeForPublicPath(value) {
  const pathname = value.replace(/^\/+|\/+$/g, '');
  return pathname ? `/${pathname}/` : '/';
}

function routeForFile(file) {
  return file === 'index.html' ? '/' : file.endsWith('/index.html') ? `/${file.slice(0, -'index.html'.length)}` : `/${file}`;
}

function decodeEntities(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"');
}
