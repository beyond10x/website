import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {parse} from 'yaml';
import {renderRedirectHtml} from '@beyond10x/docs-system/redirects';
import {routesFromFiles} from '../scripts/provenance-routes.mjs';
import {facadeRepositories, synthesizeFacadeRoutes} from '../scripts/facade-contract.mjs';
import {effectiveRedirectMap} from '../scripts/redirect-contract.mjs';
import {ROOT_OWNED_REDIRECTS, writeRootOwnedRedirects} from '../scripts/root-redirect-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('legacy inventory captures all audited HTML and machine routes exactly once', async () => {
  const map = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
  const html = map.redirects.filter((route) => route.type === 'html');
  const aliases = map.redirects.filter((route) => route.type === 'alias');
  assert.equal(html.length, 220);
  assert.equal(aliases.length, 14);
  assert.equal(new Set(map.redirects.map((route) => route.from)).size, map.redirects.length);
  assert.ok(html.some((route) => route.from === '/harness/' && route.to === '/ecosystem/harness/'));
  assert.ok(html.some((route) => route.from === '/journeys/understand/' && route.to === '/learn/safe-agentic-coding/'));
  assert.ok(html.some((route) => route.from === '/agentic-principles/principles' && route.to === '/components/agentic-principles/principles/'));
  assert.ok(html.some((route) => route.from === '/agentic-principles/research/research/2026-08-25T023000+0200_scoped-progress-under-partial-failure'
    && route.to === '/docs/agentic-principles/research/2026-08-25T023000+0200_scoped-progress-under-partial-failure/'));
  assert.deepEqual(
    html.filter((route) => ROOT_OWNED_REDIRECTS.some((expected) => expected.from === route.from)),
    ROOT_OWNED_REDIRECTS,
  );
  assert.ok(aliases.some((route) => route.from === '/aep-service/openapi.json' && route.source === 'api/aep-service/http-api/openapi.json' && route.mediaType === 'application/json'));
  assert.ok(
    aliases
      .filter((route) => route.from.endsWith('.xml'))
      .every((route) => route.mediaType === 'application/xml'),
  );
  assert.ok(
    aliases
      .filter((route) => route.from.endsWith('.json'))
      .every((route) => route.mediaType === 'application/json'),
  );
});

test('root-owned compatibility routes are materialized in the root artifact', async (context) => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'b10x-root-redirects-'));
  context.after(() => rm(output, {recursive: true, force: true}));
  const declared = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
  await writeRootOwnedRedirects(output, declared);
  for (const redirect of ROOT_OWNED_REDIRECTS) {
    const file = path.join(output, redirect.from.replace(/^\/+|\/+$/g, ''), 'index.html');
    const html = await readFile(file, 'utf8');
    assert.match(html, new RegExp(`<link rel="canonical" href="${new URL(redirect.to, declared.origin).href}"`));
    assert.match(html, /window\.location\.replace/);
  }
});

test('HTML compatibility pages preserve search and fragment and expose a canonical fallback', () => {
  const html = renderRedirectHtml('https://beyond10x.github.io', {from: '/docs/start', to: '/docs/harness/', type: 'html'});
  assert.match(html, /rel="canonical"/);
  assert.match(html, /window\.location\.search/);
  assert.match(html, /window\.location\.hash/);
  assert.match(html, /window\.location\.replace/);
});

