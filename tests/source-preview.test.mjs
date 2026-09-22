import assert from 'node:assert/strict';
import {execFile as execFileCallback, spawn} from 'node:child_process';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {collectManifestSources} from '@beyond10x/docs-system/collector';
import {readManifest} from '@beyond10x/docs-system/manifest';
import {canonicalJson, sha256} from '../scripts/artifact-contract.mjs';
import {validateBootstrapSnapshots} from '../scripts/bootstrap-contract.mjs';
import {collectSources} from '../scripts/collect-sources.mjs';
import {previewPlan} from '../scripts/preview.mjs';
import {loadPublicationInputs} from '../scripts/publication-inputs.mjs';
import {
  PUBLICATION_ORIGIN,
  PreviewEnvironmentError,
  SNAPSHOT_FILES,
  SOURCE_PREVIEW_GUARANTEE,
  SourceValidationError,
  adviseCrossSourceLinks,
  collectSnapshotSources,
  crossSourceLinks,
  obtainSnapshot,
  preparationError,
  serveExitCode,
  snapshotRouteMap,
  stageSourceWorkingTree,
  websiteRevisionWarning,
  writePreviewInputs,
} from '../scripts/source-preview.mjs';
import {publicationFixture} from './helpers/publication-fixture.mjs';

const execFile = promisify(execFileCallback);
const root = path.resolve(import.meta.dirname, '..');
const previewScript = path.join(root, 'scripts', 'preview.mjs');

async function git(repositoryRoot, args) {
  return execFile('git', ['-C', repositoryRoot, ...args], {encoding: 'utf8'});
}

// A committed harness checkout, then an uncommitted edit to its one declared document: the state an
// author is in when they want to see a change before committing it.
async function dirtySourceRepository(context, fixture, {document = 'docs/guide.md', body} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-source-preview-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  const repositoryRoot = path.join(directory, 'harness');
  await mkdir(path.join(repositoryRoot, 'docs'), {recursive: true});
  await git(repositoryRoot, ['init', '--quiet']);
  await git(repositoryRoot, ['config', 'user.name', 'Website Test']);
  await git(repositoryRoot, ['config', 'user.email', 'website-test@example.invalid']);
  let manifest = await readFile(path.join(fixture.bundleRoot, 'b10x.docs.yaml'), 'utf8');
  if (document !== 'docs/guide.md') manifest = manifest.replace('include: [docs/guide.md]', `include: [${document}]`);
  await writeFile(path.join(repositoryRoot, 'b10x.docs.yaml'), manifest);
  await writeFile(path.join(repositoryRoot, document), '# Harness\n\nCommitted text.\n');
  await writeFile(path.join(repositoryRoot, 'build.mjs'), 'throw new Error("source code must never run");\n');
  await git(repositoryRoot, ['add', '.']);
  await git(repositoryRoot, ['commit', '--quiet', '-m', 'fixture']);
  const {stdout} = await git(repositoryRoot, ['rev-parse', 'HEAD']);
  const edited = body ?? [
    '# Harness',
    '',
    'Uncommitted working-tree text.',
    '',
    'See [the event log](https://beyond10x.github.io/docs/eventlog/) and',
    '[a retired route](https://beyond10x.github.io/eventlog/guide/).',
    '',
  ].join('\n');
  await writeFile(path.join(repositoryRoot, document), edited);
  return {directory, repositoryRoot, commit: stdout.trim(), edited};
}

test('the source preview is one package entry point that prepares once and starts the portal shell', async () => {
  const packageDocument = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageDocument.scripts['preview:source'], 'node scripts/preview.mjs source');
  assert.deepEqual(previewPlan('source', ['--port', '4310']), {
    prepare: true,
    reusedInputs: false,
    command: 'start',
    args: ['--port', '4310'],
    source: true,
  });
});

test('the guarantee names the snapshot, the advisory status of cross-source links, and the only failing case', () => {
  assert.match(SOURCE_PREVIEW_GUARANTEE, /working tree/);
  assert.match(SOURCE_PREVIEW_GUARANTEE, /cached .*roster and route map/);
  assert.match(SOURCE_PREVIEW_GUARANTEE, /advisory/);
  assert.match(SOURCE_PREVIEW_GUARANTEE, /non-zero only .*per-source validation/);
});

