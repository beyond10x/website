import assert from 'node:assert/strict';
import test from 'node:test';
import {rewriteLinks} from '../scripts/link-rewriting.mjs';
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
