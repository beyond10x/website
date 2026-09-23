import assert from 'node:assert/strict';
import test from 'node:test';
import {quarantinedRouteTarget, redirectQuarantinedUrls, rewriteLinks} from '../scripts/link-rewriting.mjs';
import {sourceKey} from '../scripts/source-routing.mjs';

const context = {
  file: {repository: 'ess', sourcePath: 'website/docs/reference/spec-versions.md'},
  commit: '8b8b44ca676033f12668b2cb51422630c2392052',
  repositoryUrl: 'https://github.com/beyond10x/ess',
  routeBySource: new Map([
    [sourceKey('ess', 'website/docs/reference/formats.md'), '/docs/ess/reference/formats/'],
    [sourceKey('ess', 'website/docs/guides/generate-artifacts.md'), '/docs/ess/guides/generate-artifacts/'],
  ]),
  blogRouteBySource: new Map(),
  assetBySource: new Map(),
};

test('a reference-style link definition is rewritten like an inline link', () => {
  // The 2026-09-20 outage: `[formats]: ./formats.md` reached the unified build unrewritten,
  // pointing at a sibling that does not exist once the document is flattened to
  // `ess/reference/spec-versions/index.md`, and failed the build for every repository.
  assert.equal(
    rewriteLinks('[formats]: ./formats.md\n', context),
    '[formats]: /docs/ess/reference/formats/\n',
  );
  assert.equal(
    rewriteLinks('[Formats and digests](./formats.md)\n', context),
    '[Formats and digests](/docs/ess/reference/formats/)\n',
  );
});

test('a definition keeps its title, its angle brackets and its indentation', () => {
  assert.equal(
    rewriteLinks('[a]: ./formats.md "Formats and digests"\n', context),
    '[a]: /docs/ess/reference/formats/ "Formats and digests"\n',
  );
  assert.equal(
    rewriteLinks('[a]: <./formats.md>\n', context),
    '[a]: </docs/ess/reference/formats/>\n',
  );
  assert.equal(
    rewriteLinks('   [a]: ./formats.md\n', context),
    '   [a]: /docs/ess/reference/formats/\n',
  );
});

test('a definition this build cannot resolve is left exactly as written', () => {
  for (const line of [
    '[x]: https://github.com/beyond10x/ess/blob/main/CHANGELOG.md\n',
    '[x]: #an-anchor\n',
    '[x]: mailto:docs@beyond10x.dev\n',
  ]) {
    assert.equal(rewriteLinks(line, context), line);
  }
});

test('a line that only looks like a definition is not one', () => {
  for (const line of [
    'See [formats] below, and [formats]: is not a definition mid-sentence.\n',
    '    [indented four spaces]: ./formats.md\n',
  ]) {
    assert.equal(rewriteLinks(line, context), line);
  }
});

test('a relative path that traverses out of its directory still resolves', () => {
  assert.equal(
    rewriteLinks('[g]: ../guides/generate-artifacts.md#recovery\n', context),
    '[g]: /docs/ess/guides/generate-artifacts/#recovery\n',
  );
});

const harness = {
  file: {repository: 'harness', sourcePath: 'docs/guide.md'},
  commit: '1'.repeat(40),
  repositoryUrl: 'https://github.com/beyond10x/harness',
  routeBySource: new Map([[sourceKey('harness', 'docs/guide.md'), '/docs/harness/guide/']]),
  blogRouteBySource: new Map(),
  assetBySource: new Map(),
};
const withEventlogQuarantined = {...harness, quarantined: new Set(['eventlog'])};

