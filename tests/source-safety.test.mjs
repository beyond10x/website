import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
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

test('artifact files and routes use explicit UTF-8 byte order', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-artifact-order-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  await writeFile(path.join(directory, 'a.html'), 'lowercase');
  await writeFile(path.join(directory, 'VISION.html'), 'uppercase');

  const facts = await artifactFacts(directory);
  assert.deepEqual(facts.files.map((file) => file.path), ['VISION.html', 'a.html']);
  assert.deepEqual(facts.routes, ['/VISION.html', '/a.html']);
});

test('artifact provenance rejects Git control files', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-artifact-git-control-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html>');
  await writeFile(path.join(directory, '.gitignore'), '*');
  await assert.rejects(artifactFacts(directory), /forbidden Git metadata/);
});

test('reusable façade workflow executes its own immutable revision and treats the deployed Website as data', async () => {
  const workflow = await readFile(path.join(path.resolve(import.meta.dirname, '..'), '.github', 'workflows', 'redirect-facade.yml'), 'utf8');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(workflow, /path: \.runtime/);
  assert.match(workflow, /path: \.control-data/);
  assert.match(workflow, /path: \.website-data/);
  assert.match(workflow, /--data \.\.\/\.website-data/);
  assert.match(workflow, /github\.triggering_actor == 'b10x-bot\[bot\]'/);
  assert.match(workflow, /github\.sha == inputs\.control_sha/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.doesNotMatch(workflow, /working-directory: \.website-data/);
});

test('reusable root workflow executes immutable controls and blocks human reruns', async () => {
  const workflow = await readFile(path.join(path.resolve(import.meta.dirname, '..'), '.github', 'workflows', 'deploy-root.yml'), 'utf8');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(workflow, /github\.triggering_actor == 'b10x-bot\[bot\]'/);
  assert.match(workflow, /github\.sha == inputs\.control_sha/);
  assert.match(workflow, /node \.runtime\/scripts\/verify-build\.mjs/);
  assert.match(workflow, /--data \.website-data/);
  assert.doesNotMatch(workflow, /working-directory: \.website-data/);
});
