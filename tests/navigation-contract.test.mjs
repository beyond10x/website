import assert from 'node:assert/strict';
import test from 'node:test';
import {parseNavigationMarkup, resolveNavigationTarget} from '../scripts/navigation-contract.mjs';

test('rendered navigation parsing includes header, sidebar, card, and footer anchors', () => {
  const parsed = parseNavigationMarkup(`<!doctype html><html><body>
    <header><nav><a href="/learn/">Learn</a></nav></header>
    <nav aria-label="Docs sidebar"><a href="guide/#proof">Guide</a></nav>
    <main><article class="b10x-content-card"><a href="/build/">Build card</a></article></main>
    <footer><a href="/products/">Products</a></footer>
    <h2 id="proof">Proof</h2>
  </body></html>`);
  assert.deepEqual(parsed.links, [
    {href: '/learn/', label: 'Learn', navigation: true},
    {href: 'guide/#proof', label: 'Guide', navigation: true},
    {href: '/build/', label: 'Build card', navigation: true},
    {href: '/products/', label: 'Products', navigation: true},
  ]);
  assert.ok(parsed.anchors.has('proof'));
});

test('navigation target resolution accepts routes and files while rejecting a missing gateway', () => {
  const context = {
    origin: 'https://beyond10x.github.io',
    routes: new Set(['/', '/docs/', '/docs/guide/']),
    files: new Set(['index.html', 'docs/index.html', 'docs/guide/index.html', 'changes/feed.json']),
    redirects: {redirects: [{from: '/learn-old/', to: '/docs/', type: 'html'}]},
  };
  assert.equal(resolveNavigationTarget('/docs/', '/', context).exists, true);
  assert.equal(resolveNavigationTarget('guide/#proof', '/docs/', context).route, '/docs/guide/');
  assert.equal(resolveNavigationTarget('/changes/feed.json', '/', context).exists, true);
  assert.equal(resolveNavigationTarget('/learn-old/', '/', context).route, '/docs/');
  assert.equal(resolveNavigationTarget('/learn/', '/', context).exists, false);
  assert.equal(resolveNavigationTarget('https://github.com/beyond10x', '/', context).external, true);
});
