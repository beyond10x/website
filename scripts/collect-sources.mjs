import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {collectManifestSources, verifyCollectionLock} from '@beyond10x/docs-system/collector';
import {buildRegistry, readManifest, readSourceLock} from '@beyond10x/docs-system/manifest';
import {extractDeclaredSource, readRoster, repositoryUrl, sha256} from './git-source.mjs';

export async function collectSources({root, outputRoot}) {
  const roster = await readRoster(path.join(root, 'sources.yaml'));
  const lockFile = path.join(root, 'sources.lock.json');
  const lock = await readSourceLock(lockFile);
  const lockNames = lock.sources.map((source) => source.repository);
  if (lockNames.join('\n') !== roster.repositories.join('\n')) {
    throw new Error('sources.lock.json must contain the sorted public source roster exactly once');
  }
  const cacheRoot = path.join(root, '.cache', 'sources');
  const indexRoot = path.join(cacheRoot, 'indexes');
  const collectionRoot = path.join(outputRoot, 'collection');
  await Promise.all([mkdir(collectionRoot, {recursive: true}), mkdir(indexRoot, {recursive: true})]);
  const manifests = [];
  const indexes = [];

  for (const source of lock.sources) {
    if (source.url !== repositoryUrl(source.repository) || source.manifestPath !== roster.manifestPath) {
      throw new Error(`${source.repository} source-lock identity does not match sources.yaml`);
    }
    const extracted = await extractDeclaredSource({...source, cacheRoot});
    const manifestBytes = await readFile(extracted.manifestFile);
    const actualManifestSha = sha256(manifestBytes);
    if (actualManifestSha !== source.manifestSha256 || extracted.manifestSha256 !== source.manifestSha256) {
      throw new Error(`${source.repository} manifest digest drift: locked ${source.manifestSha256}, fetched ${actualManifestSha}`);
    }
    const manifest = await readManifest(extracted.manifestFile);
    if (manifest.schema !== 'b10x-docs/v3') throw new Error(`${source.repository} source manifest is not v3`);
    const index = await collectManifestSources(manifest, extracted.treeRoot, {outputRoot: collectionRoot});
    verifyCollectionLock(lock, index, {commit: source.commit, manifestSha256: actualManifestSha});
    await writeFile(
      path.join(indexRoot, `${source.repository}-${source.commit}.json`),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    manifests.push(manifest);
    indexes.push(index);
  }

  const websiteManifest = await readManifest(path.join(root, 'b10x.docs.yaml'));
  if (websiteManifest.schema !== 'b10x-docs/v3' || websiteManifest.repository.id !== 'website') {
    throw new Error('the Website root manifest must be b10x-docs/v3 with repository id website');
  }
  const registryManifests = [websiteManifest, ...manifests];
  return {lock, manifests: registryManifests, indexes, registry: buildRegistry(registryManifests), collectionRoot};
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const root = path.resolve(import.meta.dirname, '..');
  const outputRoot = path.join(root, '.generated');
  const result = await collectSources({root, outputRoot});
  process.stdout.write(`collected ${result.indexes.reduce((count, index) => count + index.files.length, 0)} files from ${result.indexes.length} locked repositories\n`);
}
