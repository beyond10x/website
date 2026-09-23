import assert from 'node:assert/strict';
import {execFile as execFileCallback, spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {compile} from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import {parse as parseYaml} from 'yaml';
import {canonicalJson, sha256} from '../scripts/artifact-contract.mjs';
import {stripManagedRanges} from '../scripts/passive-markdown.mjs';
import {
  SourceValidationError,
  obtainSnapshot,
  ownedCacheDirectory,
  stageSourceWorkingTree,
} from '../scripts/source-preview.mjs';
import {publicationFixture} from './helpers/publication-fixture.mjs';

const execFile = promisify(execFileCallback);
const root = path.resolve(import.meta.dirname, '..');
const previewScript = path.join(root, 'scripts', 'preview.mjs');
const redirectFetch = pathToFileURL(path.join(import.meta.dirname, 'helpers', 'adversary-redirect-fetch.mjs')).href;

async function git(repositoryRoot, args) {
  return execFile('git', ['-C', repositoryRoot, ...args], {encoding: 'utf8'});
}

// A committed harness checkout with an uncommitted edit to its one declared document.
async function editedSource(context, fixture, body) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-source-preview-adversary2-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  const repositoryRoot = path.join(directory, 'harness');
  await mkdir(path.join(repositoryRoot, 'docs'), {recursive: true});
  await git(repositoryRoot, ['init', '--quiet']);
  await git(repositoryRoot, ['config', 'user.name', 'Website Test']);
  await git(repositoryRoot, ['config', 'user.email', 'website-test@example.invalid']);
  await writeFile(path.join(repositoryRoot, 'b10x.docs.yaml'), await readFile(path.join(fixture.bundleRoot, 'b10x.docs.yaml')));
  await writeFile(path.join(repositoryRoot, 'docs', 'guide.md'), '# Harness\n\nCommitted text.\n');
  await git(repositoryRoot, ['add', '.']);
  await git(repositoryRoot, ['commit', '--quiet', '-m', 'fixture']);
  await writeFile(path.join(repositoryRoot, 'docs', 'guide.md'), body);
  return {directory, repositoryRoot};
}

