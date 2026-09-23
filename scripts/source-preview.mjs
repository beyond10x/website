//! Previewing one source repository's working tree inside the portal shell.
//!
//! The portal cannot render one source alone: `sidebar-contract.mjs` refuses a documentation family
//! with no repository and a family projection that does not cover the registry exactly once, and
//! `prepare-site.mjs` builds the registry and every cross-link from the full roster. So the preview
//! renders against the last publication: the live site's `PROVENANCE.json` names the commit and the
//! collection digest of every source it published, and every source except the author's is collected
//! at that commit through the same bounded, credential-free bare-Git-object extraction the source
//! lock uses, then required to reproduce the published collection digest (sha256 of its canonical
//! collection.json; the recorded contentSha256 covers the whole bundle inventory, change records
//! included, so declared paths alone cannot reproduce it). The author's source is the one bundle
//! built from the working tree. The route map for advisory links is the provenance's `routes`.
//!
//! The working tree is read as passive data only: the manifest is parsed, the paths it declares are
//! copied, and the shared collector validates them. Nothing in the source repository is imported or
//! executed, no repository sidebar is loaded, and Git is asked only for object names and file lists,
//! never for anything that would run a filter, hook, or fsmonitor.
import {createHash, randomUUID} from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {collectManifestSources} from '@beyond10x/docs-system/collector';
import {validateManifestExperienceReferences} from '@beyond10x/docs-system/experiences';
import {readExperienceCatalog, readManifest} from '@beyond10x/docs-system/manifest';
import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {mdxFromMarkdown} from 'mdast-util-mdx';
import {gfm} from 'micromark-extension-gfm';
import {mdxjs} from 'micromark-extension-mdxjs';
import {parseFragment} from 'parse5';
import {canonicalJson, sha256} from './artifact-contract.mjs';
import {
  credentialFreeGitEnvironment,
  declaredAnchors,
  extractDeclaredSource,
  isCollectableManifestSchema,
  readRoster,
  repositoryUrl,
  safeTreePath,
} from './git-source.mjs';
import {canonicalSectionUrl} from './link-rewriting.mjs';
import {compareUtf8} from './order-contract.mjs';
import {loadPublicationInputs, SOURCE_SET_ENVIRONMENT, validateBundleInput} from './publication-inputs.mjs';
import {portalRefusals} from './source-preview-checks.mjs';

const execFile = promisify(execFileCallback);
const hex40 = /^(?!0{40}$)[0-9a-f]{40}$/;
const hex64 = /^[0-9a-f]{64}$/;
const artifactDigestPattern = /^sha256:[0-9a-f]{64}$/;

export const PUBLICATION_ORIGIN = 'https://beyond10x.github.io';
export const SNAPSHOT_FILES = Object.freeze(['PROVENANCE.json', 'changes.json', 'ecosystem.json', 'release-facts.json']);
const bootstrapNames = ['changes.json', 'ecosystem.json', 'release-facts.json'];
const snapshotHint = '--snapshot <dir> naming a directory with a built site\'s PROVENANCE.json, changes.json, ecosystem.json and release-facts.json';

export const SOURCE_PREVIEW_GUARANTEE = [
  'Pages of this repository are rendered from its working tree, uncommitted edits included, by the',
  "portal's own preparation. Every other source is collected at the commit the last publication",
  'recorded, and the roster and route map are that publication\'s, cached locally; links into other',
  'sources are checked against that roster and route map only and are advisory: they never fail this',
  'command. It exits non-zero only when this repository fails per-source validation (exit 1), or when',
  'the preview cannot be built or served at all (exit 2); Ctrl-C before the server is up exits 130.',
].join(' ');

/** The source under preview is itself invalid: the one verdict on content that fails the command. */
export class SourceValidationError extends Error {
  constructor(repository, message, options) {
    super(message, options);
    this.name = 'SourceValidationError';
    this.repository = repository;
  }
}

/** The preview cannot be built or served: snapshot, network, Website code, port. Not a verdict on the source. */
export class PreviewEnvironmentError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PreviewEnvironmentError';
  }
}

/** The author stopped the command (SIGINT/SIGTERM) before the preview server existed. */
export class PreviewInterruptedError extends Error {
  constructor(message = 'interrupted before the preview server started') {
    super(message);
    this.name = 'PreviewInterruptedError';
  }
}