test('staging reads the uncommitted working-tree bytes of declared paths only', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const stagingRoot = path.join(source.directory, 'staging');
  const staged = await stageSourceWorkingTree({
    sourceDirectory: path.join(source.repositoryRoot, 'docs'),
    websiteRoot: fixture.websiteRoot,
    stagingRoot,
  });
  assert.equal(staged.repository, 'harness');
  assert.equal(staged.commit, source.commit);
  assert.equal(staged.treeState, 'dirty');
  assert.deepEqual(staged.index.files.map((file) => file.sourcePath), ['docs/guide.md']);
  assert.equal(await readFile(path.join(staged.treeRoot, 'docs', 'guide.md'), 'utf8'), source.edited);
  await assert.rejects(readFile(path.join(staged.treeRoot, 'build.mjs')), /ENOENT/);
});

test('a per-source validation failure is a SourceValidationError, not an environment failure', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture, {
    document: 'docs/guide.mdx',
    body: "import Danger from './danger';\n\n# Harness\n\n<Danger />\n",
  });
  await assert.rejects(stageSourceWorkingTree({
    sourceDirectory: source.repositoryRoot,
    websiteRoot: fixture.websiteRoot,
    stagingRoot: path.join(source.directory, 'staging'),
  }), SourceValidationError);
  const notRostered = await dirtySourceRepository(context, fixture);
  const manifest = await readFile(path.join(notRostered.repositoryRoot, 'b10x.docs.yaml'), 'utf8');
  await writeFile(path.join(notRostered.repositoryRoot, 'b10x.docs.yaml'), manifest.replaceAll('harness', 'unrostered'));
  await assert.rejects(stageSourceWorkingTree({
    sourceDirectory: notRostered.repositoryRoot,
    websiteRoot: fixture.websiteRoot,
    stagingRoot: path.join(notRostered.directory, 'staging'),
  }), SourceValidationError);
});

test('links into other sources are listed against the snapshot route map and never fail', () => {
  const links = crossSourceLinks({
    repository: 'harness',
    roster: ['eventlog', 'harness', 'mandate'],
    documents: [{
      sourcePath: 'docs/guide.md',
      text: [
        '[log](https://beyond10x.github.io/docs/eventlog/)',
        '[retired](https://beyond10x.github.io/eventlog/guide/)',
        '[profile](/ecosystem/mandate/)',
        '<a href="https://beyond10x.github.io/docs/mandate/start/#install">start</a>',
        '[defined]: https://beyond10x.github.io/api/eventlog/',
        '[own](https://beyond10x.github.io/docs/harness/guide/)',
        '[website](https://beyond10x.github.io/start/)',
        '[github](https://github.com/beyond10x/eventlog)',
        '[relative](./other.md)',
        '```text',
        '[fenced](https://beyond10x.github.io/docs/eventlog/fenced/)',
        '```',
      ].join('\n'),
    }],
  });
  assert.deepEqual(links.map((link) => [link.target, link.path]), [
    ['eventlog', '/docs/eventlog/'],
    ['eventlog', '/eventlog/guide/'],
    ['mandate', '/ecosystem/mandate/'],
    ['mandate', '/docs/mandate/start/'],
    ['eventlog', '/api/eventlog/'],
  ]);
  const advice = adviseCrossSourceLinks(links, new Set(['/docs/eventlog/', '/ecosystem/mandate/', '/docs/mandate/start/']));
  assert.deepEqual(advice.map((entry) => entry.status), ['resolves', 'absent', 'resolves', 'resolves', 'absent']);
  assert.ok(advice.every((entry) => entry.document === 'docs/guide.md'));
});


