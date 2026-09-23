import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {collectManifestSources, verifyCollectionLock} from '@beyond10x/docs-system/collector';
import {validateManifestExperienceReferences} from '@beyond10x/docs-system/experiences';
import {buildRegistry, readExperienceCatalog, readManifest} from '@beyond10x/docs-system/manifest';
import {canonicalJson} from './artifact-contract.mjs';
import {extractDeclaredSource, isCollectableManifestSchema, readRoster, repositoryUrl, sha256, sourceWorkspaceFromEnvironment} from './git-source.mjs';
import {withGenerationLease} from './generation-lease.mjs';
import {loadPublicationInputs} from './publication-inputs.mjs';

export async function collectSources({root, outputRoot, inputs, sourceWorkspace = sourceWorkspaceFromEnvironment()}) {
  const roster = await readRoster(path.join(root, 'sources.yaml'));
  const publicationInputs = inputs ?? await loadPublicationInputs({root});
  const lock = publicationInputs.lock;
  const lockNames = lock.sources.map((source) => source.repository);
  // The published roster: sources.yaml less any repository the source set quarantines.
  const published = roster.repositories.filter((repository) => publicationInputs.roster.repositories.includes(repository));
  if (lockNames.join('\n') !== published.join('\n')
    || published.join('\n') !== publicationInputs.roster.repositories.join('\n')) {
    throw new Error('sources.lock.json must contain the sorted public source roster exactly once');
  }
  const cacheRoot = path.join(root, '.cache', 'sources');
  const indexRoot = path.join(cacheRoot, 'indexes');
  const collectionRoot = path.join(outputRoot, 'collection');
  await Promise.all([mkdir(collectionRoot, {recursive: true}), mkdir(indexRoot, {recursive: true})]);
  const manifests = [];
  const indexes = [];
  const experienceCatalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));

  for (const source of lock.sources) {
    if (source.url !== repositoryUrl(source.repository) || source.manifestPath !== roster.manifestPath) {
      throw new Error(`${source.repository} source-lock identity does not match sources.yaml`);
    }
    const bundle = publicationInputs.bundles.get(source.repository);
    const extracted = bundle
      ? {manifestFile: bundle.manifestFile, treeRoot: bundle.treeRoot, manifestSha256: bundle.document.manifestSha256}
      : await extractDeclaredSource({...source, cacheRoot, sourceWorkspace});
    const manifestBytes = await readFile(extracted.manifestFile);
    const actualManifestSha = sha256(manifestBytes);
    if (actualManifestSha !== source.manifestSha256 || extracted.manifestSha256 !== source.manifestSha256) {
      throw new Error(`${source.repository} manifest digest drift: locked ${source.manifestSha256}, fetched ${actualManifestSha}`);
    }
    const manifest = await readManifest(extracted.manifestFile);
    if (!isCollectableManifestSchema(manifest.schema)) throw new Error(`${source.repository} source manifest is not v3, v4 or v5`);
    if (manifest.schema === 'b10x-docs/v4' || manifest.schema === 'b10x-docs/v5') validateManifestExperienceReferences(manifest, experienceCatalog);
    const index = await collectManifestSources(manifest, extracted.treeRoot, {outputRoot: collectionRoot});
    verifyCollectionLock(lock, index, {commit: source.commit, manifestSha256: actualManifestSha});
    if (bundle && canonicalJson(index) !== canonicalJson(bundle.collection)) {
      throw new Error(`${source.repository} collected index disagrees with its normalized bundle`);
    }
    await writeFile(
      path.join(indexRoot, `${source.repository}-${source.commit}.json`),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    manifests.push(manifest);
    indexes.push(index);
  }

  const websiteManifest = await readManifest(path.join(root, 'b10x.docs.yaml'));
  if (websiteManifest.schema !== 'b10x-docs/v4' || websiteManifest.repository.id !== 'website') {
    throw new Error('the Website root manifest must be b10x-docs/v4 with repository id website');
  }
  // A quarantined source has no surface in the registry, and buildRegistry refuses any reference to
  // a surface it does not publish, so every reference to one is dropped here, before it is built.
  const quarantined = new Set((publicationInputs.quarantined ?? []).map((entry) => entry.repository));
  const registryManifests = [websiteManifest, ...manifests].map((manifest) => withoutQuarantinedReferences(manifest, quarantined));
  return {lock, manifests: registryManifests, indexes, registry: buildRegistry(registryManifests), collectionRoot};
}

/**
 * The manifest without the fields that name a surface of a quarantined repository: each surface's
 * `relationships[].target` and a v3 front door's `journeyPaths`. These are every cross-surface
 * reference buildRegistry checks. Nothing quarantined returns the manifest itself.
 */
export function withoutQuarantinedReferences(manifest, quarantined) {
  if (!quarantined?.size) return manifest;
  const kept = (key) => !quarantined.has(String(key).split('/')[0]);
  return {
    ...manifest,
    ...(manifest.journeyPaths ? {
      journeyPaths: Object.fromEntries(Object.entries(manifest.journeyPaths).map(([journey, keys]) => [journey, (keys ?? []).filter(kept)])),
    } : {}),
    surfaces: manifest.surfaces.map((surface) => (surface.relationships
      ? {...surface, relationships: surface.relationships.filter((relation) => kept(relation.target))}
      : surface)),
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const root = path.resolve(import.meta.dirname, '..');
  const outputRoot = path.join(root, '.generated');
  await withGenerationLease('source collection', async () => {
    const inputs = await loadPublicationInputs({root});
    const result = await collectSources({root, outputRoot, inputs});
    process.stdout.write(`collected ${result.indexes.reduce((count, index) => count + index.files.length, 0)} files from ${result.indexes.length} locked repositories\n`);
  });
}
