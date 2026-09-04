import {lstat, readFile, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import bundleSchema from '@beyond10x/docs-system/schema/bundle/v1' with {type: 'json'};
import {parse} from 'yaml';
import {canonicalJson, sha256} from './artifact-contract.mjs';
import {assertPortableRelativePath, compareUtf8} from './order-contract.mjs';
import {validateSourceLockDocument} from './source-lock-contract.mjs';

export const SOURCE_SET_SCHEMA = 'b10x-docs-source-set/v1';
export const SOURCE_SET_ENVIRONMENT = 'B10X_DOCS_SOURCE_SET';

const hex40 = /^(?!0{40}$)[0-9a-f]{40}$/;
const hex64 = /^[0-9a-f]{64}$/;
const artifactDigest = /^sha256:[0-9a-f]{64}$/;
const repositoryPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ajv = new Ajv2020({allErrors: true, strict: true});
addFormats(ajv);
const validateBundleSchema = ajv.compile(bundleSchema);

export async function loadPublicationInputs({
  root,
  environment = process.env,
  allowBootstrap = false,
} = {}) {
  if (!root) throw new Error('publication inputs require the Website root');
  const roster = parse(await readFile(path.join(root, 'sources.yaml'), 'utf8'));
  const sourceSetValue = environment[SOURCE_SET_ENVIRONMENT];
  if (sourceSetValue === undefined || sourceSetValue === '') {
    const sourceLockPath = path.join(root, 'sources.lock.json');
    const sourceLockBytes = await readFile(sourceLockPath);
    const lock = JSON.parse(sourceLockBytes);
    const validated = validateSourceLockDocument(roster, lock, {allowBootstrap});
    return {
      mode: 'legacy',
      roster: validated.roster,
      lock: validated.lock,
      bootstrap: validated.bootstrap,
      sourceLockBytes,
      inputSchema: 'b10x-sources/v1',
      inputSha256: sha256(sourceLockBytes),
      bootstrapRoot: path.join(root, 'data', 'bootstrap'),
      sourceSet: undefined,
      sourceSetBytes: undefined,
      sourceSetSha256: undefined,
      inputsRoot: undefined,
      bundles: new Map(),
    };
  }
  if (allowBootstrap) throw new Error(`${SOURCE_SET_ENVIRONMENT} cannot be combined with the local bootstrap fixture`);
  if (environment.B10X_SOURCE_WORKSPACE) {
    throw new Error(`${SOURCE_SET_ENVIRONMENT} cannot be combined with B10X_SOURCE_WORKSPACE`);
  }
  if (typeof sourceSetValue !== 'string' || sourceSetValue.includes('\0') || !path.isAbsolute(sourceSetValue)) {
    throw new Error(`${SOURCE_SET_ENVIRONMENT} must be an absolute source-set.json path`);
  }
  const requestedSourceSet = path.resolve(sourceSetValue);
  const requestedDetails = await lstat(requestedSourceSet).catch(() => undefined);
  if (!requestedDetails || !requestedDetails.isFile() || requestedDetails.isSymbolicLink()) {
    throw new Error('source-set.json must be a regular non-symbolic file');
  }
  const sourceSetPath = await realpath(requestedSourceSet);
  if (path.basename(sourceSetPath) !== 'source-set.json') {
    throw new Error(`${SOURCE_SET_ENVIRONMENT} must name source-set.json`);
  }
  const inputsRoot = await realpath(path.dirname(sourceSetPath));
  await validateInputDirectories(inputsRoot, roster.repositories);
  const sourceSetBytes = await readFile(sourceSetPath);
  const sourceSet = JSON.parse(sourceSetBytes);
  if (sourceSetBytes.toString('utf8') !== canonicalSourceSetJson(sourceSet)) {
    throw new Error('source-set.json must be canonical JSON');
  }
  validateSourceSetDocument(sourceSet, roster);

  const bundles = new Map();
  const lockSources = [];
  for (const entry of sourceSet.sources) {
    const bundleRoot = path.join(inputsRoot, 'sources', entry.repository);
    const bundle = await validateBundleInput(bundleRoot, {
      repository: entry.repository,
      bundleSha256: entry.bundleSha256,
    });
    if (bundle.document.repository.url !== entry.url
      || bundle.document.commit !== entry.commit
      || bundle.document.producer.runId !== entry.producerRunId
      || (bundle.document.producer.artifactId !== undefined
        && bundle.document.producer.artifactId !== entry.artifactId)
      || (bundle.document.producer.artifactDigest !== undefined
        && bundle.document.producer.artifactDigest !== entry.artifactDigest)) {
      throw new Error(`${entry.repository} source-set provenance disagrees with bundle.json`);
    }
    bundles.set(entry.repository, bundle);
    lockSources.push({
      repository: entry.repository,
      url: bundle.document.repository.url,
      commit: bundle.document.commit,
      manifestPath: 'b10x.docs.yaml',
      manifestSha256: bundle.document.manifestSha256,
      contentSha256: bundle.collection.contentSha256,
    });
  }
  const lock = {schema: 'b10x-sources/v1', sources: lockSources};
  const validated = validateSourceLockDocument(roster, lock);
  const sourceLockBytes = Buffer.from(canonicalJson(lock));
  return {
    mode: 'source-set',
    roster: validated.roster,
    lock: validated.lock,
    bootstrap: false,
    sourceLockBytes,
    inputSchema: SOURCE_SET_SCHEMA,
    inputSha256: sha256(sourceSetBytes),
    bootstrapRoot: path.join(inputsRoot, 'bootstrap'),
    sourceSet,
    sourceSetBytes,
    sourceSetSha256: sha256(sourceSetBytes),
    inputsRoot,
    bundles,
  };
}

async function validateInputDirectories(inputsRoot, repositories) {
  const inputs = await readdir(inputsRoot, {withFileTypes: true});
  const inputNames = inputs.map((entry) => entry.name).sort(compareUtf8);
  const expectedInputs = ['bootstrap', 'source-set.json', 'sources'].sort(compareUtf8);
  if (inputNames.join('\n') !== expectedInputs.join('\n')) {
    throw new Error('publication inputs must contain exactly bootstrap, source-set.json, and sources');
  }
  for (const entry of inputs) {
    if (entry.isSymbolicLink()) throw new Error(`publication inputs contain symbolic link ${entry.name}`);
    if (entry.name === 'source-set.json' ? !entry.isFile() : !entry.isDirectory()) {
      throw new Error(`publication inputs contain invalid ${entry.name} entry type`);
    }
  }
  const sourceEntries = await readdir(path.join(inputsRoot, 'sources'), {withFileTypes: true});
  const sourceNames = sourceEntries.map((entry) => entry.name).sort(compareUtf8);
  if (sourceNames.join('\n') !== repositories.join('\n')) {
    throw new Error('publication source bundles must contain the exact source roster');
  }
  for (const entry of sourceEntries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`publication source bundle ${entry.name} must be a real directory`);
    }
  }
  const bootstrapEntries = await readdir(path.join(inputsRoot, 'bootstrap'), {withFileTypes: true});
  const bootstrapNames = bootstrapEntries.map((entry) => entry.name).sort(compareUtf8);
  const expectedBootstrap = ['changes.json', 'ecosystem.json', 'metadata.json', 'release-facts.json'].sort(compareUtf8);
  if (bootstrapNames.join('\n') !== expectedBootstrap.join('\n')) {
    throw new Error('publication bootstrap must contain exactly its three snapshots and metadata.json');
  }
  for (const entry of bootstrapEntries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`publication bootstrap ${entry.name} must be a regular non-symbolic file`);
    }
  }
}

