import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {localizeWebsiteHref} from '../src/lib/links.ts';

const root = path.resolve(import.meta.dirname, '..');

test('canonical Website links stay on the rendering origin', () => {
  assert.equal(localizeWebsiteHref('https://beyond10x.github.io'), '/');
  assert.equal(
    localizeWebsiteHref('https://beyond10x.github.io/docs/aep/?view=full#evidence'),
    '/docs/aep/?view=full#evidence',
  );
  assert.equal(localizeWebsiteHref('https://beyond10x.github.io/agentplugins/'), '/ecosystem/agentplugins/');
  assert.equal(localizeWebsiteHref('https://beyond10x.github.io/ess/'), '/ecosystem/ess/');
  assert.equal(localizeWebsiteHref('/metaharness/'), '/ecosystem/metaharness/');
  assert.equal(localizeWebsiteHref('/getting-started/'), '/');
  assert.equal(
    localizeWebsiteHref('/aep/releases/rss.xml?reader=local#latest'),
    '/releases/aep/rss.xml?reader=local#latest',
  );
});

test('local and genuinely external links retain their authored meaning', () => {
  assert.equal(localizeWebsiteHref('/docs/aep/#evidence'), '/docs/aep/#evidence');
  assert.equal(localizeWebsiteHref('#evidence'), '#evidence');
  assert.equal(localizeWebsiteHref('guide/next'), 'guide/next');
  assert.equal(localizeWebsiteHref('https://github.com/beyond10x/aep/tree/abc123'), 'https://github.com/beyond10x/aep/tree/abc123');
  assert.equal(localizeWebsiteHref('mailto:docs@beyond10x.dev'), 'mailto:docs@beyond10x.dev');
});

test('source-owned canonical links remain same-tab and localhost has a global confinement backstop', async () => {
  const mdxAnchor = await readFile(path.join(root, 'src/theme/MDXComponents/A/index.tsx'), 'utf8');
  const rootTheme = await readFile(path.join(root, 'src/theme/Root.tsx'), 'utf8');
  assert.doesNotMatch(mdxAnchor, /pathname:\/\//);
  assert.doesNotMatch(mdxAnchor, /return <a /);
  assert.match(mdxAnchor, /<OriginalMDXA \{\.\.\.props\} href=\{localized\} \/>/);
  assert.match(rootTheme, /confineWebsiteAnchors\(document\)/);
  assert.match(rootTheme, /observer\.observe\(document\.documentElement/);
});
