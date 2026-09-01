import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {parse} from 'yaml';
import {renderRedirectHtml} from '@beyond10x/docs-system/redirects';
import {routesFromFiles} from '../scripts/provenance-routes.mjs';
import {facadeRepositories, synthesizeFacadeRoutes} from '../scripts/facade-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('legacy inventory captures all audited HTML and machine routes exactly once', async () => {
  const map = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
  const html = map.redirects.filter((route) => route.type === 'html');
  const aliases = map.redirects.filter((route) => route.type === 'alias');
  assert.equal(html.length, 212);
  assert.equal(aliases.length, 14);
  assert.equal(new Set(map.redirects.map((route) => route.from)).size, map.redirects.length);
  assert.ok(html.some((route) => route.from === '/harness/' && route.to === '/ecosystem/harness/'));
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
  assert.equal(repositories.length, 19);
  assert.deepEqual(repositories, [...repositories].sort());
  assert.deepEqual(rosterDocument.compatibilityRepositories, ['getting-started']);
  assert.ok(!repositories.includes('getting-started'));
  const lock = JSON.parse(await readFile(path.join(root, 'sources.lock.json'), 'utf8'));
  assert.equal(lock.schema, 'b10x-sources/v1');
  if (lock.sources.length > 0) assert.deepEqual(lock.sources.map((source) => source.repository), repositories);
});

test('provenance route inventory is deterministic and excludes the fallback document', () => {
  const routes = routesFromFiles([
    {path: 'vision/index.html'},
    {path: '404.html'},
    {path: 'index.html'},
    {path: 'docs/aep/index.html'},
  ]);
  assert.deepEqual(routes, ['/', '/docs/aep/', '/vision/']);
});

test('the retired getting-started repository remains an explicit compatibility-only façade', () => {
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