test('every link into a quarantined source is rewritten to its repository on GitHub', () => {
  const github = 'https://github.com/beyond10x/eventlog';
  for (const destination of [
    'https://beyond10x.github.io/docs/eventlog/',
    'https://beyond10x.github.io/docs/eventlog/guide/#events',
    'https://beyond10x.github.io/ecosystem/eventlog/',
    '/ecosystem/eventlog/',
    '/ecosystem/eventlog',
    'https://beyond10x.github.io/api/eventlog/http-api/',
    '/components/eventlog/catalog/',
    '/data/eventlog/catalog.json',
    '/updates/field-notes/eventlog/launch/',
    '/source-assets/eventlog/docs/asset/diagram.svg',
  ]) {
    assert.equal(rewriteLinks(`[x](${destination})\n`, withEventlogQuarantined), `[x](${github})\n`, destination);
  }
  assert.equal(
    rewriteLinks('<a href="https://beyond10x.github.io/docs/eventlog/">Eventlog</a>\n', withEventlogQuarantined),
    `<a href="${github}">Eventlog</a>\n`,
  );
  assert.equal(
    rewriteLinks('[api]: https://beyond10x.github.io/api/eventlog/ "Eventlog API"\n', withEventlogQuarantined),
    `[api]: ${github} "Eventlog API"\n`,
  );
});

test('a quarantine leaves links to published sources and look-alike routes untouched', () => {
  for (const destination of [
    'https://beyond10x.github.io/docs/identity/guide/',
    'https://beyond10x.github.io/docs/eventlog-extra/',
    '/ecosystem/identity/',
    'https://github.com/beyond10x/eventlog/blob/main/README.md',
    'https://example.com/docs/eventlog/',
  ]) {
    assert.equal(rewriteLinks(`[x](${destination})\n`, withEventlogQuarantined), `[x](${destination})\n`, destination);
  }
  assert.equal(rewriteLinks('[x](./guide.md)\n', withEventlogQuarantined), '[x](/docs/harness/guide/)\n');
  assert.equal(
    rewriteLinks('[x](https://beyond10x.github.io/docs/eventlog/)\n', harness),
    '[x](https://beyond10x.github.io/docs/eventlog/)\n',
    'without a quarantine nothing changes',
  );
});

test('a quarantined route becomes its GitHub repository wherever a Website projection carries it', () => {
  const quarantined = new Set(['eventlog']);
  assert.equal(quarantinedRouteTarget('https://beyond10x.github.io/docs/eventlog/x/', quarantined), 'https://github.com/beyond10x/eventlog');
  assert.equal(quarantinedRouteTarget('/docs/identity/', quarantined), undefined);
  const registry = {surfaces: [{
    repository: {id: 'harness', url: 'https://github.com/beyond10x/harness'},
    canonicalUrl: 'https://beyond10x.github.io/docs/harness/',
    summary: 'Harness uses https://beyond10x.github.io/docs/eventlog/ for events.',
    sections: [{label: 'Eventlog', url: 'https://beyond10x.github.io/docs/eventlog/'}, {label: 'Own', url: '/docs/harness/'}],
    adoption: {url: '/ecosystem/eventlog/'},
  }]};
  const rewritten = redirectQuarantinedUrls(registry, quarantined);
  assert.deepEqual(rewritten.surfaces[0].sections.map((section) => section.url), ['https://github.com/beyond10x/eventlog', '/docs/harness/']);
  assert.equal(rewritten.surfaces[0].adoption.url, 'https://github.com/beyond10x/eventlog');
  assert.equal(rewritten.surfaces[0].canonicalUrl, 'https://beyond10x.github.io/docs/harness/');
  assert.equal(rewritten.surfaces[0].summary, registry.surfaces[0].summary, 'prose is not a link');
  assert.equal(registry.surfaces[0].sections[0].url, 'https://beyond10x.github.io/docs/eventlog/', 'the input is not mutated');
});

test('a surface key of a quarantined source resolves to a link to its GitHub repository', async () => {
  const {quarantinedSurfaceLink} = await import('../src/quarantine-routes.mjs');
  const quarantined = new Set(['eventlog']);
  assert.deepEqual(quarantinedSurfaceLink('eventlog/docs', quarantined), {
    key: 'eventlog/docs',
    id: 'docs',
    name: 'eventlog',
    canonicalUrl: 'https://github.com/beyond10x/eventlog',
    repository: {id: 'eventlog', url: 'https://github.com/beyond10x/eventlog'},
  });
  assert.equal(quarantinedSurfaceLink('harness/docs', quarantined), undefined);
  assert.equal(quarantinedSurfaceLink('eventlog/docs', new Set()), undefined);
});