export function validateSourceSetDocument(document, roster) {
  assertExactKeys(document, ['schema', 'atlasControlCommit', 'websiteRuntimeCommit', 'sources'], 'source set');
  if (document.schema !== SOURCE_SET_SCHEMA
    || !hex40.test(document.websiteRuntimeCommit ?? '')
    || !hex40.test(document.atlasControlCommit ?? '')
    || !Array.isArray(document.sources)) {
    throw new Error(`source-set.json is not ${SOURCE_SET_SCHEMA}`);
  }
  const expected = roster?.repositories;
  const actual = document.sources.map((entry) => entry?.repository);
  if (!Array.isArray(expected)
    || actual.length !== expected.length
    || actual.join('\n') !== expected.join('\n')) {
    throw new Error(`source set must contain the exact sorted ${expected?.length ?? 0}-repository roster`);
  }
  for (const entry of document.sources) {
    assertExactKeys(entry, [
      'repository', 'url', 'commit', 'producerRunId', 'producerRunAttempt',
      'artifactId', 'artifactDigest', 'bundleSha256',
    ], `source-set entry ${entry?.repository ?? '<unknown>'}`);
    if (!repositoryPattern.test(entry.repository ?? '')
      || entry.url !== `https://github.com/beyond10x/${entry.repository}`
      || !hex40.test(entry.commit ?? '')
      || !Number.isSafeInteger(entry.producerRunId)
      || entry.producerRunId < 1
      || !Number.isSafeInteger(entry.producerRunAttempt)
      || entry.producerRunAttempt < 1
      || !Number.isSafeInteger(entry.artifactId)
      || entry.artifactId < 1
      || !artifactDigest.test(entry.artifactDigest ?? '')
      || !hex64.test(entry.bundleSha256 ?? '')) {
      throw new Error(`source set contains an invalid bundle reference for ${entry?.repository ?? '<unknown>'}`);
    }
  }
  return document;
}

