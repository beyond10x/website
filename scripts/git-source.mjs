import {createHash} from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {parse} from 'yaml';
import {compareUtf8} from './order-contract.mjs';

const execFile = promisify(execFileCallback);
const commitPattern = /^[0-9a-f]{40}$/;
const repositoryPattern = /^[a-z0-9][a-z0-9-]*$/;

export async function readRoster(file) {
  const document = parse(await readFile(file, 'utf8'));
  if (document?.schema !== 'b10x-website-sources/v1' || document.organization !== 'beyond10x') {
    throw new Error(`${file} is not a b10x-website-sources/v1 roster`);
  }
  if (!Array.isArray(document.repositories) || document.repositories.length === 0) {
    throw new Error(`${file} has no repositories`);
  }
  const repositories = [...document.repositories];
  if (repositories.some((value) => typeof value !== 'string' || !repositoryPattern.test(value))) {
    throw new Error(`${file} contains an invalid repository id`);
  }
  if (new Set(repositories).size !== repositories.length) throw new Error(`${file} contains duplicate repositories`);
  if ([...repositories].sort(compareUtf8).join('\n') !== repositories.join('\n')) throw new Error(`${file} repositories must be sorted`);
  return {
    repositories,
    manifestPath: safeTreePath(document.manifestPath ?? 'b10x.docs.yaml'),
  };
}

export function repositoryUrl(repository) {
  if (!repositoryPattern.test(repository)) throw new Error(`invalid beyond10x repository ${repository}`);
  return `https://github.com/beyond10x/${repository}`;
}

export async function resolveCommit(url, ref = 'refs/heads/main') {
  validateRepositoryUrl(url);
  if (!/^refs\/heads\/[a-zA-Z0-9._/-]+$/.test(ref) || ref.includes('..')) throw new Error(`unsafe source ref ${ref}`);
  const {stdout} = await runGit(['ls-remote', `${url}.git`, ref]);
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw new Error(`${url} ${ref} did not resolve exactly once`);
  const commit = lines[0].split(/\s+/)[0];
  if (!commitPattern.test(commit)) throw new Error(`${url} ${ref} resolved to invalid commit ${commit}`);
  return commit;
}

export async function extractDeclaredSource({repository, url, commit, manifestPath, cacheRoot}) {
  validateRepositoryUrl(url, repository);
  if (!commitPattern.test(commit)) throw new Error(`${repository} has invalid commit ${commit}`);
  const bare = path.join(cacheRoot, 'objects', `${repository}.git`);
  const treeRoot = path.join(cacheRoot, 'trees', `${repository}-${commit}`);
  await mkdir(path.dirname(bare), {recursive: true});
  try {
    await runGit([`--git-dir=${bare}`, 'rev-parse', '--is-bare-repository']);
  } catch {
    await runGit(['init', '--bare', bare]);
  }
  await runGit([`--git-dir=${bare}`, 'fetch', '--no-tags', '--depth=1', `${url}.git`, commit]);
  await runGit([`--git-dir=${bare}`, 'cat-file', '-e', `${commit}^{commit}`]);

  const entries = await listTree(bare, commit);
  const manifestEntry = entries.find((entry) => entry.path === manifestPath);
  if (!manifestEntry || manifestEntry.type !== 'blob' || !manifestEntry.mode.startsWith('100')) {
    throw new Error(`${repository}@${commit} does not contain regular ${manifestPath}`);
  }
  const manifestBytes = await readObject(bare, manifestEntry.object);
  const manifest = parse(manifestBytes.toString('utf8'));
  if (manifest?.schema !== 'b10x-docs/v3') throw new Error(`${repository}@${commit} ${manifestPath} is not b10x-docs/v3`);
  if (manifest.repository?.id !== repository || manifest.repository?.url !== url) {
    throw new Error(`${repository}@${commit} manifest repository identity does not match its source lock`);
  }

  const anchors = declaredAnchors(manifest);
  await rm(treeRoot, {recursive: true, force: true});
  await mkdir(treeRoot, {recursive: true});
  for (const sourceRoot of manifest.surfaces.map((surface) => surface.source.root)) {
    await mkdir(resolveTreeDestination(treeRoot, sourceRoot), {recursive: true});
  }
  for (const entry of entries) {
    if (entry.path !== manifestPath && !anchors.some((anchor) => underAnchor(entry.path, anchor))) continue;
    if (entry.mode === '120000') throw new Error(`${repository}@${commit} selected source ${entry.path} is a symbolic link`);
    if (entry.type === 'commit' || entry.mode === '160000') throw new Error(`${repository}@${commit} selected source ${entry.path} is a submodule`);
    if (entry.type !== 'blob' || !entry.mode.startsWith('100')) continue;
    const destination = resolveTreeDestination(treeRoot, entry.path);
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, await readObject(bare, entry.object), {mode: 0o644});
  }
  return {
    treeRoot,
    manifestFile: path.join(treeRoot, ...manifestPath.split('/')),
    manifestSha256: sha256(manifestBytes),
  };
}