// A publication origin that answers 200 and then sends one byte every 500 ms, forever. Every chunk
// resets undici's body timeout, so only a deadline the caller sets can end it.
async function drippingOrigin(context) {
  const server = createServer((request, response) => {
    response.writeHead(200, {'content-type': 'application/json'});
    response.write('{');
    const timer = setInterval(() => response.write(' '), 500);
    request.on('close', () => clearInterval(timer));
    response.on('close', () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function validCachedSnapshot(directory) {
  const bootstrap = {
    'changes.json': Buffer.from(canonicalJson({schema: 'b10x-change-ledger/v1', changes: []})),
    'ecosystem.json': Buffer.from(canonicalJson({schema: 'b10x-docs-registry/v2', surfaces: []})),
    'release-facts.json': Buffer.from(canonicalJson({schema: 'b10x-release-facts/v1', releases: []})),
  };
  const provenance = {
    schema: 'b10x-website-provenance/v2',
    websiteCommit: '5'.repeat(40),
    atlasControlCommit: '6'.repeat(40),
    sourceCommits: {harness: '7'.repeat(40)},
    sourceBundles: {harness: {commit: '7'.repeat(40), producerRunId: 82, manifestSha256: '8'.repeat(64), collectionSha256: 'c'.repeat(64)}},
    routes: ['/', '/docs/harness/'],
    files: Object.entries(bootstrap).map(([name, bytes]) => ({path: name, sha256: sha256(bytes), size: bytes.byteLength})),
  };
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(directory, 'PROVENANCE.json'), canonicalJson(provenance));
  for (const [name, bytes] of Object.entries(bootstrap)) await writeFile(path.join(directory, name), bytes);
}

function settlesWithin(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise.then((value) => ({settled: true, value}), (error) => ({settled: true, error})),
    new Promise((resolve) => { timer = setTimeout(() => resolve({settled: false}), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

// Brief attack (1): "a fetch that hangs (is there a timeout?)". obtainSnapshot documents that the
// cached copy is used "only when the live fetch fails" (scripts/source-preview.mjs:91-92). A live
// origin that never finishes answering is a failed fetch; with a valid cache present, the command
// must fall back to it in bounded time rather than never start.
test('adversary 2: a live publication fetch that never finishes falls back to the cache in bounded time', async (context) => {
  const origin = await drippingOrigin(context);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-source-preview-adversary2-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  const cacheDirectory = path.join(directory, 'publication');
  await validCachedSnapshot(cacheDirectory);
  const outcome = await settlesWithin(obtainSnapshot({cacheDirectory, roster: ['harness'], origin}), 20_000);
  assert.ok(outcome.settled, 'obtainSnapshot was still waiting on the live origin after 20 s with a valid cache present');
  assert.equal(outcome.error, undefined, String(outcome.error));
  assert.equal(outcome.value.origin, 'cache');
});

// The same hang, seen by the author: the command traps SIGINT (scripts/preview.mjs withInterrupts)
// and only forwards it to a child process. During the snapshot fetch there is no child, so Ctrl-C
// is swallowed and the author cannot stop the command.
test('adversary 2: Ctrl-C while the snapshot is being fetched stops the command', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await editedSource(context, fixture, '# Harness\n\nUncommitted working-tree text.\n');
  const origin = await drippingOrigin(context);
  // Its own cache root, so its live staging and fetch directories never appear in another test's.
  const cacheRoot = path.join(source.directory, 'source-preview-cache');
  const ownedRoot = ownedCacheDirectory(cacheRoot);
  const before = new Set(await readdir(ownedRoot).catch(() => []));
  context.after(async () => {
    for (const entry of await readdir(ownedRoot).catch(() => [])) {
      if (!before.has(entry) && (entry.startsWith('staging-') || entry.startsWith('publication.fetch-'))) {
        await rm(path.join(ownedRoot, entry), {recursive: true, force: true});
      }
    }
  });
  const child = spawn(process.execPath, ['--import', redirectFetch, previewScript, 'source', '--source', source.repositoryRoot], {
    cwd: source.repositoryRoot,
    env: {...process.env, B10X_ADVERSARY_ORIGIN: origin, B10X_PREVIEW_SOURCE_CACHE: cacheRoot},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stdout += chunk; });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({code, signal})));
  const staged = await settlesWithin(new Promise((resolve) => {
    const check = () => (stdout.includes('pass per-source validation') ? resolve() : setTimeout(check, 100));
    check();
  }), 30_000);
  assert.ok(staged.settled, `the command never reached the snapshot fetch:\n${stdout}`);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  child.kill('SIGINT');
  const outcome = await settlesWithin(exited, 10_000);
  if (!outcome.settled) {
    child.kill('SIGKILL');
    await exited;
  }
  assert.ok(outcome.settled, `the command was still running 10 s after SIGINT, waiting on the snapshot fetch:\n${stdout}`);
});

// Brief attack (4): the guarantee says the command exits 1 when this repository fails per-source
// validation and 2 only when the preview "cannot be built or served at all", and
// preparationError (scripts/source-preview.mjs:207-212) tells the author their source "passed
// per-source validation" and blames the snapshot or Website code. Each body below passes
// stageSourceWorkingTree today, and each is refused, for its own bytes alone, by a step the portal
// runs on it later. The precondition in each case proves the refusal with the portal's own code or
// compiler; the assertion is that the preview reports it as what it is.
async function assertStagingRefuses(context, body) {
  const fixture = await publicationFixture(context);
  const source = await editedSource(context, fixture, body);
  await assert.rejects(stageSourceWorkingTree({
    sourceDirectory: source.repositoryRoot,
    websiteRoot: fixture.websiteRoot,
    stagingRoot: path.join(source.directory, 'staging'),
  }), (error) => {
    assert.ok(error instanceof SourceValidationError, `expected SourceValidationError, got ${error}`);
    return true;
  });
}

test('adversary 2: a document whose YAML frontmatter prepare-site cannot parse fails per-source validation', async (context) => {
  const body = '---\ntitle: Guide: part two\n---\n\n# Guide\n\nText.\n';
  // prepare-site.mjs:868-872 splitFrontmatter parses this block with yaml's parse on every document.
  assert.throws(() => parseYaml('title: Guide: part two'));
  await assertStagingRefuses(context, body);
});

test('adversary 2: a document with an unclosed managed documentation range fails per-source validation', async (context) => {
  const body = '# Guide\n\n<!-- b10x-docs:start -->\n\nText.\n';
  // prepare-site.mjs:404 and :478 run normalizePassiveMarkdown, which calls stripManagedRanges.
  assert.throws(() => stripManagedRanges(body), /is not closed/);
  await assertStagingRefuses(context, body);
});

test('adversary 2: a CommonMark autolink the portal MDX compiler refuses fails per-source validation', async (context) => {
  const body = '# Guide\n\nSee <https://beyond10x.github.io/docs/eventlog/>.\n';
  // Docusaurus 3.10 compiles .md as MDX (markdown.format default 'mdx').
  await assert.rejects(compile(body, {remarkPlugins: [remarkGfm]}));
  await assertStagingRefuses(context, body);
});

test('adversary 2: an unclosed <br> the portal MDX compiler refuses fails per-source validation', async (context) => {
  const body = '# Guide\n\nLine one<br>line two.\n';
  await assert.rejects(compile(body, {remarkPlugins: [remarkGfm]}), /closing tag/);
  await assertStagingRefuses(context, body);
});
