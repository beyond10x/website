import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {collectManifestSources} from '@beyond10x/docs-system/collector';
import {validateManifestExperienceReferences} from '@beyond10x/docs-system/experiences';
import {readExperienceCatalog, readManifest} from '@beyond10x/docs-system/manifest';
import {extractDeclaredSource, isCollectableManifestSchema, readRoster, repositoryUrl, resolveCommit, resolveWorkspaceCommit, sha256, sourceWorkspaceFromEnvironment} from './git-source.mjs';
import {withGenerationLease} from './generation-lease.mjs';

async function updateSourceLock(checkMode) {
const root = path.resolve(import.meta.dirname, '..');
const roster = await readRoster(path.join(root, 'sources.yaml'));
const cacheRoot = path.join(root, '.cache', 'sources');
const sourceWorkspace = sourceWorkspaceFromEnvironment();
const experienceCatalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
const sources = [];

for (const repository of roster.repositories) {
  const url = repositoryUrl(repository);
  const commit = sourceWorkspace
    ? await resolveWorkspaceCommit(sourceWorkspace, repository)
    : await resolveCommit(url);
  const extracted = await extractDeclaredSource({repository, url, commit, manifestPath: roster.manifestPath, cacheRoot, sourceWorkspace});
  const manifestBytes = await readFile(extracted.manifestFile);
  const manifest = await readManifest(extracted.manifestFile);
  if (!isCollectableManifestSchema(manifest.schema)) throw new Error(`${repository} must use b10x-docs/v3 or b10x-docs/v4 before it enters the website lock`);
  if (manifest.schema === 'b10x-docs/v4') validateManifestExperienceReferences(manifest, experienceCatalog);
  const index = await collectManifestSources(manifest, extracted.treeRoot);
  sources.push({
    repository,
    url,
    commit,
    manifestPath: roster.manifestPath,
    manifestSha256: sha256(manifestBytes),
    contentSha256: index.contentSha256,
  });
  process.stdout.write(`${repository}\t${commit}\t${index.files.length} source file(s)\n`);
}

const document = `${JSON.stringify({schema: 'b10x-sources/v1', sources}, null, 2)}\n`;
const target = path.join(root, 'sources.lock.json');
if (checkMode) {
  const current = await readFile(target, 'utf8');
  if (current !== document) throw new Error('sources.lock.json is stale; run npm run sources:lock');
} else {
  await writeFile(target, document);
}
}

const checkMode = process.argv.includes('--check');
if (checkMode) {
  await updateSourceLock(true);
} else {
  await withGenerationLease('source lock update', () => updateSourceLock(false));
}
