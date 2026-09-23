// Ctrl-C can land at any await point of source-preview startup. This file interrupts the startup
// once at every one of them, in process, and requires each run to stop as interrupted and to leave
// no staging or fetch directory and no generation lease behind. Every directory check reads the
// preview's owned subdirectory of the cache root, where those directories live.
//
// An await point here is every call the startup makes into node:fs/promises, node:child_process
// execFile or spawn, and the publication fetch: those are the operations it awaits. They are
// counted by wrapping the built-in modules before scripts/preview.mjs is first imported, so the
// count needs no list of call sites and grows with the code. Startup ends where the server process
// is spawned; from then on Ctrl-C stops a running server, which exits 0.
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {readdirSync} from 'node:fs';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {publicationFixture} from './helpers/publication-fixture.mjs';
import {dirtySourceRepository, publishedSnapshot} from './helpers/source-preview-fixture.mjs';

const probe = {active: false, count: 0, at: Infinity, onReach: undefined, serverAt: undefined, owned: undefined, atServer: undefined};
function tick() {
  if (!probe.active) return;
  probe.count += 1;
  if (probe.count === probe.at) probe.onReach();
}
for (const [name, original] of Object.entries(fsPromises)) {
  if (typeof original !== 'function') continue;
  fsPromises[name] = function (...args) {
    tick();
    return original.apply(this, args);
  };
}
for (const name of ['execFile', 'spawn']) {
  const original = childProcess[name];
  const wrapped = function (...args) {
    if (probe.active && name === 'spawn' && args[1]?.[0] === exitZero && args[1]?.[1] === 'start' && probe.serverAt === undefined) {
      probe.serverAt = probe.count;
      probe.atServer = readdirSync(probe.owned);
    }
    tick();
    return original.apply(this, args);
  };
  if (original[promisify.custom]) {
    wrapped[promisify.custom] = (...args) => {
      tick();
      return original[promisify.custom](...args);
    };
  }
  childProcess[name] = wrapped;
}
syncBuiltinESMExports();

const exitZero = path.join(import.meta.dirname, 'helpers', 'exit-zero.mjs');

const {runSourcePreview, sourcePreviewLifecycle, previewPlan} = await import('../scripts/preview.mjs');
const {PreviewEnvironmentError, PreviewInterruptedError, SourceValidationError, ownedCacheDirectory} = await import('../scripts/source-preview.mjs');

async function startupFixture(context, sourceOptions) {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture, sourceOptions);
  const published = await publishedSnapshot(context, fixture, source);
  const cacheRoot = path.join(source.directory, 'source-preview-cache');
  const owned = ownedCacheDirectory(cacheRoot);
  const leasePath = path.join(source.directory, 'generation-lease.json');
  // Answers after a turn of the event loop, and refuses an aborted request, as a network fetch does.
  const fetchImpl = async (url, init) => {
    tick();
    await new Promise((resolve) => setImmediate(resolve));
    init?.signal?.throwIfAborted();
    const bytes = published.files[new URL(url).pathname.slice(1)];
    return bytes ? new Response(bytes, {status: 200}) : new Response('missing', {status: 404});
  };
  // A cold sources cache fetches the other sources into a fresh bare object store; a warm one reuses it
  // and awaits fewer operations, so each is swept on its own.
  let runs = 0;
  const run = async (at, cache) => {
    runs += 1;
    const sourcesCacheRoot = path.join(source.directory, cache === 'cold' ? `sources-cache-cold-${runs}` : 'sources-cache-warm');
    const {lifecycle, interrupt} = sourcePreviewLifecycle();
    Object.assign(probe, {active: true, count: 0, at, onReach: () => interrupt('SIGINT'), serverAt: undefined, owned, atServer: undefined});
    try {
      return await runSourcePreview(previewPlan('source', ['--source', source.repositoryRoot]), lifecycle, {
        websiteRoot: fixture.websiteRoot,
        cacheRoot,
        sourcesCacheRoot,
        sourceWorkspace: published.workspace,
        leasePath,
        prepareModule: exitZero,
        serveModule: exitZero,
        fetchImpl,
        say: () => {},
      }).then((value) => ({value}), (error) => ({error}));
    } finally {
      probe.active = false;
    }
  };
  const leftBehind = async () => {
    const entries = await fsPromises.readdir(owned).catch(() => []);
    const lease = await fsPromises.lstat(leasePath).then(() => ['generation lease'], () => []);
    return [...entries.filter((entry) => entry.startsWith('staging-') || entry.startsWith('publication.fetch-')), ...lease];
  };
  return {run, leftBehind};
}

test('an uninterrupted startup reaches the server, and its await points are counted', async (context) => {
  const startup = await startupFixture(context);
  const outcome = await startup.run(Infinity, 'cold');
  // The stub server exits 0 without being interrupted: the one way this startup can stop after the
  // server exists.
  assert.ok(outcome.error instanceof PreviewEnvironmentError && /preview server stopped/.test(outcome.error.message), String(outcome.error));
  assert.ok(probe.serverAt > 20, `only ${probe.serverAt} await points were counted before the server; the probe is not seeing the startup`);
  assert.deepEqual(await startup.leftBehind(), []);
  assert.ok(Array.isArray(probe.atServer), 'the owned cache directory was not read when the server was spawned');
  assert.ok(probe.atServer.includes('publication') && probe.atServer.includes('inputs'), `the owned cache directory held ${JSON.stringify(probe.atServer)} at the server`);
  assert.deepEqual(probe.atServer.filter((entry) => entry.startsWith('staging-')), [], 'the staging copy must be gone before the server starts');
});

test('a per-source validation failure leaves no staging directory in the owned cache directory', async (context) => {
  const startup = await startupFixture(context, {document: 'docs/guide.mdx', body: "import Danger from './danger';\n\n# Harness\n"});
  const outcome = await startup.run(Infinity, 'cold');
  assert.ok(outcome.error instanceof SourceValidationError, String(outcome.error));
  assert.ok((await fsPromises.lstat(probe.owned)).isDirectory(), 'staging never created the owned cache directory');
  assert.deepEqual(await startup.leftBehind(), []);
});

for (const cache of ['cold', 'warm']) {
  test(`Ctrl-C at every await point of startup, ${cache} sources cache, stops as interrupted and leaves no directory or lease behind`, async (context) => {
    const startup = await startupFixture(context);
    const counts = [];
    for (let round = 0; round < 3; round += 1) {
      await startup.run(Infinity, cache);
      counts.push(probe.serverAt);
    }
    // The first warm run is the one that warms the cache; the sweep needs every counted run alike.
    const total = counts.at(-1);
    assert.ok(total > 20, `startup reached the server after ${total} await points in successive ${cache} runs (${counts.join(', ')}); a startup that never reaches the server has no await points to sweep`);
    assert.equal(counts.at(-2), total, `startup awaited ${counts.join(', ')} operations in successive ${cache} runs`);
    const failures = [];
    for (let at = 1; at <= total; at += 1) {
      const outcome = await startup.run(at, cache);
      const left = await startup.leftBehind();
      if (!(outcome.error instanceof PreviewInterruptedError) || left.length > 0) {
        failures.push(`await point ${at}/${total}: ${outcome.error ? `${outcome.error.name}: ${outcome.error.message}` : `returned ${outcome.value}`}; left ${JSON.stringify(left)}`);
      }
    }
    assert.deepEqual(failures, [], `${failures.length} of ${total} await points`);
  });
}
