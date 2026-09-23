import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {buildRedirectFacade} from '../scripts/build-redirect-facade.mjs';
import {crawlArtifact} from '../scripts/artifact-crawler.mjs';
import {canonicalJson, sha256} from '../scripts/artifact-contract.mjs';
import {effectiveRedirectMap} from '../scripts/redirect-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'https://beyond10x.github.io';

// build-redirect-facade.mjs now accepts b10x-website-provenance/v3 and projects the root's
// effective redirect map with the root's quarantined sources, so a façade can be built against a
// quarantined root deployment. In that map every legacy redirect into the quarantined source points
// at https://github.com/beyond10x/<repo>; the façade must publish those redirects, not refuse them.
test('a legacy façade for a quarantined source builds against the quarantined root and redirects to GitHub', async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'b10x-quarantine-facade-'));
  context.after(() => rm(temporary, {recursive: true, force: true}));
  const legacyBytes = await readFile(path.join(root, 'legacy-routes.json'));
  const legacy = JSON.parse(legacyBytes);
  const websiteCommit = 'c'.repeat(40);
  const quarantinedSources = [{repository: 'harness', check: 'bundle-schema', message: 'harness bundle.json is invalid'}];
  const quarantined = new Set(['harness']);
  // Every alias source the other repositories declare is present; no /docs/harness/ or
  // /ecosystem/harness/ route exists, as in a build with harness quarantined.
  const files = legacy.redirects
    .filter((redirect) => redirect.type === 'alias')
    .map((redirect) => ({path: redirect.source, sha256: 'd'.repeat(64), size: 1}));
  const routes = ['/', '/docs/', '/ecosystem/'];
  const effectiveBytes = Buffer.from(canonicalJson(effectiveRedirectMap(legacy, {routes, files}, {quarantined})));
  files.push({path: '.well-known/b10x-redirects.json', sha256: sha256(effectiveBytes), size: effectiveBytes.byteLength});
  const provenance = {
    schema: 'b10x-website-provenance/v3',
    websiteCommit,
    sourcesLockSha256: 'e'.repeat(64),
    legacyRoutesSha256: sha256(legacyBytes),
    routesSha256: 'f'.repeat(64),
    artifactSha256: 'a'.repeat(64),
    sourceCommits: [],
    quarantinedSources,
    routes,
    files,
  };
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target === `${origin}/.well-known/b10x-docs.json`) return new Response(canonicalJson(provenance));
    if (target === `${origin}/.well-known/b10x-redirects.json`) return new Response(effectiveBytes);
    return new Response('not found', {status: 404});
  };

  const result = await buildRedirectFacade({
    repository: 'harness',
    websiteSha: websiteCommit,
    out: path.join(temporary, 'site'),
  });
  const landing = result.redirects.find((redirect) => redirect.from === '/');
  assert.equal(landing.to, 'https://github.com/beyond10x/harness');
});

// The crawler follows a same-origin link through the effective redirect map. When that redirect
// now leaves the origin for the quarantined source's GitHub repository, the link resolves; it is
// not a missing internal target.
test('the crawler follows a legacy redirect into a quarantined source to GitHub instead of reporting it missing', async (context) => {
  const build = await mkdtemp(path.join(os.tmpdir(), 'b10x-quarantine-crawl-'));
  context.after(() => rm(build, {recursive: true, force: true}));
  await mkdir(build, {recursive: true});
  await writeFile(path.join(build, 'index.html'), '<!doctype html><html><body><a href="/harness/">Harness</a></body></html>');
  const redirects = {
    schema: 'b10x-redirects/v1',
    origin,
    redirects: [{from: '/harness/', to: 'https://github.com/beyond10x/harness', type: 'html'}],
  };
  const {report} = await crawlArtifact({build, origin, redirects, publicRepositories: ['harness']});
  assert.deepEqual(report.diagnostics, []);
});
