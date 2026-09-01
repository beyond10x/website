import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {assertPassiveMdx} from '@beyond10x/docs-system/collector';
import {artifactFacts} from '../scripts/artifact-contract.mjs';
import {declaredAnchors, safeTreePath, staticPrefix} from '../scripts/git-source.mjs';
import {sourceKey, sourceMap} from '../scripts/source-routing.mjs';

test('static source anchors bound wildcard extraction without changing glob semantics', () => {
  assert.equal(staticPrefix('README.md'), 'README.md');
  assert.equal(staticPrefix('website/docs/**/*.md'), 'website/docs');
  assert.equal(staticPrefix('*.md'), '.');
  assert.deepEqual(
    declaredAnchors({
      surfaces: [{source: {root: '.', documents: {include: ['README.md', 'website/docs/**/*.md']}, specifications: [{path: 'openapi.json'}]}}],
    }),
    ['README.md', 'openapi.json', 'website/docs'],
  );
});

test('repository paths cannot escape or switch separator conventions', () => {
  assert.equal(safeTreePath('website/docs/index.md'), 'website/docs/index.md');
  assert.throws(() => safeTreePath('../private.md'), /escapes/);
  assert.throws(() => safeTreePath('/absolute.md'), /unsafe/);
  assert.throws(() => safeTreePath('website\\docs\\index.md'), /unsafe/);
});

test('public MDX is passive data with an explicit component allowlist', () => {
  assert.doesNotThrow(() => assertPassiveMdx('# Safe\n\n```js\nexport const example = true\n```', 'safe.md'));
  assert.throws(() => assertPassiveMdx("import Secret from './secret'", 'unsafe.mdx'), /import or export/);
  assert.throws(() => assertPassiveMdx('Hello {runSecret()}', 'unsafe.mdx'), /MDX expression/);
  assert.throws(() => assertPassiveMdx('<Widget />', 'unsafe.mdx'), /undeclared shared component/);
  assert.doesNotThrow(() => assertPassiveMdx('<Diagram />', 'safe.mdx', ['Diagram']));
  assert.throws(() => assertPassiveMdx('<iframe src="https://example.com" />', 'unsafe.mdx'), /forbidden HTML/);
});

test('identical source paths remain scoped to their owning repository', () => {
  const routes = sourceMap(
    [
      {repository: 'aep', sourcePath: 'README.md'},
      {repository: 'ess', sourcePath: 'README.md'},
    ],
    (file) => `/docs/${file.repository}/`,
  );
  assert.equal(routes.get(sourceKey('aep', 'README.md')), '/docs/aep/');
  assert.equal(routes.get(sourceKey('ess', 'README.md')), '/docs/ess/');
  assert.equal(routes.size, 2);
});

test('artifact provenance rejects symbolic links and non-regular entries', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-artifact-contract-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html>');
  await symlink('index.html', path.join(directory, 'alias.html'));
  await assert.rejects(artifactFacts(directory), /artifact contains symbolic link .*alias\.html/);

  await rm(path.join(directory, 'alias.html'));
  const socket = path.join(directory, 'artifact.sock');
  const server = createServer();
  context.after(() => server.close());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, resolve);
  });
  await assert.rejects(artifactFacts(directory), /artifact contains non-regular entry .*artifact\.sock/);
});