export async function validateBundleInput(bundleRoot, expected) {
  const resolvedRoot = await realpath(bundleRoot).catch(() => undefined);
  if (!resolvedRoot || resolvedRoot !== path.resolve(bundleRoot)) {
    throw new Error(`${expected.repository} bundle root is missing or resolves outside its fixed source-set path`);
  }
  const rootDetails = await lstat(resolvedRoot);
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) {
    throw new Error(`${expected.repository} bundle root must be a real directory`);
  }
  const entries = await readdir(resolvedRoot, {withFileTypes: true});
  const names = entries.map((entry) => entry.name).sort(compareUtf8);
  if (names.join('\n') !== ['b10x.docs.yaml', 'bundle.json', 'collection.json', 'tree'].sort(compareUtf8).join('\n')) {
    throw new Error(`${expected.repository} bundle must contain exactly bundle.json, b10x.docs.yaml, collection.json, and tree`);
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`${expected.repository} bundle contains symbolic link ${entry.name}`);
    if (entry.name === 'tree' ? !entry.isDirectory() : !entry.isFile()) {
      throw new Error(`${expected.repository} bundle has an invalid ${entry.name} entry type`);
    }
  }

  const bundlePath = path.join(resolvedRoot, 'bundle.json');
  const bundleBytes = await readFile(bundlePath);
  const document = JSON.parse(bundleBytes);
  if (bundleBytes.toString('utf8') !== canonicalBundleJson(document)) {
    throw new Error(`${expected.repository} bundle.json must be canonical JSON`);
  }
  validateBundleDocument(document, expected.repository);
  if (sha256(bundleBytes) !== expected.bundleSha256) {
    throw new Error(`${expected.repository} bundle digest does not match its source-set reference`);
  }

  const manifestFile = path.join(resolvedRoot, 'b10x.docs.yaml');
  const collectionFile = path.join(resolvedRoot, 'collection.json');
  const treeRoot = path.join(resolvedRoot, 'tree');
  const [manifestBytes, collectionBytes] = await Promise.all([readFile(manifestFile), readFile(collectionFile)]);
  if (sha256(manifestBytes) !== document.manifestSha256) {
    throw new Error(`${expected.repository} manifest digest disagrees with bundle.json`);
  }
  if (sha256(collectionBytes) !== document.collectionSha256) {
    throw new Error(`${expected.repository} collection digest disagrees with bundle.json`);
  }
  const manifest = parse(manifestBytes.toString('utf8'));
  const collection = JSON.parse(collectionBytes);
  if (!manifest
    || !['b10x-docs/v3', 'b10x-docs/v4'].includes(manifest.schema)
    || manifest.repository?.id !== expected.repository
    || manifest.repository?.url !== document.repository.url) {
    throw new Error(`${expected.repository} b10x.docs.yaml has an invalid or inconsistent repository identity`);
  }
  assertExactKeys(collection, ['schema', 'repository', 'files', 'contentSha256'], `${expected.repository} collection`);
  assertExactKeys(collection.repository, ['id', 'url', 'displayName'], `${expected.repository} collection repository`);
  if (collection?.schema !== 'b10x-docs-collection/v1'
    || collection.repository?.id !== expected.repository
    || collection.repository?.url !== document.repository.url
    || typeof collection.repository?.displayName !== 'string'
    || collection.repository.displayName.trim() === ''
    || !hex64.test(collection.contentSha256 ?? '')
    || !Array.isArray(collection.files)) {
    throw new Error(`${expected.repository} collection identity or content digest disagrees with bundle.json`);
  }
  if (sha256(Buffer.from(JSON.stringify(document.files))) !== document.contentSha256) {
    throw new Error(`${expected.repository} bundle content digest disagrees with its file inventory`);
  }

  const treeFiles = await walkRegularFiles(treeRoot, treeRoot, `${expected.repository} bundle tree`);
  const actualFiles = [];
  for (const file of treeFiles) {
    const bytes = await readFile(file.absolute);
    actualFiles.push({path: file.relative, sha256: sha256(bytes), size: bytes.byteLength});
  }
  actualFiles.sort((left, right) => compareUtf8(left.path, right.path));
  if (canonicalJson(actualFiles) !== canonicalJson(document.files)) {
    throw new Error(`${expected.repository} tree bytes disagree with bundle.json file inventory`);
  }
  const selectedFiles = new Map();
  const outputs = new Set();
  const routes = new Set();
  const digestEntries = [];
  for (const file of collection.files) {
    const exactFileKeys = [
      'repository', 'surface', 'kind', 'sourcePath', 'outputPath', 'sha256', 'size',
      ...(file?.specificationId === undefined ? [] : ['specificationId']),
      ...(file?.route === undefined ? [] : ['route']),
    ];
    assertExactKeys(file, exactFileKeys, `${expected.repository} collection source`);
    if (file?.repository !== expected.repository
      || typeof file.surface !== 'string'
      || file.surface.trim() === ''
      || !['document', 'data', 'blog', 'asset', 'openapi', 'json-schema'].includes(file.kind)
      || typeof file.sourcePath !== 'string'
      || typeof file.outputPath !== 'string'
      || !hex64.test(file.sha256 ?? '')
      || !Number.isSafeInteger(file.size)
      || file.size < 0
      || (file.specificationId !== undefined
        && (typeof file.specificationId !== 'string' || file.specificationId.trim() === ''))) {
      throw new Error(`${expected.repository} collection contains an invalid source entry`);
    }
    assertPortableRelativePath(file.sourcePath, `${expected.repository} collection source path`);
    assertPortableRelativePath(file.outputPath, `${expected.repository} collection output path`);
    if (outputs.has(file.outputPath)) throw new Error(`${expected.repository} collection repeats output ${file.outputPath}`);
    outputs.add(file.outputPath);
    if (file.route !== undefined) {
      if (typeof file.route !== 'string'
        || !file.route.startsWith('/')
        || file.route.includes('\\')
        || routes.has(file.route)) {
        throw new Error(`${expected.repository} collection has an invalid or duplicate route`);
      }
      routes.add(file.route);
    }
    digestEntries.push({
      repository: file.repository,
      surface: file.surface,
      kind: file.kind,
      sourcePath: file.sourcePath,
      outputPath: file.outputPath,
      sha256: file.sha256,
      size: file.size,
      ...(file.specificationId ? {specificationId: file.specificationId} : {}),
      ...(file.route ? {route: file.route} : {}),
    });
    const previous = selectedFiles.get(file.sourcePath);
    const value = {path: file.sourcePath, sha256: file.sha256, size: file.size};
    if (/^changes\/(?:[^/]+\/)*[^/]+\.yaml$/.test(file.sourcePath)) {
      throw new Error(`${expected.repository} collection source ${file.sourcePath} overlaps a change input`);
    }
    if (previous && canonicalJson(previous) !== canonicalJson(value)) {
      throw new Error(`${expected.repository} collection repeats ${file.sourcePath} with different bytes`);
    }
    selectedFiles.set(file.sourcePath, value);
  }
  if (sha256(Buffer.from(JSON.stringify(digestEntries))) !== collection.contentSha256) {
    throw new Error(`${expected.repository} collection content digest is invalid`);
  }
  const bundleFileByPath = new Map(document.files.map((file) => [file.path, file]));
  for (const selected of selectedFiles.values()) {
    if (canonicalJson(bundleFileByPath.get(selected.path)) !== canonicalJson(selected)) {
      throw new Error(`${expected.repository} collection source ${selected.path} disagrees with bundle.json`);
    }
  }
  for (const file of document.files) {
    if (selectedFiles.has(file.path)) continue;
    if (!/^changes\/(?:[^/]+\/)*[^/]+\.yaml$/.test(file.path)) {
      throw new Error(`${expected.repository} bundle contains undeclared non-change input ${file.path}`);
    }
    const change = parse(await readFile(path.join(treeRoot, ...file.path.split('/')), 'utf8'));
    if (!['b10x-change/v1', 'b10x-change/v2'].includes(change?.schema)) {
      throw new Error(`${expected.repository} change input ${file.path} has an unsupported schema`);
    }
  }
  return {root: resolvedRoot, document, bundleBytes, manifestFile, collectionFile, collection, treeRoot};
}

