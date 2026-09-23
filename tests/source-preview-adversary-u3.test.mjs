// Adversary pass 1 on story:docs-v3-preview-interrupt-cleanup-race. Cases against the new
// B10X_PREVIEW_SOURCE_CACHE setting and against cleanup lines no other test observes.
import assert from 'node:assert/strict';
import childProcess, {execFile as execFileCallback} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {publicationFixture} from './helpers/publication-fixture.mjs';
import {dirtySourceRepository, publishedSnapshot} from './helpers/source-preview-fixture.mjs';

const exitZero = path.join(import.meta.dirname, 'helpers', 'exit-zero.mjs');
const root = path.resolve(import.meta.dirname, '..');
const previewScript = path.join(root, 'scripts', 'preview.mjs');

// Records what the cache root holds at the moment the preview server is spawned.
const serverSpawn = {cacheRoot: undefined, entries: undefined};
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (...args) {
  if (serverSpawn.cacheRoot && args[1]?.[0] === exitZero && args[1]?.[1] === 'start') {
    serverSpawn.entries = readdirSync(ownedCacheDirectory(serverSpawn.cacheRoot));
  }
  return originalSpawn.apply(this, args);
};
syncBuiltinESMExports();

const {runSourcePreview, sourcePreviewContext, sourcePreviewLifecycle, previewPlan} = await import('../scripts/preview.mjs');
const {
  PreviewEnvironmentError,
  SourceValidationError,
  ownedCacheDirectory,
  sourcePreviewCacheDirectory,
} = await import('../scripts/source-preview.mjs');
const execFile = promisify(execFileCallback);

async function startup(context, sourceOptions) {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture, sourceOptions);
  const published = await publishedSnapshot(context, fixture, source);
  const fetchImpl = async (url) => {
    const bytes = published.files[new URL(url).pathname.slice(1)];
    return bytes ? new Response(bytes, {status: 200}) : new Response('missing', {status: 404});
  };
  const run = (cacheRoot, base = {}) => {
    const {lifecycle} = sourcePreviewLifecycle();
    return runSourcePreview(previewPlan('source', ['--source', source.repositoryRoot]), lifecycle, {
      ...base,
      websiteRoot: fixture.websiteRoot,
      cacheRoot,
      sourcesCacheRoot: path.join(source.directory, 'sources-cache'),
      sourceWorkspace: published.workspace,
      leasePath: path.join(source.directory, 'generation-lease.json'),
      prepareModule: exitZero,
      serveModule: exitZero,
      fetchImpl,
      say: () => {},
    }).then((value) => ({value}), (error) => ({error}));
  };
  return {source, run};
}

// Brief attack (5): with the setting unset or empty, production keeps the checkout's cache.
test('adversary u3: unset or empty B10X_PREVIEW_SOURCE_CACHE keeps the checkout .cache/source-preview', () => {
  const expected = path.join(root, '.cache', 'source-preview');
  assert.equal(sourcePreviewCacheDirectory(root, {}), expected);
  assert.equal(sourcePreviewCacheDirectory(root, {B10X_PREVIEW_SOURCE_CACHE: ''}), expected);
  assert.equal(sourcePreviewContext({}).cacheRoot, expected);
  assert.equal(sourcePreviewContext({}).sourcesCacheRoot, path.join(root, '.cache', 'sources'));
  assert.equal(sourcePreviewContext({}).sourceWorkspace, undefined);
});