export function declaredAnchors(manifest) {
  const anchors = new Set();
  for (const surface of manifest.surfaces ?? []) {
    const root = safeTreePath(surface.source?.root ?? '');
    for (const selection of [surface.source?.documents, surface.source?.data, surface.source?.assets, surface.source?.blog]) {
      for (const pattern of selection?.include ?? []) anchors.add(joinSource(root, staticPrefix(pattern)));
    }
    for (const specification of surface.source?.specifications ?? []) {
      anchors.add(joinSource(root, safeTreePath(specification.path)));
    }
  }
  return [...anchors].sort(compareUtf8);
}

export function staticPrefix(pattern) {
  const normalized = safeTreePath(pattern);
  const wildcard = normalized.search(/[?*]/);
  if (wildcard < 0) return normalized;
  const prefix = normalized.slice(0, wildcard);
  const slash = prefix.lastIndexOf('/');
  return slash < 0 ? '.' : prefix.slice(0, slash);
}

export function safeTreePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value) || value.includes('\0')) {
    throw new Error(`unsafe repository path ${String(value)}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) throw new Error(`repository path escapes its root: ${value}`);
  return normalized;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateRepositoryUrl(url, repository) {
  const expected = repository ? repositoryUrl(repository) : undefined;
  if (!/^https:\/\/github\.com\/beyond10x\/[a-z0-9][a-z0-9-]*$/.test(url) || (expected && url !== expected)) {
    throw new Error(`source URL is outside the public beyond10x allowlist: ${url}`);
  }
}

function joinSource(root, relative) {
  if (relative === '.') return root;
  return safeTreePath(path.posix.join(root, relative));
}

function underAnchor(candidate, anchor) {
  return anchor === '.' || candidate === anchor || candidate.startsWith(`${anchor}/`);
}

function resolveTreeDestination(root, relative) {
  const normalized = safeTreePath(relative);
  const destination = path.resolve(root, ...normalized.split('/'));
  const relation = path.relative(root, destination);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`repository path escapes extraction root: ${relative}`);
  }
  return destination;
}

async function listTree(bare, commit) {
  const {stdout} = await runGit([`--git-dir=${bare}`, 'ls-tree', '-rz', '--full-tree', commit], {encoding: 'buffer'});
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+) (blob|tree|commit) ([0-9a-f]+)\t([\s\S]+)$/.exec(line);
      if (!match) throw new Error(`unexpected git tree entry ${JSON.stringify(line)}`);
      return {mode: match[1], type: match[2], object: match[3], path: safeTreePath(match[4])};
    });
}

async function readObject(bare, object) {
  const {stdout} = await runGit([`--git-dir=${bare}`, 'cat-file', 'blob', object], {encoding: 'buffer'});
  return stdout;
}

async function runGit(args, options = {}) {
  return execFile('git', args, {encoding: options.encoding ?? 'utf8', maxBuffer: 128 * 1024 * 1024});
}