/** Snapshot request deadlines: the whole live fetch, and the longest silence between two chunks. */
export const SNAPSHOT_FETCH_TOTAL_MS = 12_000;
export const SNAPSHOT_FETCH_IDLE_MS = 5_000;

function abortedBy(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  });
}

/** Settle with `promise`, or reject as soon as any of `signals` aborts — even if `promise` ignores it. */
function untilAborted(promise, signals) {
  const active = signals.filter(Boolean);
  if (active.length === 0) return promise;
  return Promise.race([promise, abortedBy(AbortSignal.any(active))]);
}

async function fetchBytes(fetchImpl, url, {deadline, idleMs, signal}) {
  const idle = new AbortController();
  let timer;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(new Error(`${url} sent nothing for ${idleMs} ms`)), idleMs);
  };
  const signals = [deadline, idle.signal, signal];
  const combined = AbortSignal.any(signals.filter(Boolean));
  arm();
  try {
    const response = await untilAborted(fetchImpl(url, {redirect: 'error', credentials: 'omit', signal: combined}), signals);
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks = [];
    try {
      for (;;) {
        const {done, value} = await untilAborted(reader.read(), signals);
        if (done) break;
        chunks.push(value);
        arm();
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

export function sourcePreviewCacheRoot(websiteRoot) {
  return path.join(websiteRoot, '.cache', 'source-preview');
}

/**
 * Names the cache root in place of the checkout's `.cache/source-preview`; an absolute directory.
 * The named directory is never the preview's own: everything the preview writes or deletes lies in
 * its one subdirectory, `ownedCacheDirectory(cacheRoot)`.
 */
export const SOURCE_PREVIEW_CACHE_ENVIRONMENT = 'B10X_PREVIEW_SOURCE_CACHE';
export const OWNED_CACHE_NAME = 'b10x-source-preview';

export function ownedCacheDirectory(cacheRoot) {
  return path.join(cacheRoot, OWNED_CACHE_NAME);
}

/**
 * Refuses `directory` when it exists and is not a real directory — a symbolic link or anything
 * else — so that nothing is created or deleted through it. Missing is fine: it is created as a real
 * directory.
 */
export async function assertRealDirectory(directory) {
  let details;
  try {
    details = await lstat(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw new PreviewEnvironmentError(`cannot inspect ${directory}: ${messageOf(error)}`, {cause: error});
  }
  if (details.isDirectory()) return;
  const kind = details.isSymbolicLink() ? 'a symbolic link' : 'not a directory';
  throw new PreviewEnvironmentError(`${directory} is ${kind}; the source preview creates and deletes only inside a real directory it owns, so it deleted nothing`);
}

export function sourcePreviewCacheDirectory(websiteRoot, environment = process.env) {
  const value = environment[SOURCE_PREVIEW_CACHE_ENVIRONMENT];
  if (value === undefined || value === '') return sourcePreviewCacheRoot(websiteRoot);
  if (!path.isAbsolute(value)) {
    throw new PreviewEnvironmentError(`${SOURCE_PREVIEW_CACHE_ENVIRONMENT} must be an absolute directory, not ${value}`);
  }
  return value;
}

export function stagingDirectory(cacheRoot) {
  return path.join(cacheRoot, `staging-${randomUUID()}`);
}

/**
 * The last publication: `--snapshot <dir>` when given, otherwise the live site fetched without
 * credentials and cached; a cached copy is used, with a warning, only when the live fetch fails.
 */
export async function obtainSnapshot({
  override,
  cacheDirectory,
  roster,
  fetchImpl = globalThis.fetch,
  origin = PUBLICATION_ORIGIN,
  signal,
  totalMs = SNAPSHOT_FETCH_TOTAL_MS,
  idleMs = SNAPSHOT_FETCH_IDLE_MS,
}) {
  if (override !== undefined) {
    return {snapshot: await loadSnapshot(path.resolve(override), roster), origin: 'override'};
  }
  let liveFailure;
  await assertRealDirectory(path.dirname(cacheDirectory));
  const temporary = `${cacheDirectory}.fetch-${randomUUID()}`;
  const deadline = AbortSignal.timeout(totalMs);
  try {
    await mkdir(temporary, {recursive: true});
    for (const name of SNAPSHOT_FILES) {
      const url = `${origin}/${name}`;
      await writeFile(path.join(temporary, name), await fetchBytes(fetchImpl, url, {deadline, idleMs, signal}));
    }
    await loadSnapshot(temporary, roster);
    await rm(cacheDirectory, {recursive: true, force: true});
    await mkdir(path.dirname(cacheDirectory), {recursive: true});
    await rename(temporary, cacheDirectory);
    return {snapshot: await loadSnapshot(cacheDirectory, roster), origin: 'live'};
  } catch (error) {
    liveFailure = deadline.aborted ? `no complete answer within ${totalMs} ms` : messageOf(error);
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
  if (signal?.aborted) throw new PreviewInterruptedError('interrupted while fetching the publication snapshot');
  let cached;
  try {
    cached = await loadSnapshot(cacheDirectory, roster);
  } catch (error) {
    throw new PreviewEnvironmentError(
      `could not fetch the live publication from ${origin} (${liveFailure}) and the cached snapshot at ${cacheDirectory} is unusable (${messageOf(error)}); pass ${snapshotHint}`,
    );
  }
  return {
    snapshot: cached,
    origin: 'cache',
    warning: `warning: could not fetch the live publication from ${origin} (${liveFailure}); using the cached snapshot at ${cacheDirectory}`,
  };
}

export async function loadSnapshot(directory, roster) {
  const files = {};
  for (const name of SNAPSHOT_FILES) {
    const file = path.join(directory, name);
    const details = await lstat(file).catch(() => undefined);
    if (!details?.isFile()) {
      throw new PreviewEnvironmentError(`${directory} is not a publication snapshot: ${name} is missing or not a regular file; pass ${snapshotHint}`);
    }
    files[name] = await readFile(file);
  }
  let provenance;
  try {
    provenance = JSON.parse(files['PROVENANCE.json']);
  } catch (error) {
    throw new PreviewEnvironmentError(`${directory}/PROVENANCE.json is not JSON: ${messageOf(error)}`);
  }
  const invalid = (reason) => new PreviewEnvironmentError(`${directory}/PROVENANCE.json ${reason}`);
  // v3 is the provenance of a quarantining source set: `quarantinedSources` plus the recorded
  // sources are the roster, and the preview carries the quarantine forward.
  if (!['b10x-website-provenance/v2', 'b10x-website-provenance/v3'].includes(provenance?.schema)) {
    throw invalid('is not b10x-website-provenance/v2 or v3');
  }
  const quarantined = provenance.schema === 'b10x-website-provenance/v3' ? provenance.quarantinedSources : [];
  if (!Array.isArray(quarantined) || quarantined.some((entry) => typeof entry?.repository !== 'string')) {
    throw invalid('carries no valid quarantinedSources');
  }
  if (!hex40.test(provenance.websiteCommit ?? '') || !hex40.test(provenance.atlasControlCommit ?? '')) {
    throw invalid('has an invalid websiteCommit or atlasControlCommit');
  }
  const commits = provenance.sourceCommits;
  const bundles = provenance.sourceBundles;
  if (!commits || typeof commits !== 'object' || !bundles || typeof bundles !== 'object') {
    throw invalid('carries no sourceCommits or sourceBundles');
  }
  const recorded = Object.keys(commits).sort(compareUtf8);
  const recordedRoster = [...recorded, ...quarantined.map((entry) => entry.repository)].sort(compareUtf8);
  if (recordedRoster.join('\n') !== [...roster].join('\n') || Object.keys(bundles).sort(compareUtf8).join('\n') !== recorded.join('\n')) {
    throw invalid(`records roster ${recordedRoster.join(', ')}, but sources.yaml is ${roster.join(', ')}`);
  }
  for (const repository of recorded) {
    const bundle = bundles[repository];
    if (!hex40.test(commits[repository] ?? '')
      || bundle?.commit !== commits[repository]
      || !hex64.test(bundle.manifestSha256 ?? '')
      || !hex64.test(bundle.collectionSha256 ?? '')
      || !Number.isSafeInteger(bundle.producerRunId)
      || bundle.producerRunId < 1) {
      throw invalid(`has an invalid source record for ${repository}`);
    }
  }
  if (!Array.isArray(provenance.routes) || provenance.routes.some((route) => typeof route !== 'string' || !route.startsWith('/'))) {
    throw invalid('carries no valid routes');
  }
  if (!Array.isArray(provenance.files)) throw invalid('carries no file inventory');
  for (const name of bootstrapNames) {
    const entry = provenance.files.find((file) => file?.path === name);
    if (!entry || entry.sha256 !== sha256(files[name])) {
      throw new PreviewEnvironmentError(`${directory}/${name} does not match the digest its publication provenance records`);
    }
  }
  return {
    directory,
    provenance,
    bootstrap: Object.fromEntries(bootstrapNames.map((name) => [name, files[name]])),
  };
}

export function snapshotRouteMap(snapshot) {
  return new Set(snapshot.provenance.routes);
}

export function websiteRevisionWarning(publishedCommit, headCommit) {
  if (publishedCommit === headCommit) return undefined;
  return `warning: the snapshot was published by Website ${publishedCommit.slice(0, 12)}, but this Website worktree is at ${headCommit ? headCommit.slice(0, 12) : 'an unknown revision'}; pages render with this worktree's code`;
}

export function serveExitCode({status, signal}) {
  if (signal) return 0;
  throw new PreviewEnvironmentError(
    `preview server stopped (exit ${status}) without being interrupted; the port may be in use or Docusaurus failed to start (see its output above)`,
  );
}

export function preparationError({repository, status, websiteCommit, headCommit}) {
  const cause = websiteCommit === headCommit
    ? `likely cause: the snapshot — this worktree is the Website revision that published it, and ${repository} passed per-source validation, so the preparation output above names the input it refused`
    : `likely cause: Website code — this worktree is at ${headCommit ? headCommit.slice(0, 12) : 'an unknown revision'}, but the snapshot was published by ${websiteCommit.slice(0, 12)}`;
  return new PreviewEnvironmentError(`portal preparation failed (exit ${status}) after ${repository} passed per-source validation; ${cause}`);
}

export async function stageSourceWorkingTree({sourceDirectory, websiteRoot, stagingRoot}) {
  const repositoryRoot = await sourceRepositoryRoot(sourceDirectory);
  const roster = await readRoster(path.join(websiteRoot, 'sources.yaml'));
  const fallbackName = path.basename(repositoryRoot);
  const fail = (repository, message, cause) => new SourceValidationError(repository, message, cause ? {cause} : undefined);

  const manifestSource = path.join(repositoryRoot, ...roster.manifestPath.split('/'));
  const manifestDetails = await lstat(manifestSource).catch(() => undefined);
  if (!manifestDetails?.isFile()) {
    throw fail(fallbackName, `${roster.manifestPath} is missing or is not a regular file at ${repositoryRoot}`);
  }
  const manifestBytes = await readFile(manifestSource);
  const treeRoot = path.join(stagingRoot, 'tree');
  await assertRealDirectory(path.dirname(stagingRoot));
  await rm(stagingRoot, {recursive: true, force: true});
  await mkdir(treeRoot, {recursive: true});
  const manifestFile = path.join(treeRoot, ...roster.manifestPath.split('/'));
  await mkdir(path.dirname(manifestFile), {recursive: true});
  await writeFile(manifestFile, manifestBytes);

  let manifest;
  try {
    manifest = await readManifest(manifestFile);
  } catch (error) {
    throw fail(fallbackName, `${roster.manifestPath} is invalid: ${messageOf(error)}`, error);
  }
  const repository = typeof manifest?.repository?.id === 'string' ? manifest.repository.id : fallbackName;
  if (!isCollectableManifestSchema(manifest.schema)) {
    throw fail(repository, `${roster.manifestPath} is ${manifest.schema}, not b10x-docs/v3 or b10x-docs/v4`);
  }
  if (!roster.repositories.includes(repository)) {
    throw fail(repository, `${repository} is not on the Website source roster (sources.yaml)`);
  }
  if (manifest.repository.url !== repositoryUrl(repository)) {
    throw fail(repository, `${roster.manifestPath} repository url must be ${repositoryUrl(repository)}`);
  }

  const commit = await headCommit(repositoryRoot);
  let anchors;
  try {
    anchors = declaredAnchors(manifest);
    for (const surface of manifest.surfaces) {
      await mkdir(path.join(treeRoot, ...safeTreePath(surface.source.root).split('/')), {recursive: true});
    }
  } catch (error) {
    throw fail(repository, messageOf(error), error);
  }

  const committed = await committedBlobs(repositoryRoot, commit);
  const objectFormat = await gitText(repositoryRoot, ['rev-parse', '--show-object-format']).catch(() => 'sha1');
  let dirty = false;
  for (const relative of await workingTreeFiles(repositoryRoot)) {
    if (relative === roster.manifestPath) {
      if (committed.get(relative) !== gitBlobId(manifestBytes, objectFormat)) dirty = true;
      continue;
    }
    if (!anchors.some((anchor) => anchor === '.' || relative === anchor || relative.startsWith(`${anchor}/`))) continue;
    const linked = await symbolicLinkOnPath(repositoryRoot, relative);
    if (linked) {
      throw fail(repository, `selected source ${relative} is reached through symbolic link ${linked}`);
    }
    const absolute = path.join(repositoryRoot, ...relative.split('/'));
    const details = await lstat(absolute).catch(() => undefined);
    if (!details) {
      if (committed.has(relative)) dirty = true;
      continue;
    }
    if (details.isDirectory()) throw fail(repository, `selected source ${relative} is a submodule`);
    if (!details.isFile()) continue;
    const bytes = await readFile(absolute);
    if (committed.get(relative) !== gitBlobId(bytes, objectFormat)) dirty = true;
    const destination = path.join(treeRoot, ...relative.split('/'));
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, bytes, {mode: 0o644});
  }

  let index;
  try {
    if (manifest.schema === 'b10x-docs/v4') {
      validateManifestExperienceReferences(
        manifest,
        await readExperienceCatalog(path.join(websiteRoot, 'data', 'experiences.json')),
      );
    }
    index = await collectManifestSources(manifest, treeRoot);
  } catch (error) {
    throw fail(repository, messageOf(error), error);
  }
  const refusals = await portalRefusals({manifest, index, treeRoot});
  if (refusals.length > 0) {
    throw fail(repository, `the portal would refuse ${refusals.length === 1 ? 'this' : `these ${refusals.length}`}:\n  ${refusals.join('\n  ')}`);
  }
  return {
    repository,
    repositoryRoot,
    commit,
    treeState: dirty ? 'dirty' : 'clean',
    manifest,
    manifestBytes,
    manifestPath: roster.manifestPath,
    treeRoot,
    index,
    roster: roster.repositories,
  };
}

/**
 * Every source but the one under preview, at the commit the publication recorded, collected through
 * the bounded bare-Git-object extraction and required to reproduce the published manifest and
 * collection digests. `sourceWorkspace` is the same local-origin override the source lock accepts.
 */
export async function collectSnapshotSources({
  snapshot,
  exclude,
  cacheRoot,
  sourceWorkspace,
  manifestPath = 'b10x.docs.yaml',
  concurrency = 6,
  signal,
  graceMs = 5_000,
}) {
  const repositories = Object.keys(snapshot.provenance.sourceCommits).sort(compareUtf8).filter((repository) => repository !== exclude);
  const collected = new Array(repositories.length);
  let next = 0;
  const worker = async () => {
    while (next < repositories.length && !signal?.aborted) {
      const position = next;
      next += 1;
      collected[position] = await collectSnapshotSource({
        repository: repositories[position],
        record: snapshot.provenance.sourceBundles[repositories[position]],
        cacheRoot,
        sourceWorkspace,
        manifestPath,
      });
    }
  };
  const workers = Promise.all(Array.from({length: Math.min(concurrency, repositories.length)}, worker));
  try {
    await untilAborted(workers, [signal]);
  } catch (error) {
    if (!signal?.aborted) throw error;
    // No new extraction starts once aborted. An extraction already running owns a bare object
    // store under the generation lease; give it a bounded moment to finish before the lease goes.
    await Promise.race([workers.catch(() => {}), new Promise((resolve) => setTimeout(resolve, graceMs).unref())]);
    throw new PreviewInterruptedError('interrupted while collecting the snapshot sources');
  }
  if (signal?.aborted) throw new PreviewInterruptedError('interrupted while collecting the snapshot sources');
  return collected;
}

async function collectSnapshotSource({repository, record, cacheRoot, sourceWorkspace, manifestPath}) {
  const label = `${repository}@${record.commit.slice(0, 12)}`;
  let extracted;
  try {
    extracted = await extractDeclaredSource({
      repository,
      url: repositoryUrl(repository),
      commit: record.commit,
      manifestPath,
      cacheRoot,
      sourceWorkspace,
    });
  } catch (error) {
    throw new PreviewEnvironmentError(`cannot collect snapshot source ${label} from ${sourceWorkspace ?? repositoryUrl(repository)}: ${messageOf(error)}`, {cause: error});
  }
  const manifestBytes = await readFile(extracted.manifestFile);
  if (sha256(manifestBytes) !== record.manifestSha256) {
    throw new PreviewEnvironmentError(`snapshot source ${label} does not reproduce its published manifest digest`);
  }
  let index;
  try {
    index = await collectManifestSources(await readManifest(extracted.manifestFile), extracted.treeRoot);
  } catch (error) {
    throw new PreviewEnvironmentError(`snapshot source ${label} no longer collects with this Website: ${messageOf(error)}`, {cause: error});
  }
  if (sha256(Buffer.from(canonicalJson(index))) !== record.collectionSha256) {
    throw new PreviewEnvironmentError(`snapshot source ${label} does not reproduce its published collection digest`);
  }
  return {
    repository,
    commit: record.commit,
    record,
    manifestBytes,
    treeRoot: extracted.treeRoot,
    index,
  };
}

export async function writePreviewInputs({websiteRoot, snapshot, source, others, outputRoot}) {
  const {provenance} = snapshot;
  await assertRealDirectory(path.dirname(outputRoot));
  await rm(outputRoot, {recursive: true, force: true});
  await mkdir(path.join(outputRoot, 'sources'), {recursive: true});
  await mkdir(path.join(outputRoot, 'bootstrap'), {recursive: true});

  const entries = new Map();
  for (const other of others) {
    const {bundleSha256} = await writeBundle({outputRoot, source: other, producerRunId: other.record.producerRunId});
    const record = other.record;
    entries.set(other.repository, {
      repository: other.repository,
      url: repositoryUrl(other.repository),
      commit: other.commit,
      producerRunId: record.producerRunId,
      producerRunAttempt: positiveInteger(record.producerRunAttempt) ?? 1,
      artifactId: positiveInteger(record.artifactId) ?? 1,
      artifactDigest: artifactDigestPattern.test(record.artifactDigest ?? '') ? record.artifactDigest : `sha256:${bundleSha256}`,
      bundleSha256,
    });
  }
  const authored = await writeBundle({outputRoot, source, producerRunId: 1});
  try {
    await validateBundleInput(authored.bundleRoot, {repository: source.repository, bundleSha256: authored.bundleSha256});
  } catch (error) {
    throw new SourceValidationError(source.repository, `preview bundle fails bundle validation: ${messageOf(error)}`, {cause: error});
  }
  entries.set(source.repository, {
    repository: source.repository,
    url: repositoryUrl(source.repository),
    commit: source.commit,
    producerRunId: 1,
    producerRunAttempt: 1,
    artifactId: 1,
    artifactDigest: `sha256:${authored.bundleSha256}`,
    bundleSha256: authored.bundleSha256,
  });

  // The source under preview is published from its working tree even when the snapshot had
  // quarantined it; every other quarantined source stays quarantined.
  const quarantined = (provenance.quarantinedSources ?? [])
    .filter((entry) => entry.repository !== source.repository)
    .map((entry) => ({repository: entry.repository, check: entry.check, message: entry.message}));
  const roster = [...new Set([...Object.keys(provenance.sourceCommits), source.repository])].sort(compareUtf8);
  const missing = roster.filter((repository) => !entries.has(repository));
  if (missing.length > 0) throw new PreviewEnvironmentError(`preview inputs lack snapshot sources ${missing.join(', ')}`);
  const sourceSet = {
    schema: quarantined.length > 0 ? 'b10x-docs-source-set/v2' : 'b10x-docs-source-set/v1',
    atlasControlCommit: provenance.atlasControlCommit,
    websiteRuntimeCommit: provenance.websiteCommit,
    sources: roster.map((repository) => entries.get(repository)),
    ...(quarantined.length > 0 ? {quarantined} : {}),
  };
  const sourceSetBytes = Buffer.from(`${JSON.stringify(sourceSet)}\n`);
  const sourceSetPath = path.join(outputRoot, 'source-set.json');
  await writeFile(sourceSetPath, sourceSetBytes);

  for (const name of bootstrapNames) {
    await writeFile(path.join(outputRoot, 'bootstrap', name), snapshot.bootstrap[name]);
  }
  await writeFile(path.join(outputRoot, 'bootstrap', 'metadata.json'), canonicalJson({
    schema: 'b10x-bootstrap-snapshot/v2',
    sourceRepository: 'https://github.com/beyond10x/atlas',
    sourceRevision: provenance.atlasControlCommit,
    websiteRevision: provenance.websiteCommit,
    sourceSetSha256: sha256(sourceSetBytes),
    capturedAt: new Date().toISOString(),
    files: Object.fromEntries(bootstrapNames.map((name) => [name, sha256(snapshot.bootstrap[name])])),
  }));

  try {
    await loadPublicationInputs({root: websiteRoot, environment: {[SOURCE_SET_ENVIRONMENT]: sourceSetPath}});
  } catch (error) {
    throw new PreviewEnvironmentError(`preview inputs built from the snapshot fail publication-input validation: ${messageOf(error)}`, {cause: error});
  }
  return {sourceSetPath};
}

async function writeBundle({outputRoot, source, producerRunId}) {
  const bundleRoot = path.join(outputRoot, 'sources', source.repository);
  const bundleTree = path.join(bundleRoot, 'tree');
  await mkdir(bundleTree, {recursive: true});
  const selected = [...new Set(source.index.files.map((file) => file.sourcePath))].sort(compareUtf8);
  const files = [];
  for (const relative of selected) {
    const destination = path.join(bundleTree, ...relative.split('/'));
    await mkdir(path.dirname(destination), {recursive: true});
    await copyFile(path.join(source.treeRoot, ...relative.split('/')), destination);
    const bytes = await readFile(destination);
    files.push({path: relative, sha256: sha256(bytes), size: bytes.byteLength});
  }
  const collectionBytes = Buffer.from(canonicalJson(source.index));
  const bundle = {
    schema: 'b10x-docs-bundle/v1',
    repository: {id: source.repository, url: repositoryUrl(source.repository)},
    commit: source.commit,
    producer: {runId: producerRunId},
    manifestSha256: sha256(source.manifestBytes),
    collectionSha256: sha256(collectionBytes),
    contentSha256: sha256(Buffer.from(JSON.stringify(files))),
    files,
  };
  const bundleBytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  await Promise.all([
    writeFile(path.join(bundleRoot, 'b10x.docs.yaml'), source.manifestBytes),
    writeFile(path.join(bundleRoot, 'collection.json'), collectionBytes),
    writeFile(path.join(bundleRoot, 'bundle.json'), bundleBytes),
  ]);
  return {bundleRoot, bundleSha256: sha256(bundleBytes)};
}

const ownedPrefixes = new Set(['docs', 'api', 'ecosystem', 'source-assets']);

/**
 * Every link in the previewed documents that lands in another roster repository, in document order,
 * found by the Markdown parser the portal's own toolchain uses: inline and reference links, images,
 * definitions, autolinks, GFM literal URLs, raw HTML and MDX JSX `href`/`src`. Code is never a link.
 * Relative links stay inside the source and are left to the shared rewriting; Website-owned routes
 * are not another source's.
 */
export function crossSourceLinks({repository, roster, documents}) {
  const known = new Set(roster);
  const links = [];
  for (const document of documents) {
    for (const destination of linkDestinations(document)) {
      const sitePath = renderedSitePath(repository, destination);
      if (!sitePath) continue;
      const segments = sitePath.split('/').filter(Boolean);
      const target = ownedPrefixes.has(segments[0]) && known.has(segments[1])
        ? segments[1]
        : known.has(segments[0]) ? segments[0] : undefined;
      if (!target || target === repository) continue;
      links.push({document: document.sourcePath, destination, target, path: sitePath});
    }
  }
  return links;
}

export function adviseCrossSourceLinks(links, routes) {
  return links.map((link) => ({...link, status: routes.has(link.path) ? 'resolves' : 'absent'}));
}

export async function previewDocuments(source) {
  const documents = [];
  for (const file of source.index.files) {
    if (file.kind !== 'document' && file.kind !== 'blog') continue;
    documents.push({
      sourcePath: file.sourcePath,
      text: await readFile(path.join(source.treeRoot, ...file.sourcePath.split('/')), 'utf8'),
    });
  }
  return documents;
}

function linkDestinations({sourcePath, text}) {
  const body = withoutFrontmatter(text);
  let tree;
  if (/\.mdx$/i.test(sourcePath ?? '')) {
    try {
      tree = fromMarkdown(body, {extensions: [gfm(), mdxjs()], mdastExtensions: [gfmFromMarkdown(), mdxFromMarkdown()]});
    } catch {}
  }
  tree ??= fromMarkdown(body, {extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()]});
  const found = [];
  const visit = (node) => {
    const offset = node.position?.start?.offset ?? 0;
    if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && typeof node.url === 'string') {
      found.push({offset, destination: node.url});
    } else if (node.type === 'html' && typeof node.value === 'string') {
      for (const destination of htmlDestinations(node.value)) found.push({offset, destination});
    } else if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && Array.isArray(node.attributes)) {
      for (const attribute of node.attributes) {
        if (attribute.type === 'mdxJsxAttribute' && ['href', 'src'].includes(attribute.name) && typeof attribute.value === 'string') {
          found.push({offset, destination: attribute.value});
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return found
    .map((entry, order) => ({...entry, order}))
    .sort((left, right) => left.offset - right.offset || left.order - right.order)
    .map((entry) => entry.destination);
}

function htmlDestinations(html) {
  const destinations = [];
  const visit = (node) => {
    for (const attribute of node.attrs ?? []) {
      if (attribute.name === 'href' || attribute.name === 'src') destinations.push(attribute.value);
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parseFragment(html));
  return destinations;
}

function withoutFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? `${'\n'.repeat(match[0].split('\n').length - 1)}${text.slice(match[0].length)}` : text;
}

function renderedSitePath(repository, destination) {
  let pathname;
  if (destination === PUBLICATION_ORIGIN || destination.startsWith(`${PUBLICATION_ORIGIN}/`)) {
    try {
      pathname = new URL(destination).pathname;
    } catch {
      return undefined;
    }
  } else if (destination.startsWith('/') && !destination.startsWith('//')) {
    pathname = canonicalSectionUrl(repository, destination.split(/[?#]/)[0]);
    if (!pathname.startsWith('/')) return undefined;
  } else {
    return undefined;
  }
  let decoded;
  try {
    decoded = decodeURI(pathname);
  } catch {
    decoded = pathname;
  }
  const last = decoded.split('/').at(-1);
  return decoded.endsWith('/') || last.includes('.') ? decoded : `${decoded}/`;
}

/** The first path component, from the repository root down, that is a symbolic link; undefined if none. */
async function symbolicLinkOnPath(repositoryRoot, relative) {
  const segments = relative.split('/');
  let current = repositoryRoot;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const details = await lstat(current).catch(() => undefined);
    if (!details) return undefined;
    if (details.isSymbolicLink()) return segments.slice(0, index + 1).join('/');
  }
  return undefined;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

async function sourceRepositoryRoot(sourceDirectory) {
  const directory = path.resolve(sourceDirectory ?? process.cwd());
  let top;
  try {
    top = await gitText(directory, ['rev-parse', '--show-toplevel']);
  } catch {
    throw new PreviewEnvironmentError(`${directory} is not inside a Git checkout of a source repository`);
  }
  return realpath(top);
}

async function headCommit(repositoryRoot) {
  try {
    const commit = await gitText(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
    if (hex40.test(commit)) return commit;
  } catch {}
  throw new PreviewEnvironmentError(`${repositoryRoot} has no HEAD commit to attribute the preview to`);
}

async function committedBlobs(repositoryRoot, commit) {
  const output = await gitBuffer(repositoryRoot, ['ls-tree', '-rz', '--full-tree', commit]);
  const blobs = new Map();
  for (const line of output.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/.exec(line);
    if (match) blobs.set(match[2], match[1]);
  }
  return blobs;
}

async function workingTreeFiles(repositoryRoot) {
  const output = await gitBuffer(repositoryRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const paths = new Set();
  for (const entry of output.toString('utf8').split('\0').filter(Boolean)) paths.add(safeTreePath(entry));
  return [...paths].sort(compareUtf8);
}

function gitBlobId(bytes, objectFormat) {
  const algorithm = objectFormat === 'sha256' ? 'sha256' : 'sha1';
  return createHash(algorithm).update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

async function gitText(cwd, args) {
  return (await gitBuffer(cwd, args)).toString('utf8').trim();
}

async function gitBuffer(cwd, args) {
  const {stdout} = await execFile('git', [
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    '-C', cwd,
    ...args,
  ], {
    encoding: 'buffer',
    env: {...credentialFreeGitEnvironment(process.env), GIT_OPTIONAL_LOCKS: '0'},
    maxBuffer: 128 * 1024 * 1024,
  });
  return stdout;
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
