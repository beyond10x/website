import {createHash} from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {devNull} from 'node:os';
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

export function credentialFreeRepositoryUrl(url) {
  validateRepositoryUrl(url);
  return `https://anonymous:@${url.slice('https://'.length)}.git`;
}

export async function resolveCommit(url, ref = 'refs/heads/main', environment = process.env) {
  validateRepositoryUrl(url);
  if (!/^refs\/heads\/[a-zA-Z0-9._/-]+$/.test(ref) || ref.includes('..')) throw new Error(`unsafe source ref ${ref}`);
  const {stdout} = await runGit(['ls-remote', credentialFreeRepositoryUrl(url), ref], {}, environment);
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw new Error(`${url} ${ref} did not resolve exactly once`);
  const commit = lines[0].split(/\s+/)[0];
  if (!commitPattern.test(commit)) throw new Error(`${url} ${ref} resolved to invalid commit ${commit}`);
  return commit;
}

export async function resolveWorkspaceCommit(sourceWorkspace, repository) {
  const repositoryRoot = await localRepositoryRoot(sourceWorkspace, repository);
  let branch;
  let commit;
  let status;
  try {
    ({stdout: branch} = await runGit(['-C', repositoryRoot, 'symbolic-ref', '--quiet', 'HEAD']));
    ({stdout: commit} = await runGit(['-C', repositoryRoot, 'rev-parse', '--verify', 'HEAD^{commit}']));
    ({stdout: status} = await runGit(['-C', repositoryRoot, 'status', '--porcelain=v1', '--untracked-files=all']));
  } catch {
    throw new Error(`${repository} below B10X_SOURCE_WORKSPACE is not a readable Git checkout`);
  }
  if (branch.trim() !== 'refs/heads/main') {
    throw new Error(`${repository} local source-lock input must have main checked out`);
  }
  if (status.length > 0) {
    throw new Error(`${repository} local source-lock input must be clean before its main HEAD can be locked`);
  }
  const resolved = commit.trim();
  if (!commitPattern.test(resolved)) throw new Error(`${repository} local main resolved to invalid commit ${resolved}`);
  return resolved;
}

export async function extractDeclaredSource({repository, url, commit, manifestPath, cacheRoot, sourceWorkspace}) {
  validateRepositoryUrl(url, repository);
  if (!commitPattern.test(commit)) throw new Error(`${repository} has invalid commit ${commit}`);
  const bare = path.join(cacheRoot, 'objects', `${repository}.git`);
  const treeRoot = path.join(cacheRoot, 'trees', `${repository}-${commit}`);
  const fetchSource = sourceWorkspace
    ? await localGitSource(sourceWorkspace, repository, commit)
    : credentialFreeRepositoryUrl(url);
  await mkdir(path.dirname(bare), {recursive: true});
  try {
    await runGit([`--git-dir=${bare}`, 'rev-parse', '--is-bare-repository']);
  } catch {
    await runGit(['init', '--bare', bare]);
  }
  await assertCredentialNeutralBareRepository(bare);
  await runGit([`--git-dir=${bare}`, 'fetch', '--no-tags', '--depth=1', fetchSource, commit]);
  await runGit([`--git-dir=${bare}`, 'cat-file', '-e', `${commit}^{commit}`]);

  const entries = await listTree(bare, commit);
  const manifestEntry = entries.find((entry) => entry.path === manifestPath);
  if (!manifestEntry || manifestEntry.type !== 'blob' || !manifestEntry.mode.startsWith('100')) {
    throw new Error(`${repository}@${commit} does not contain regular ${manifestPath}`);
  }
  const manifestBytes = await readObject(bare, manifestEntry.object);
  const manifest = parse(manifestBytes.toString('utf8'));
  if (!isCollectableManifestSchema(manifest?.schema)) throw new Error(`${repository}@${commit} ${manifestPath} is not b10x-docs/v3 or b10x-docs/v4`);
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

export function isCollectableManifestSchema(schema) {
  return schema === 'b10x-docs/v3' || schema === 'b10x-docs/v4';
}

export function sourceWorkspaceFromEnvironment(environment = process.env) {
  const value = environment.B10X_SOURCE_WORKSPACE;
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.includes('\0') || !path.isAbsolute(value)) {
    throw new Error('B10X_SOURCE_WORKSPACE must be an absolute directory containing direct repository children');
  }
  return path.resolve(value);
}