// The last publication as the live site serves it: PROVENANCE.json plus the three published data
// files the portal needs as its bootstrap. Roster aep + harness; aep is a local Git checkout standing
// in for its public GitHub repository, harness is the source under preview.
async function publishedSnapshot(context, fixture, source) {
  const aepRoot = path.join(source.directory, 'workspace', 'aep');
  await mkdir(path.join(aepRoot, 'docs'), {recursive: true});
  await git(aepRoot, ['init', '--quiet']);
  await git(aepRoot, ['config', 'user.name', 'Website Test']);
  await git(aepRoot, ['config', 'user.email', 'website-test@example.invalid']);
  const aepManifest = (await readFile(path.join(fixture.bundleRoot, 'b10x.docs.yaml'), 'utf8'))
    .replaceAll('harness', 'aep').replaceAll('Harness', 'AEP');
  await writeFile(path.join(aepRoot, 'b10x.docs.yaml'), aepManifest);
  await writeFile(path.join(aepRoot, 'docs', 'guide.md'), '# AEP\n\nPublished AEP text.\n');
  await writeFile(path.join(aepRoot, 'docs', 'undeclared.md'), '# Not declared\n');
  await git(aepRoot, ['add', '.']);
  await git(aepRoot, ['commit', '--quiet', '-m', 'published']);
  const aepCommit = (await git(aepRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  const aepIndex = await collectManifestSources(await readManifest(path.join(aepRoot, 'b10x.docs.yaml')), aepRoot);

  await writeFile(path.join(fixture.websiteRoot, 'sources.yaml'), [
    'schema: b10x-website-sources/v1',
    'organization: beyond10x',
    'manifestPath: b10x.docs.yaml',
    'compatibilityRepositories:',
    '  - getting-started',
    'repositories:',
    '  - aep',
    '  - harness',
    '',
  ].join('\n'));
  const bootstrap = {
    'changes.json': Buffer.from(canonicalJson({schema: 'b10x-change-ledger/v1', changes: []})),
    'ecosystem.json': Buffer.from(canonicalJson({schema: 'b10x-docs-registry/v2', surfaces: []})),
    'release-facts.json': Buffer.from(canonicalJson({schema: 'b10x-release-facts/v1', releases: []})),
  };
  const provenance = {
    schema: 'b10x-website-provenance/v2',
    websiteCommit: '5'.repeat(40),
    atlasControlCommit: '6'.repeat(40),
    sourceCommits: {aep: aepCommit, harness: '7'.repeat(40)},
    sourceBundles: {
      aep: {
        commit: aepCommit,
        producerRunId: 81,
        manifestSha256: sha256(Buffer.from(aepManifest)),
        // The live provenance records the bundle inventory digest as contentSha256, which a preview
        // cannot reproduce; the collection digest is the one that must match.
        collectionSha256: sha256(Buffer.from(canonicalJson(aepIndex))),
        contentSha256: 'b'.repeat(64),
      },
      harness: {
        commit: '7'.repeat(40),
        producerRunId: 82,
        manifestSha256: '8'.repeat(64),
        collectionSha256: 'c'.repeat(64),
        contentSha256: '9'.repeat(64),
      },
    },
    routes: ['/', '/docs/aep/', '/docs/aep/guide/', '/ecosystem/aep/'],
    files: Object.entries(bootstrap).map(([name, bytes]) => ({path: name, sha256: sha256(bytes), size: bytes.byteLength})),
  };
  const files = {'PROVENANCE.json': Buffer.from(canonicalJson(provenance)), ...bootstrap};
  const snapshotRoot = path.join(source.directory, 'snapshot');
  await mkdir(snapshotRoot, {recursive: true});
  for (const [name, bytes] of Object.entries(files)) await writeFile(path.join(snapshotRoot, name), bytes);
  return {snapshotRoot, files, provenance, workspace: path.join(source.directory, 'workspace'), aepCommit};
}

test('the snapshot is the live publication, cached, and verified against its own provenance', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const published = await publishedSnapshot(context, fixture, source);
  const cacheDirectory = path.join(source.directory, 'cache', 'publication');
  const requested = [];
  const liveFetch = async (url) => {
    requested.push(url);
    const bytes = published.files[new URL(url).pathname.slice(1)];
    return bytes ? new Response(bytes, {status: 200}) : new Response('missing', {status: 404});
  };
  const roster = ['aep', 'harness'];
  const live = await obtainSnapshot({cacheDirectory, roster, fetchImpl: liveFetch});
  assert.equal(live.origin, 'live');
  assert.deepEqual(requested.sort(), SNAPSHOT_FILES.map((name) => `${PUBLICATION_ORIGIN}/${name}`).sort());
  assert.equal(live.snapshot.provenance.websiteCommit, '5'.repeat(40));
  assert.deepEqual(await readFile(path.join(cacheDirectory, 'PROVENANCE.json')), published.files['PROVENANCE.json']);
  assert.deepEqual([...snapshotRouteMap(live.snapshot)], published.provenance.routes);

  const offline = await obtainSnapshot({cacheDirectory, roster, fetchImpl: async () => { throw new Error('offline'); }});
  assert.equal(offline.origin, 'cache');
  assert.match(offline.warning, /offline/);

  const override = await obtainSnapshot({override: published.snapshotRoot, cacheDirectory, roster, fetchImpl: liveFetch});
  assert.equal(override.origin, 'override');

  await assert.rejects(obtainSnapshot({
    cacheDirectory: path.join(source.directory, 'empty-cache'),
    roster,
    fetchImpl: async () => { throw new Error('offline'); },
  }), (error) => error instanceof PreviewEnvironmentError && /--snapshot/.test(error.message));
  await assert.rejects(obtainSnapshot({override: path.join(source.directory, 'absent'), cacheDirectory, roster}), /--snapshot/);
  await assert.rejects(obtainSnapshot({override: published.snapshotRoot, cacheDirectory, roster: ['harness']}), /roster/);
  await writeFile(path.join(published.snapshotRoot, 'changes.json'), '{"schema":"b10x-change-ledger/v1","changes":[]}');
  await assert.rejects(obtainSnapshot({override: published.snapshotRoot, cacheDirectory, roster}), /changes\.json.*provenance/);
});

test('every other source is collected at its published commit through bare Git objects and must reproduce its published digest', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const published = await publishedSnapshot(context, fixture, source);
  const {snapshot} = await obtainSnapshot({override: published.snapshotRoot, cacheDirectory: path.join(source.directory, 'unused'), roster: ['aep', 'harness']});
  const cacheRoot = path.join(source.directory, 'sources-cache');
  const others = await collectSnapshotSources({snapshot, exclude: 'harness', cacheRoot, sourceWorkspace: published.workspace});
  assert.deepEqual(others.map((other) => [other.repository, other.commit]), [['aep', published.aepCommit]]);
  assert.deepEqual(others[0].index.files.map((file) => file.sourcePath), ['docs/guide.md']);

  await writeFile(path.join(published.workspace, 'aep', 'docs', 'guide.md'), '# AEP\n\nDirty bytes are never the snapshot.\n');
  const again = await collectSnapshotSources({snapshot, exclude: 'harness', cacheRoot, sourceWorkspace: published.workspace});
  assert.equal(await readFile(path.join(again[0].treeRoot, 'docs', 'guide.md'), 'utf8'), '# AEP\n\nPublished AEP text.\n');

  const drifted = structuredClone(snapshot);
  drifted.provenance.sourceBundles.aep.collectionSha256 = 'a'.repeat(64);
  await assert.rejects(
    collectSnapshotSources({snapshot: drifted, exclude: 'harness', cacheRoot, sourceWorkspace: published.workspace}),
    (error) => error instanceof PreviewEnvironmentError && /aep.*published collection digest/.test(error.message),
  );
});