function validateBundleDocument(document, repository) {
  if (!validateBundleSchema(document)) {
    const problems = validateBundleSchema.errors
      ?.map((error) => `${error.instancePath || '/'} ${error.message}`)
      .join('; ');
    throw new Error(`${repository} bundle.json violates the exported Docs System bundle schema: ${problems}`);
  }
  assertExactKeys(
    document,
    ['schema', 'repository', 'commit', 'producer', 'manifestSha256', 'collectionSha256', 'contentSha256', 'files'],
    `${repository} bundle.json`,
  );
  if (document.schema !== 'b10x-docs-bundle/v1'
    || document.repository?.id !== repository
    || document.repository?.url !== `https://github.com/beyond10x/${repository}`
    || !hex40.test(document.commit ?? '')
    || !hex64.test(document.manifestSha256 ?? '')
    || !hex64.test(document.collectionSha256 ?? '')
    || !hex64.test(document.contentSha256 ?? '')
    || !Array.isArray(document.files)) {
    throw new Error(`${repository} bundle.json has an invalid identity or digest`);
  }
  assertExactKeys(document.repository, ['id', 'url'], `${repository} bundle repository`);
  const producerKeys = document.producer && typeof document.producer === 'object'
    ? Object.keys(document.producer).sort(compareUtf8)
    : [];
  const minimalProducer = ['runId'].sort(compareUtf8).join('\n');
  const artifactProducer = ['runId', 'artifactId', 'artifactDigest'].sort(compareUtf8).join('\n');
  if ((producerKeys.join('\n') !== minimalProducer && producerKeys.join('\n') !== artifactProducer)
    || !Number.isSafeInteger(document.producer?.runId)
    || document.producer.runId < 1
    || (producerKeys.length === 3 && (
      !Number.isSafeInteger(document.producer.artifactId)
      || document.producer.artifactId < 1
      || !artifactDigest.test(document.producer.artifactDigest ?? '')
    ))) {
    throw new Error(`${repository} bundle has invalid producer provenance`);
  }
  let previous;
  const paths = new Set();
  for (const file of document.files) {
    assertExactKeys(file, ['path', 'sha256', 'size'], `${repository} bundle file`);
    assertPortableRelativePath(file.path, `${repository} bundle file path`);
    if (!hex64.test(file.sha256 ?? '') || !Number.isSafeInteger(file.size) || file.size < 0) {
      throw new Error(`${repository} bundle contains an invalid file record`);
    }
    if (paths.has(file.path) || (previous !== undefined && compareUtf8(previous, file.path) >= 0)) {
      throw new Error(`${repository} bundle file inventory must be unique and sorted by UTF-8 bytes`);
    }
    paths.add(file.path);
    previous = file.path;
  }
}

