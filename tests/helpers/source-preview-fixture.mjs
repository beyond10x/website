// Shared by the source-preview tests: an author's dirty checkout of the harness source, and the last
// publication that the preview renders against.
import {execFile as execFileCallback} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {collectManifestSources} from '@beyond10x/docs-system/collector';
import {readManifest} from '@beyond10x/docs-system/manifest';
import {canonicalJson, sha256} from '../../scripts/artifact-contract.mjs';

const execFile = promisify(execFileCallback);

export async function git(repositoryRoot, args) {
  return execFile('git', ['-C', repositoryRoot, ...args], {encoding: 'utf8'});
}

// A committed harness checkout, then an uncommitted edit to its one declared document: the state an
// author is in when they want to see a change before committing it.
export async function dirtySourceRepository(context, fixture, {document = 'docs/guide.md', body} = {}) {
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

// The last publication as the live site serves it: PROVENANCE.json plus the three published data
// files the portal needs as its bootstrap. Roster aep + harness; aep is a local Git checkout standing
// in for its public GitHub repository, harness is the source under preview.
export async function publishedSnapshot(context, fixture, source) {
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
