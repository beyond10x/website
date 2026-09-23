// Adversary pass 2 on story:docs-v3-preview-interrupt-cleanup-race. The cache root's doc comment
// (scripts/source-preview.mjs) says everything the preview writes or deletes lies in its one
// subdirectory, ownedCacheDirectory(cacheRoot). These cases place a symlink at that subdirectory and
// inside it, and require the preview to delete nothing outside it.
import assert from 'node:assert/strict';
import {mkdir, readFile, symlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {publicationFixture} from './helpers/publication-fixture.mjs';
import {dirtySourceRepository, publishedSnapshot} from './helpers/source-preview-fixture.mjs';

const exitZero = path.join(import.meta.dirname, 'helpers', 'exit-zero.mjs');
const {runSourcePreview, sourcePreviewContext, sourcePreviewLifecycle, previewPlan} = await import('../scripts/preview.mjs');
const {PreviewEnvironmentError, obtainSnapshot, ownedCacheDirectory} = await import('../scripts/source-preview.mjs');
const {canonicalJson} = await import('../scripts/artifact-contract.mjs');

async function startup(context) {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const published = await publishedSnapshot(context, fixture, source);
  const fetchImpl = async (url) => {
    const bytes = published.files[new URL(url).pathname.slice(1)];
    return bytes ? new Response(bytes, {status: 200}) : new Response('missing', {status: 404});
  };
  const run = (cacheRoot) => {
    const {lifecycle} = sourcePreviewLifecycle();
    return runSourcePreview(previewPlan('source', ['--source', source.repositoryRoot]), lifecycle, {
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

async function victimDirectory(root, names) {
  for (const name of names) {
    await mkdir(path.join(root, name), {recursive: true});
    await writeFile(path.join(root, name, 'not-the-preview.txt'), `${name} belongs to someone else\n`);
  }
}

async function surviving(root, names) {
  const kept = [];
  for (const name of names) {
    const bytes = await readFile(path.join(root, name, 'not-the-preview.txt'), 'utf8').catch(() => undefined);
    if (bytes !== undefined) kept.push(name);
  }
  return kept;
}

test('adversary u3 pass 2: a symlink at the owned cache directory itself does not let the preview delete outside it', async (context) => {
  const {source, run} = await startup(context);
  const victim = path.join(source.directory, 'someone-elses-directory');
  await victimDirectory(victim, ['inputs', 'publication']);
  const named = path.join(source.directory, 'named-cache');
  await mkdir(named, {recursive: true});
  const {cacheRoot} = sourcePreviewContext({B10X_PREVIEW_SOURCE_CACHE: named});
  await symlink(victim, ownedCacheDirectory(cacheRoot), 'dir');
  // How the run ends is not the claim: bundle validation refuses the symlinked inputs root after
  // writePreviewInputs has already run rm -r on it. The claim is what is left under the target.
  const outcome = await run(cacheRoot);
  assert.deepEqual(await surviving(victim, ['inputs', 'publication']), ['inputs', 'publication'],
    `the preview followed the symlink ${ownedCacheDirectory(cacheRoot)} and deleted content under its target it did not create (run ended with ${outcome.error ?? outcome.value})`);
});

// Mutant probe: deleting `await rm(cacheDirectory, ...)` before the rename in obtainSnapshot
// (scripts/source-preview.mjs:197) leaves every other test green. Without it the rename onto the
// existing cache fails, and every preview after the first silently renders against the first
// publication it ever cached, reported as a failed live fetch.
test('adversary u3 pass 2: a second live fetch replaces the cached publication', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const published = await publishedSnapshot(context, fixture, source);
  const cacheDirectory = path.join(ownedCacheDirectory(path.join(source.directory, 'cache')), 'publication');
  const roster = ['aep', 'harness'];
  const serving = (files) => async (url) => {
    const bytes = files[new URL(url).pathname.slice(1)];
    return bytes ? new Response(bytes, {status: 200}) : new Response('missing', {status: 404});
  };
  const first = await obtainSnapshot({cacheDirectory, roster, fetchImpl: serving(published.files)});
  assert.equal(first.origin, 'live');
  const republished = {
    ...published.files,
    'PROVENANCE.json': Buffer.from(canonicalJson({...published.provenance, websiteCommit: 'a'.repeat(40)})),
  };
  const second = await obtainSnapshot({cacheDirectory, roster, fetchImpl: serving(republished)});
  assert.equal(second.origin, 'live', second.warning);
  assert.equal(second.snapshot.provenance.websiteCommit, 'a'.repeat(40));
  assert.deepEqual(await readFile(path.join(cacheDirectory, 'PROVENANCE.json')), republished['PROVENANCE.json']);
});

test('adversary u3 pass 2: symlinks inside the owned cache directory are removed, never followed', async (context) => {
  const {source, run} = await startup(context);
  const victim = path.join(source.directory, 'someone-elses-directory');
  await victimDirectory(path.join(victim, 'a'), ['kept']);
  await victimDirectory(path.join(victim, 'b'), ['kept']);
  const named = path.join(source.directory, 'named-cache');
  const owned = ownedCacheDirectory(named);
  await mkdir(owned, {recursive: true});
  await symlink(path.join(victim, 'a'), path.join(owned, 'publication'), 'dir');
  await symlink(path.join(victim, 'b'), path.join(owned, 'inputs'), 'dir');
  const outcome = await run(named);
  assert.ok(outcome.error instanceof PreviewEnvironmentError && /preview server stopped/.test(outcome.error.message), String(outcome.error));
  assert.deepEqual(await surviving(path.join(victim, 'a'), ['kept']), ['kept']);
  assert.deepEqual(await surviving(path.join(victim, 'b'), ['kept']), ['kept']);
});
