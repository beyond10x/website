import assert from 'node:assert/strict';
import {execFile as execFileCallback} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {
  SourceValidationError,
  crossSourceLinks,
  stageSourceWorkingTree,
} from '../scripts/source-preview.mjs';
import {publicationFixture} from './helpers/publication-fixture.mjs';

const execFile = promisify(execFileCallback);

async function git(repositoryRoot, args) {
  return execFile('git', ['-C', repositoryRoot, ...args], {encoding: 'utf8'});
}

// AGENTS.md Boundary: the preview reads only the paths the manifest declares. A declared file whose
// parent directory has been replaced, in the working tree, by a symbolic link to a directory outside
// the repository is still listed by `git ls-files --cached` (the index has it as a regular file), and
// `lstat` on the full path follows the parent link. The production collector reads the tree that
// would be committed, where that directory is mode 120000 and is refused
// (scripts/git-source.mjs:116). The preview must refuse it too, and must not read the outside bytes.
test('adversary: a declared file reached through a symlinked parent directory is refused, not read', async (context) => {
  const fixture = await publicationFixture(context);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-source-preview-adversary-'));
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

  const outside = path.join(directory, 'outside-the-repository');
  await mkdir(outside, {recursive: true});
  const outsideBytes = '# Outside\n\nBytes that live outside the source repository.\n';
  await writeFile(path.join(outside, 'guide.md'), outsideBytes);
  await rm(path.join(repositoryRoot, 'docs'), {recursive: true, force: true});
  await symlink(outside, path.join(repositoryRoot, 'docs'), 'dir');

  let staged;
  try {
    staged = await stageSourceWorkingTree({
      sourceDirectory: repositoryRoot,
      websiteRoot: fixture.websiteRoot,
      stagingRoot: path.join(directory, 'staging'),
    });
  } catch (error) {
    assert.ok(error instanceof SourceValidationError, `expected a SourceValidationError, got ${error}`);
    return;
  }
  const read = await readFile(path.join(staged.treeRoot, 'docs', 'guide.md'), 'utf8');
  assert.fail(`staging accepted docs/ as a symbolic link to ${outside} and read ${JSON.stringify(read)} (outside bytes: ${read === outsideBytes})`);
});

// Acceptance: "lists links into other sources as advisory". CommonMark autolinks and link titles in
// single quotes render as ordinary links into another source, and so does a GFM literal URL (the
// portal renders GFM). Each of these is a link into eventlog or mandate and must be listed.
test('adversary: a CommonMark autolink into another source is listed', () => {
  const links = crossSourceLinks({
    repository: 'harness',
    roster: ['eventlog', 'harness', 'mandate'],
    documents: [{sourcePath: 'docs/guide.md', text: 'See <https://beyond10x.github.io/docs/eventlog/>.\n'}],
  });
  assert.deepEqual(links.map((link) => [link.target, link.path]), [['eventlog', '/docs/eventlog/']]);
});

test('adversary: an inline link with a single-quoted title into another source is listed', () => {
  const links = crossSourceLinks({
    repository: 'harness',
    roster: ['eventlog', 'harness', 'mandate'],
    documents: [{sourcePath: 'docs/guide.md', text: "See [the log](https://beyond10x.github.io/docs/eventlog/guide/ 'Event log').\n"}],
  });
  assert.deepEqual(links.map((link) => [link.target, link.path]), [['eventlog', '/docs/eventlog/guide/']]);
});

test('adversary: a GFM literal URL into another source is listed', () => {
  const links = crossSourceLinks({
    repository: 'harness',
    roster: ['eventlog', 'harness', 'mandate'],
    documents: [{sourcePath: 'docs/guide.md', text: 'Read https://beyond10x.github.io/docs/mandate/start/ first.\n'}],
  });
  assert.deepEqual(links.map((link) => [link.target, link.path]), [['mandate', '/docs/mandate/start/']]);
});