test('preview inputs are the snapshot with exactly one source replaced, and pass every publication-input validator', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const published = await publishedSnapshot(context, fixture, source);
  const {snapshot} = await obtainSnapshot({override: published.snapshotRoot, cacheDirectory: path.join(source.directory, 'unused'), roster: ['aep', 'harness']});
  const staged = await stageSourceWorkingTree({
    sourceDirectory: source.repositoryRoot,
    websiteRoot: fixture.websiteRoot,
    stagingRoot: path.join(source.directory, 'staging'),
  });
  const others = await collectSnapshotSources({snapshot, exclude: 'harness', cacheRoot: path.join(source.directory, 'sources-cache'), sourceWorkspace: published.workspace});
  const {sourceSetPath} = await writePreviewInputs({
    websiteRoot: fixture.websiteRoot,
    snapshot,
    source: staged,
    others,
    outputRoot: path.join(source.directory, 'preview-inputs'),
  });

  const inputs = await loadPublicationInputs({root: fixture.websiteRoot, environment: {B10X_DOCS_SOURCE_SET: sourceSetPath}});
  assert.equal(inputs.sourceSet.websiteRuntimeCommit, '5'.repeat(40));
  assert.equal(inputs.sourceSet.atlasControlCommit, '6'.repeat(40));
  assert.equal(inputs.bundles.get('aep').document.commit, published.aepCommit);
  assert.equal(sha256(await readFile(inputs.bundles.get('aep').collectionFile)), published.provenance.sourceBundles.aep.collectionSha256);
  assert.equal(inputs.bundles.get('harness').document.commit, source.commit);
  await validateBootstrapSnapshots(fixture.websiteRoot, inputs.roster.repositories, {
    directory: inputs.bootstrapRoot,
    sourceSetSha256: inputs.sourceSetSha256,
    websiteRevision: inputs.sourceSet.websiteRuntimeCommit,
    sourceRevision: inputs.sourceSet.atlasControlCommit,
  });
  const collected = await collectSources({
    root: fixture.websiteRoot,
    outputRoot: path.join(source.directory, 'generated'),
    inputs,
    sourceWorkspace: path.join(source.directory, 'must-not-be-used'),
  });
  assert.equal(
    await readFile(path.join(collected.collectionRoot, 'harness', 'docs', 'document', 'docs', 'guide.md'), 'utf8'),
    source.edited,
  );
});