/**
 * Remote source discovery and extraction are a credential-free publication
 * boundary. Do not let a developer's URL rewrites, credential helpers, askpass
 * programs, or SSH agent turn a private checkout into an apparently public
 * production source.
 */
export function credentialFreeGitEnvironment(environment = process.env) {
  const sanitized = {...environment};
  for (const key of Object.keys(sanitized)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_[0-9]+|VALUE_[0-9]+)$/.test(key)) delete sanitized[key];
  }
  for (const key of [
    'GIT_ASKPASS',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_SYSTEM',
    'GIT_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_PROXY_COMMAND',
    'GIT_SSH',
    'GIT_SSH_COMMAND',
    'GIT_WORK_TREE',
    'SSH_ASKPASS',
    'SSH_AUTH_SOCK',
  ]) delete sanitized[key];
  sanitized.GIT_CONFIG_GLOBAL = devNull;
  sanitized.GIT_CONFIG_NOSYSTEM = '1';
  sanitized.GIT_TERMINAL_PROMPT = '0';
  sanitized.GCM_INTERACTIVE = 'Never';
  // Git enables libcurl's optional netrc lookup; pin it to an empty file
  // instead of changing HOME or consulting the developer's ~/.netrc.
  sanitized.NETRC = devNull;
  sanitized.SSH_ASKPASS_REQUIRE = 'never';
  return sanitized;
}

async function assertCredentialNeutralBareRepository(bare) {
  const {stdout} = await runGit(
    [`--git-dir=${bare}`, 'config', '--local', '--null', '--list'],
    {encoding: 'buffer'},
  );
  const allowed = new Map([
    ['core.bare', new Set(['true'])],
    ['core.filemode', new Set(['false', 'true'])],
    ['core.repositoryformatversion', new Set(['0'])],
  ]);
  const entries = stdout.toString('utf8').split('\0').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('\n');
    return separator < 0 ? [entry, ''] : [entry.slice(0, separator), entry.slice(separator + 1)];
  });
  const unsupported = entries
    .filter(([name, value]) => !allowed.get(name)?.has(value))
    .map(([name]) => name)
    .sort();
  if (new Set(entries.map(([name]) => name)).size !== entries.length) unsupported.push('duplicate key');
  if (unsupported.length > 0) {
    throw new Error(`source object cache contains unsupported local Git configuration: ${unsupported.join(', ')}`);
  }
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

async function localGitSource(workspaceRoot, repository, commit) {
  const repositoryRoot = await localRepositoryRoot(workspaceRoot, repository);
  try {
    await runGit(['-C', repositoryRoot, 'cat-file', '-e', `${commit}^{commit}`]);
  } catch {
    throw new Error(`${repository}@${commit} is not available as an exact Git object below B10X_SOURCE_WORKSPACE`);
  }
  return repositoryRoot;
}

async function localRepositoryRoot(workspaceRoot, repository) {
  if (!path.isAbsolute(workspaceRoot)) throw new Error('the local source workspace must be absolute');
  if (!repositoryPattern.test(repository)) throw new Error(`invalid beyond10x repository ${repository}`);
  let resolvedWorkspace;
  let repositoryRoot;
  try {
    resolvedWorkspace = await realpath(workspaceRoot);
    repositoryRoot = await realpath(path.join(resolvedWorkspace, repository));
  } catch {
    throw new Error(`${repository} is not an available direct child of B10X_SOURCE_WORKSPACE`);
  }
  if (path.dirname(repositoryRoot) !== resolvedWorkspace) throw new Error(`${repository} escapes the local source workspace`);
  return repositoryRoot;
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

async function runGit(args, options = {}, environment = process.env) {
  return execFile(
    'git',
    [
      '-c', 'credential.helper=',
      '-c', 'credential.interactive=false',
      '-c', 'core.askPass=',
      '-c', 'http.extraHeader=',
      '-c', 'http.proactiveAuth=none',
      ...args,
    ],
    {
      cwd: options.cwd ?? path.parse(process.cwd()).root,
      encoding: options.encoding ?? 'utf8',
      env: credentialFreeGitEnvironment(environment),
      maxBuffer: 128 * 1024 * 1024,
    },
  );
}
