import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {sha256} from '../scripts/artifact-contract.mjs';
import {effectiveRedirectMap, loadIndependentPages} from '../scripts/redirect-contract.mjs';

const commit = 'a'.repeat(40);

async function websiteData(context, {routesSha256} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'b10x-independent-pages-'));
  context.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(path.join(root, 'data', 'independent'), {recursive: true});
  const inventory = Buffer.from(`${JSON.stringify({
    baseUrl: '/substrate/',
    commit,
    repository: 'substrate',
    routes: [{anchors: ['main'], path: '/substrate/'}, {anchors: ['main'], path: '/substrate/docs/status/'}],
    schema: 'b10x-project-routes/v1',
  }, null, 2)}\n`);
  await writeFile(path.join(root, 'data', 'independent', 'substrate-routes.json'), inventory);
  await writeFile(path.join(root, 'data', 'independent-sites.json'), JSON.stringify({
    schema: 'b10x-independent-sites/v1',
    sites: [{
      repository: 'substrate',
      origin: 'https://beyond10x.github.io',
      basePath: '/substrate/',
      sourceCommit: commit,
      routesPath: 'data/independent/substrate-routes.json',
      routesSha256: routesSha256 ?? sha256(inventory),
    }],
  }));
  return root;
}

const declared = (to) => ({
  schema: 'b10x-redirects/v1',
  origin: 'https://beyond10x.github.io',
  redirects: [{from: '/docs/substrate/status/', to, type: 'html'}],
});
const artifact = {routes: ['/', '/ecosystem/'], files: []};

test('a redirect into a verified independent page keeps its target, as the root build does', async (context) => {
  // 2026-10-05: every façade that re-derives the root map (aep, aep-service, agentic-principles,
  // getting-started) refused the deployed root because this projection sent /substrate/docs/status/
  // to the nearest root route while the Rust root build kept it.
  const independent = await loadIndependentPages(await websiteData(context));
  assert.deepEqual([...independent.pages].sort(), ['/substrate/', '/substrate/docs/status/']);
  assert.deepEqual(
    effectiveRedirectMap(declared('/substrate/docs/status/'), artifact, {independent}).redirects,
    [{from: '/docs/substrate/status/', to: '/substrate/docs/status/', type: 'html'}],
  );
  assert.throws(
    () => effectiveRedirectMap(declared('/substrate/docs/missing/'), artifact, {independent}),
    /no verified independent route inventory names/,
  );
  assert.equal(effectiveRedirectMap(declared('/substrate/docs/status/'), artifact).redirects[0].to, '/');
});

test('independent pages are refused when the inventory does not match its declared digest', async (context) => {
  await assert.rejects(loadIndependentPages(await websiteData(context, {routesSha256: '0'.repeat(64)})), /digest mismatch/);
  const empty = await mkdtemp(path.join(os.tmpdir(), 'b10x-independent-none-'));
  context.after(() => rm(empty, {recursive: true, force: true}));
  assert.deepEqual(await loadIndependentPages(empty), {pages: new Set(), bases: []});
});