test('a Website revision other than the publishing one is a warning, never a failure', () => {
  assert.equal(websiteRevisionWarning('a'.repeat(40), 'a'.repeat(40)), undefined);
  assert.match(websiteRevisionWarning('a'.repeat(40), 'b'.repeat(40)), /warning.*aaaaaaaaaaaa.*bbbbbbbbbbbb/);
  assert.match(websiteRevisionWarning('a'.repeat(40), undefined), /warning/);
});

test('a server that stops without being interrupted exits 2, and an interrupted one exits 0', () => {
  assert.equal(serveExitCode({status: 0, signal: 'SIGINT'}), 0);
  assert.equal(serveExitCode({status: 143, signal: 'SIGTERM'}), 0);
  for (const status of [0, 1]) {
    assert.throws(() => serveExitCode({status, signal: undefined}),
      (error) => error instanceof PreviewEnvironmentError && /preview server stopped \(exit \d\)/.test(error.message));
  }
});

test('portal preparation failure is not a per-source validation failure and names its likely cause', () => {
  const same = preparationError({repository: 'ess', status: 1, websiteCommit: 'a'.repeat(40), headCommit: 'a'.repeat(40)});
  assert.ok(same instanceof PreviewEnvironmentError);
  assert.ok(!(same instanceof SourceValidationError));
  assert.match(same.message, /exit 1/);
  assert.match(same.message, /likely cause: the snapshot/);
  const other = preparationError({repository: 'ess', status: 1, websiteCommit: 'a'.repeat(40), headCommit: 'b'.repeat(40)});
  assert.match(other.message, /likely cause: Website code/);
});

test('the command prints its guarantee first and exits non-zero only for a per-source validation failure', async (context) => {
  const fixture = await publicationFixture(context);
  const invalid = await dirtySourceRepository(context, fixture, {
    document: 'docs/guide.mdx',
    body: "import Danger from './danger';\n\n# Harness\n",
  });
  const failure = await execFile(process.execPath, [
    previewScript, 'source', '--source', invalid.repositoryRoot, '--snapshot', path.join(invalid.directory, 'unused'),
  ], {cwd: invalid.repositoryRoot, encoding: 'utf8'}).then(
    () => assert.fail('an invalid source must exit non-zero'),
    (error) => error,
  );
  assert.equal(failure.code, 1);
  assert.ok(failure.stdout.startsWith('[source preview] '), failure.stdout);
  assert.ok(failure.stdout.includes(SOURCE_PREVIEW_GUARANTEE));
  assert.match(failure.stderr, /harness failed per-source validation/);
});

test('a snapshot that cannot be obtained exits 2 and says what to supply', async (context) => {
  const fixture = await publicationFixture(context);
  const valid = await dirtySourceRepository(context, fixture);
  const failure = await execFile(process.execPath, [
    previewScript, 'source', '--source', valid.repositoryRoot, '--snapshot', path.join(valid.directory, 'absent'),
  ], {cwd: valid.repositoryRoot, encoding: 'utf8'}).then(
    () => assert.fail('a missing snapshot must exit non-zero'),
    (error) => error,
  );
  assert.equal(failure.code, 2);
  assert.match(failure.stderr, /cannot start: .*--snapshot/);
});