async function walkRegularFiles(root, directory, label) {
  const files = [];
  const entries = await readdir(directory, {withFileTypes: true});
  entries.sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    assertPortableRelativePath(relative, label);
    const details = await lstat(absolute);
    if (details.isSymbolicLink()) throw new Error(`${label} contains symbolic link ${relative}`);
    if (details.isDirectory()) files.push(...await walkRegularFiles(root, absolute, label));
    else if (details.isFile()) files.push({absolute, relative});
    else throw new Error(`${label} contains non-regular entry ${relative}`);
  }
  return files;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort(compareUtf8);
  const wanted = [...expected].sort(compareUtf8);
  if (actual.join('\n') !== wanted.join('\n')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function canonicalSourceSetJson(document) {
  return `${JSON.stringify({
    schema: document.schema,
    atlasControlCommit: document.atlasControlCommit,
    websiteRuntimeCommit: document.websiteRuntimeCommit,
    sources: Array.isArray(document.sources) ? document.sources.map((entry) => ({
      repository: entry.repository,
      url: entry.url,
      commit: entry.commit,
      producerRunId: entry.producerRunId,
      producerRunAttempt: entry.producerRunAttempt,
      artifactId: entry.artifactId,
      artifactDigest: entry.artifactDigest,
      bundleSha256: entry.bundleSha256,
    })) : document.sources,
  })}\n`;
}

function canonicalBundleJson(document) {
  return `${JSON.stringify({
    schema: document.schema,
    repository: document.repository && {id: document.repository.id, url: document.repository.url},
    commit: document.commit,
    producer: document.producer && {
      runId: document.producer.runId,
      ...(document.producer.artifactId === undefined ? {} : {artifactId: document.producer.artifactId}),
      ...(document.producer.artifactDigest === undefined ? {} : {artifactDigest: document.producer.artifactDigest}),
    },
    manifestSha256: document.manifestSha256,
    collectionSha256: document.collectionSha256,
    contentSha256: document.contentSha256,
    files: Array.isArray(document.files) ? document.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      size: file.size,
    })) : document.files,
  })}\n`;
}