test('frozen compatibility artifacts retain audited public bytes and provenance', async () => {
  const document = JSON.parse(
    await readFile(
      path.join(root, 'static', '.well-known', 'b10x-compatibility-artifacts.json'),
      'utf8',
    ),
  );
  assert.equal(document.schema, 'b10x-compatibility-artifacts/v1');
  assert.equal(document.artifacts.length, 1);
  for (const artifact of document.artifacts) {
    assert.match(artifact.sourceRevision, /^[0-9a-f]{40}$/);
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    const bytes = await readFile(path.join(root, artifact.path));
    assert.equal(bytes.byteLength, artifact.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
  }
});

test('source roster is complete, sorted, and lock is either the explicit bootstrap fixture or exact', async () => {
  const roster = await readFile(path.join(root, 'sources.yaml'), 'utf8');
  const rosterDocument = parse(roster);
  const repositories = rosterDocument.repositories;
  assert.ok(repositories.length > 0);
  assert.equal(repositories.length, 23);
  assert.deepEqual(repositories, [...repositories].sort());
  assert.deepEqual(rosterDocument.compatibilityRepositories, ['getting-started']);
  assert.ok(!repositories.includes('getting-started'));
  assert.ok(!repositories.includes('bench'), 'private Bench must never enter the public source roster');
  const lock = JSON.parse(await readFile(path.join(root, 'sources.lock.json'), 'utf8'));
  assert.equal(lock.schema, 'b10x-sources/v1');
  if (lock.sources.length > 0) {
    assert.equal(lock.sources.length, repositories.length);
    assert.deepEqual(lock.sources.map((source) => source.repository), repositories);
    assert.ok(lock.sources.every((source) => source.url !== 'https://github.com/beyond10x/bench'));
  }
});

test('provenance route inventory is deterministic and excludes the fallback document', () => {
  const routes = routesFromFiles([
    {path: 'VISION.html'},
    {path: 'myindex.html'},
    {path: 'vision/index.html'},
    {path: '404.html'},
    {path: 'index.html'},
    {path: 'docs/aep/index.html'},
  ]);
  assert.deepEqual(routes, ['/', '/VISION.html', '/docs/aep/', '/myindex.html', '/vision/']);
  assert.throws(() => routesFromFiles([{path: '../escape.html'}]), /not canonical/);
  assert.throws(() => routesFromFiles([{path: 'docs\\escape.html'}]), /not a portable relative path/);
  assert.throws(() => routesFromFiles([{path: 'docs/next\u0085line.html'}]), /not a portable relative path/);
  assert.throws(() => routesFromFiles([{path: 'docs/%2e%2e/escape.html'}]), /not a portable relative path/);
});

test('the superseded getting-started source remains an explicit compatibility-only façade', () => {
  const repositories = facadeRepositories({repositories: ['aep', 'website'], compatibilityRepositories: ['getting-started']});
  assert.deepEqual(repositories, ['aep', 'getting-started', 'website']);
  const redirects = synthesizeFacadeRoutes(
    'getting-started',
    [{from: '/', to: '/', type: 'html'}],
    new Set(['/', '/ecosystem/']),
  );
  assert.deepEqual(redirects, [
    {from: '/', to: '/', type: 'html'},
    {from: '/docs/', to: '/', type: 'html'},
    {from: '/ecosystem/', to: '/ecosystem/', type: 'html'},
  ]);
});

test('active repositories receive profile and documentation façade entry points', () => {
  const redirects = synthesizeFacadeRoutes('harness', [], new Set(['/', '/ecosystem/harness/', '/docs/harness/']));
  assert.deepEqual(redirects, [
    {from: '/', to: '/ecosystem/harness/', type: 'html'},
    {from: '/docs/', to: '/docs/harness/', type: 'html'},
    {from: '/ecosystem/', to: '/ecosystem/harness/', type: 'html'},
  ]);
});

test('effective redirects are an exact safe projection of declared compatibility routes', () => {
  const projected = effectiveRedirectMap({
    schema: 'b10x-redirects/v1',
    origin: 'https://beyond10x.github.io',
    redirects: [
      {from: '/old/', to: '/missing/leaf/', type: 'html'},
      {from: '/feed.xml', source: 'releases/rss.xml', type: 'alias', mediaType: 'application/rss+xml'},
    ],
  }, {
    routes: ['/', '/missing/'],
    files: [{path: 'releases/rss.xml'}],
  });
  assert.deepEqual(projected.redirects, [
    {from: '/old/', to: '/missing/', type: 'html'},
    {from: '/feed.xml', source: 'releases/rss.xml', type: 'alias', mediaType: 'application/rss+xml'},
  ]);
  assert.throws(() => effectiveRedirectMap({
    schema: 'b10x-redirects/v1', origin: 'https://beyond10x.github.io',
    redirects: [{from: '/../escape', to: '/', type: 'html'}],
  }, {routes: ['/'], files: []}), /traversal/);
  assert.throws(() => effectiveRedirectMap({
    schema: 'b10x-redirects/v1', origin: 'https://beyond10x.github.io',
    redirects: [{from: '/.Git/config', to: '/', type: 'html'}],
  }, {routes: ['/'], files: []}), /forbidden Git metadata/);
});