// Every refusal the portal makes on the author's own bytes, beyond the four the adversary named,
// must surface in staging as a SourceValidationError, so that exit 2 means only "cannot build or
// serve". Each case below is refused later by prepare-site.mjs: sidebar_position at :403 through
// sidebar-contract.mjs sourceSidebarMetadata, a declared audience outside the search vocabulary at
// :681 through assertSearchAudienceVocabulary, and two documents on one route at :959.
async function sourceWithFiles(context, fixture, include, files) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-source-preview-class-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  const repositoryRoot = path.join(directory, 'harness');
  await mkdir(repositoryRoot, {recursive: true});
  await git(repositoryRoot, ['init', '--quiet']);
  const manifest = (await readFile(path.join(fixture.bundleRoot, 'b10x.docs.yaml'), 'utf8'))
    .replace('include: [docs/guide.md]', `include: [${include}]`);
  await writeFile(path.join(repositoryRoot, 'b10x.docs.yaml'), manifest);
  for (const [relative, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repositoryRoot, relative)), {recursive: true});
    await writeFile(path.join(repositoryRoot, relative), body);
  }
  await git(repositoryRoot, ['add', '.']);
  await git(repositoryRoot, ['-c', 'user.name=Website Test', '-c', 'user.email=website-test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  return {directory, repositoryRoot};
}

for (const [label, include, files, pattern] of [
  ['a non-integer sidebar_position', 'docs/guide.md', {'docs/guide.md': '---\nsidebar_position: two\n---\n\n# Guide\n'}, /sidebar_position/],
  ['an audience outside the search vocabulary', 'docs/guide.md', {'docs/guide.md': '---\nb10x:\n  audiences: [nobody]\n---\n\n# Guide\n'}, /audience/],
  ['two documents on one route', 'docs/**/*.md', {'docs/guide.md': '# Guide\n', 'docs/guide/README.md': '# Guide again\n'}, /duplicate/],
]) {
  test(`staging refuses ${label} as a per-source validation failure`, async (context) => {
    const fixture = await publicationFixture(context);
    const source = await sourceWithFiles(context, fixture, include, files);
    await assert.rejects(stageSourceWorkingTree({
      sourceDirectory: source.repositoryRoot,
      websiteRoot: fixture.websiteRoot,
      stagingRoot: path.join(source.directory, 'staging'),
    }), (error) => error instanceof SourceValidationError && pattern.test(error.message));
  });
}

test('staging accepts what the portal accepts: comments, heading ids, placeholders and admonitions', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await sourceWithFiles(context, fixture, 'docs/guide.md', {
    'docs/guide.md': [
      '---', 'title: Guide', 'sidebar_position: 2', '---', '', '# Guide {#guide}', '',
      '<!-- an author note -->', '', 'Replace <task> with yours.', '', ':::note', '', 'Heads up.', '', ':::', '',
      '<details>', '  <summary>More</summary>', '', 'Hidden.', '', '</details>', '',
    ].join('\n'),
  });
  const staged = await stageSourceWorkingTree({
    sourceDirectory: source.repositoryRoot,
    websiteRoot: fixture.websiteRoot,
    stagingRoot: path.join(source.directory, 'staging'),
  });
  assert.deepEqual(staged.index.files.map((file) => file.sourcePath), ['docs/guide.md']);
});

test('the portal compile mirrors this Website config: MDX format for .md and no mdx1 compatibility', async () => {
  const config = await readFile(path.join(root, 'docusaurus.config.ts'), 'utf8');
  const markdown = /\n  markdown: \{([\s\S]*?)\n  \},/.exec(config)?.[1] ?? '';
  assert.doesNotMatch(markdown, /\bformat\s*:/, 'a markdown.format change must be mirrored in source-preview portalCompileOptions');
  assert.doesNotMatch(markdown, /mdx1Compat/, 'an mdx1Compat change must be mirrored in source-preview portalCompileOptions');
  assert.match(config, /\n    v4: true,/, 'future.v4 disables mdx1Compat by default; changing it must be mirrored');
});

test('Ctrl-C before the preview server exists aborts, cleans up, and exits 130', async (context) => {
  const fixture = await publicationFixture(context);
  const source = await dirtySourceRepository(context, fixture);
  const server = (await import('node:http')).createServer((request, response) => {
    response.writeHead(200, {'content-type': 'application/json'});
    response.write('{');
    const timer = setInterval(() => response.write(' '), 200);
    response.on('close', () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const cacheRoot = path.join(root, '.cache', 'source-preview');
  const before = new Set(await readdir(cacheRoot).catch(() => []));
  const redirect = pathToFileURL(path.join(import.meta.dirname, 'helpers', 'adversary-redirect-fetch.mjs')).href;
  const child = spawn(process.execPath, ['--import', redirect, previewScript, 'source', '--source', source.repositoryRoot], {
    cwd: source.repositoryRoot,
    env: {...process.env, B10X_ADVERSARY_ORIGIN: `http://127.0.0.1:${server.address().port}`},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({code, signal})));
  for (let waited = 0; !output.includes('pass per-source validation') && waited < 30_000; waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  child.kill('SIGINT');
  const outcome = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(undefined), 10_000))]);
  if (!outcome) child.kill('SIGKILL');
  assert.deepEqual(outcome, {code: 130, signal: null}, output);
  assert.match(output, /interrupted/);
  const left = (await readdir(cacheRoot).catch(() => [])).filter((entry) => !before.has(entry)
    && (entry.startsWith('staging-') || entry.startsWith('publication.fetch-')));
  assert.deepEqual(left, [], 'an interrupted preview leaves no staging or fetch directories behind');
});
