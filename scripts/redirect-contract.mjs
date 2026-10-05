import {quarantinedRouteTarget} from '../src/quarantine-routes.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './artifact-contract.mjs';
import {assertPortableRelativePath} from './order-contract.mjs';

// An alias serves a copy of one artifact file. When that file belongs to a quarantined source it is
// not in the build, and a machine-readable URL has no truthful HTML fallback, so the alias is dropped;
// every other absent alias source still fails.
//
// A target that is a verified page of an independently published project site (`independent.pages`,
// from `loadIndependentPages`) is kept exactly as declared: it is not a root route, and the root
// build (`tools/website/src/routes.rs`) keeps it the same way. Projecting it onto the nearest root
// route instead made every façade that re-derives the root map refuse the deployed one.
export function effectiveRedirectMap(declared, {routes, files}, {quarantined = new Set(), independent = {pages: new Set(), bases: []}} = {}) {
  if (declared?.schema !== 'b10x-redirects/v1' || declared.origin !== 'https://beyond10x.github.io' || !Array.isArray(declared.redirects)) {
    throw new Error('legacy redirect contract is invalid');
  }
  const routeSet = new Set(routes);
  const fileSet = new Set(files.map((file) => typeof file === 'string' ? file : file.path));
  const seen = new Set();
  const redirects = declared.redirects.filter((redirect) => !(
    redirect.type === 'alias'
    && typeof redirect.source === 'string'
    && quarantinedRouteTarget(`/${redirect.source}`, quarantined)
  )).map((redirect) => {
    assertWebPath(redirect.from, 'legacy redirect source');
    if (seen.has(redirect.from)) throw new Error(`duplicate legacy redirect ${redirect.from}`);
    seen.add(redirect.from);
    if (redirect.type === 'alias') {
      assertPortableRelativePath(redirect.source, `legacy alias ${redirect.from}`);
      if (!fileSet.has(redirect.source)) throw new Error(`legacy alias source /${redirect.source} is absent from the root artifact`);
      return redirect;
    }
    if (redirect.type !== 'html') throw new Error(`legacy redirect ${redirect.from} has unsupported type ${String(redirect.type)}`);
    assertWebPath(redirect.to, `legacy redirect target ${redirect.from}`);
    if (independent.pages.has(normalizeRoute(redirect.to))) return redirect;
    if (independent.bases.some((base) => normalizeRoute(redirect.to).startsWith(base))) {
      throw new Error(`legacy redirect ${redirect.from} targets ${redirect.to}, which no verified independent route inventory names`);
    }
    // A target a quarantined source owns points at its GitHub repository, the rule every link follows.
    return {...redirect, to: quarantinedRouteTarget(redirect.to, quarantined) ?? nearestRoute(redirect.to, redirect.from, routeSet)};
  });
  return {...declared, redirects};
}

function nearestRoute(requested, legacySource, routes) {
  let candidate = normalizeRoute(requested);
  if (routes.has(candidate)) return candidate;
  while (candidate !== '/') {
    candidate = normalizeRoute(candidate.replace(/[^/]+\/$/, ''));
    if (routes.has(candidate)) return candidate;
  }
  const repository = legacySource.split('/').filter(Boolean)[0];
  for (const fallback of [`/docs/${repository}/`, `/ecosystem/${repository}/`, '/']) {
    if (routes.has(fallback)) return fallback;
  }
  throw new Error(`${legacySource} has no truthful built fallback for ${requested}`);
}

function normalizeRoute(value) {
  const route = `/${value.replace(/^\/+|\/+$/g, '')}/`.replace(/\/+/g, '/');
  return route === '//' ? '/' : route;
}

function assertWebPath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\') || (value !== '/' && value.includes('//')) || /%(?:2e|2f|5c)/i.test(value) || /\p{Cc}/u.test(value) || /[?#]/.test(value)) {
    throw new Error(`${label} is not a safe rooted path: ${String(value)}`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`${label} contains traversal: ${value}`);
  }
  if (segments.some((segment) => ['.git', '.gitattributes', '.gitignore'].includes(segment.toLowerCase()))) {
    throw new Error(`${label} contains forbidden Git metadata: ${value}`);
  }
  return value;
}

const ORIGIN = 'https://beyond10x.github.io';

// The verified pages of every independently published project site the Website data at `dataRoot`
// retains: `data/independent-sites.json` and each route inventory it names, checked against their
// declared digests and identity exactly as `tools/website/src/routes.rs` loads them. Website data
// without the file (any commit before independent sites existed) has none.
export async function loadIndependentPages(dataRoot) {
  let bytes;
  try {
    bytes = await readFile(path.join(dataRoot, 'data', 'independent-sites.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return {pages: new Set(), bases: []};
    throw error;
  }
  const document = JSON.parse(bytes);
  if (document.schema !== 'b10x-independent-sites/v1' || !Array.isArray(document.sites)) {
    throw new Error('invalid independent-sites schema');
  }
  const pages = new Set();
  const bases = [];
  for (const site of document.sites) {
    const repository = site.repository;
    if (typeof repository !== 'string' || !/^[a-z0-9-]+$/.test(repository)) throw new Error('invalid independent repository');
    const base = `/${repository}/`;
    if (site.origin !== ORIGIN || site.basePath !== base) throw new Error(`independent site ${repository} origin/base must match its project`);
    if (typeof site.sourceCommit !== 'string' || !/^(?!0{40}$)[0-9a-f]{40}$/.test(site.sourceCommit)) throw new Error(`invalid independent source commit for ${repository}`);
    if (typeof site.routesPath !== 'string' || !site.routesPath.startsWith('data/independent/')) {
      throw new Error(`independent inventory for ${repository} must be retained under data/independent`);
    }
    assertPortableRelativePath(site.routesPath, `independent inventory for ${repository}`);
    const inventoryBytes = await readFile(path.join(dataRoot, ...site.routesPath.split('/')));
    if (sha256(inventoryBytes) !== site.routesSha256) throw new Error(`independent route inventory digest mismatch for ${repository}`);
    const inventory = JSON.parse(inventoryBytes);
    if (inventory.schema !== 'b10x-project-routes/v1' || inventory.repository !== repository
      || inventory.commit !== site.sourceCommit || inventory.baseUrl !== base || !Array.isArray(inventory.routes)) {
      throw new Error(`independent route inventory identity mismatch for ${repository}`);
    }
    for (const route of inventory.routes) {
      if (typeof route?.path !== 'string' || !route.path.startsWith(base) || !route.path.endsWith('/')) {
        throw new Error(`independent route outside ${base} or noncanonical: ${String(route?.path)}`);
      }
      assertWebPath(route.path, `independent route of ${repository}`);
      pages.add(route.path);
    }
    bases.push(base);
  }
  return {pages, bases};
}