// Brief attack (2): a relative value is refused before anything is written, so the command run from
// a source repository cannot put a cache into that repository's working tree.
test('adversary u3: a relative B10X_PREVIEW_SOURCE_CACHE exits 2 and writes nothing into the source repository', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const beforeEntries = (await readdir(source.repositoryRoot)).sort();
  for (const value of ['relative-cache', '.', '../sibling-cache', '~/cache']) {
    assert.throws(() => sourcePreviewCacheDirectory(root, {B10X_PREVIEW_SOURCE_CACHE: value}), PreviewEnvironmentError, value);
  }
  const failure = await execFile(process.execPath, [
    previewScript, 'source', '--source', source.repositoryRoot, '--snapshot', path.join(source.directory, 'absent'),
  ], {cwd: source.repositoryRoot, encoding: 'utf8', env: {...process.env, B10X_PREVIEW_SOURCE_CACHE: 'relative-cache'}}).then(
    () => assert.fail('a relative cache must be refused'),
    (error) => error,
  );
  assert.equal(failure.code, 2, failure.stderr);
  assert.match(failure.stderr, /cannot start: B10X_PREVIEW_SOURCE_CACHE must be an absolute directory/);
  assert.deepEqual((await readdir(source.repositoryRoot)).sort(), beforeEntries);
});

// Mutant probe: deleting `await rm(staging, ...)` after writePreviewInputs (scripts/preview.mjs:296)
// leaves the interrupt sweep green, because the outer finally removes staging after the server
// exits. The staging copy must be gone before the server starts.
test('adversary u3: the staging directory is removed before the preview server is spawned', async (context) => {
  const {source, run} = await startup(context);
  const cacheRoot = path.join(source.directory, 'source-preview-cache');
  serverSpawn.cacheRoot = cacheRoot;
  serverSpawn.entries = undefined;
  try {
    const outcome = await run(cacheRoot);
    assert.ok(outcome.error instanceof PreviewEnvironmentError && /preview server stopped/.test(outcome.error.message), String(outcome.error));
  } finally {
    serverSpawn.cacheRoot = undefined;
  }
  assert.ok(Array.isArray(serverSpawn.entries), 'the preview server was never spawned');
  assert.deepEqual(serverSpawn.entries.filter((entry) => entry.startsWith('staging-')), []);
});

// Mutant probe: deleting the catch-path `await rm(staging, ...)` (scripts/preview.mjs:254) leaves
// every test green; the one invalid-source test runs against the checkout's shared cache and never
// looks in it.
test('adversary u3: a per-source validation failure leaves no staging directory behind', async (context) => {
  const {source, run} = await startup(context, {document: 'docs/guide.mdx', body: "import Danger from './danger';\n\n# Harness\n"});
  const cacheRoot = path.join(source.directory, 'source-preview-cache');
  const outcome = await run(cacheRoot);
  assert.ok(outcome.error instanceof SourceValidationError, String(outcome.error));
  const left = (await readdir(ownedCacheDirectory(cacheRoot))).filter((entry) => entry.startsWith('staging-'));
  assert.deepEqual(left, []);
});

// Brief attack (2): the setting names an arbitrary existing directory and the preview then owns
// every name it uses inside it. `obtainSnapshot` runs rm -r on <dir>/publication and
// `writePreviewInputs` on <dir>/inputs, with no marker that the directory was the preview's.
// Pointing it at a general cache directory (the way many tools take one) destroys unrelated data.
test('adversary u3: B10X_PREVIEW_SOURCE_CACHE naming an existing directory deletes nothing the preview did not create', async (context) => {
  const {source, run} = await startup(context);
  const named = path.join(source.directory, 'user-cache');
  for (const name of ['inputs', 'publication']) {
    await mkdir(path.join(named, name), {recursive: true});
    await writeFile(path.join(named, name, 'not-the-preview.txt'), `${name} belongs to someone else\n`);
  }
  const {cacheRoot} = sourcePreviewContext({B10X_PREVIEW_SOURCE_CACHE: named});
  assert.equal(cacheRoot, named);
  const outcome = await run(cacheRoot);
  assert.ok(outcome.error instanceof PreviewEnvironmentError && /preview server stopped/.test(outcome.error.message), String(outcome.error));
  const surviving = [];
  for (const name of ['inputs', 'publication']) {
    const bytes = await readFile(path.join(named, name, 'not-the-preview.txt'), 'utf8').catch(() => undefined);
    if (bytes !== undefined) surviving.push(name);
  }
  assert.deepEqual(surviving, ['inputs', 'publication'], `the preview deleted ${named}/{inputs,publication} content it did not create`);
});
