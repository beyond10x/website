import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts, canonicalJson} from './artifact-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const declared = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
const {routes, files} = await artifactFacts(build);
const routeSet = new Set(routes);
const fileSet = new Set(files.map((file) => file.path));
const redirects = declared.redirects.map((redirect) => {
  if (redirect.type === 'alias') {
    if (!fileSet.has(redirect.source)) throw new Error(`legacy alias source /${redirect.source} is absent from the root artifact`);
    return redirect;
  }
  return {...redirect, to: nearestRoute(redirect.to, redirect.from, routeSet)};
});
const output = {...declared, redirects};
await mkdir(path.join(build, '.well-known'), {recursive: true});
await writeFile(path.join(build, '.well-known', 'b10x-redirects.json'), canonicalJson(output));
process.stdout.write(`wrote ${redirects.length} effective compatibility routes; every target and alias exists\n`);

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
