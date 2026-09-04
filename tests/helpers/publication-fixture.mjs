import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parse, stringify} from 'yaml';
import {canonicalJson, sha256} from '../../scripts/artifact-contract.mjs';

const repository = 'harness';
const repositoryUrl = `https://github.com/beyond10x/${repository}`;

export async function publicationFixture(context, {artifactProducer = false} = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'b10x-publication-inputs-'));
  context.after(() => rm(temporary, {recursive: true, force: true}));
  const websiteRoot = path.join(temporary, 'website');
  const inputsRoot = path.join(temporary, 'inputs');
  const bundleRoot = path.join(inputsRoot, 'sources', repository);
  const treeRoot = path.join(bundleRoot, 'tree');
  await mkdir(websiteRoot, {recursive: true});
  await mkdir(path.join(treeRoot, 'docs'), {recursive: true});
  await mkdir(path.join(treeRoot, 'changes'), {recursive: true});
  await mkdir(path.join(inputsRoot, 'bootstrap'), {recursive: true});

  await writeFile(path.join(websiteRoot, 'sources.yaml'), [
    'schema: b10x-website-sources/v1',
    'organization: beyond10x',
    'manifestPath: b10x.docs.yaml',
    'compatibilityRepositories:',
    '  - getting-started',
    'repositories:',
    `  - ${repository}`,
    '',
  ].join('\n'));
  const repositoryManifest = [
    'schema: b10x-docs/v3',
    'repository:',
    `  id: ${repository}`,
    `  url: ${repositoryUrl}`,
    '  displayName: Harness',
    'delivery:',
    '  publisher: website',
    '  repository: beyond10x.github.io',
    '  origin: https://beyond10x.github.io',
    'surfaces:',
    '  - id: docs',
    '    name: Harness',
    '    summary: Harness documentation.',
    '    kind: reference',
    '    canonicalUrl: https://beyond10x.github.io/docs/harness/',
    '    maturity: development',
    '    availability: published',
    '    discoverability: public',
    '    audiences: [developer]',
    '    primaryJourney: build-agents',
    '    journeys: [build-agents]',
    '    capabilities: [documentation]',
    '    adoption:',
    '      label: Read Harness documentation',
    '      url: https://beyond10x.github.io/docs/harness/',
    '      mode: source-build',
    '      estimatedMinutes: 1',
    '      prerequisites: [Node.js]',
    '      outcome: Understand Harness.',
    '    sections:',
    '      - {label: Documentation, url: https://beyond10x.github.io/docs/harness/, kind: docs}',
    '    routeBase: /docs/harness/',
    '    source:',
    '      root: .',
    '      documents:',
    '        include: [docs/guide.md]',
    '      navigation: {sidebar: flat}',
    '',
  ].join('\n');
  const documentBytes = Buffer.from('# Harness\n\nClone-free documentation input.\n');
  const changeBytes = Buffer.from('schema: b10x-change/v1\n');
  await Promise.all([
    writeFile(path.join(bundleRoot, 'b10x.docs.yaml'), repositoryManifest),
    writeFile(path.join(treeRoot, 'docs', 'guide.md'), documentBytes),
    writeFile(path.join(treeRoot, 'changes', 'release.yaml'), changeBytes),
  ]);

  const collectionFiles = [{
    repository,
    surface: 'docs',
    kind: 'document',
    sourcePath: 'docs/guide.md',
    outputPath: 'harness/docs/document/docs/guide.md',
    sha256: sha256(documentBytes),
    size: documentBytes.byteLength,
  }];
  const collection = {
    schema: 'b10x-docs-collection/v1',
    repository: {id: repository, url: repositoryUrl, displayName: 'Harness'},
    files: collectionFiles,
    contentSha256: sha256(Buffer.from(JSON.stringify(collectionFiles))),
  };
  const collectionBytes = Buffer.from(canonicalJson(collection));
  await writeFile(path.join(bundleRoot, 'collection.json'), collectionBytes);

  const files = [
    {path: 'changes/release.yaml', sha256: sha256(changeBytes), size: changeBytes.byteLength},
    {path: 'docs/guide.md', sha256: sha256(documentBytes), size: documentBytes.byteLength},
  ];
  const commit = '1'.repeat(40);
  const atlasControlCommit = '2'.repeat(40);
  const websiteRuntimeCommit = '3'.repeat(40);
  const producer = artifactProducer
    ? {runId: 41, artifactId: 42, artifactDigest: `sha256:${'4'.repeat(64)}`}
    : {runId: 41};
  const bundle = {
    schema: 'b10x-docs-bundle/v1',
    repository: {id: repository, url: repositoryUrl},
    commit,
    producer,
    manifestSha256: sha256(Buffer.from(repositoryManifest)),
    collectionSha256: sha256(collectionBytes),
    contentSha256: sha256(Buffer.from(JSON.stringify(files))),
    files,
  };
  const bundleBytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  await writeFile(path.join(bundleRoot, 'bundle.json'), bundleBytes);

  const sourceSet = {
    schema: 'b10x-docs-source-set/v1',
    atlasControlCommit,
    websiteRuntimeCommit,
    sources: [{
      repository,
      url: repositoryUrl,
      commit,
      producerRunId: 41,
      producerRunAttempt: 2,
      artifactId: 42,
      artifactDigest: `sha256:${'4'.repeat(64)}`,
      bundleSha256: sha256(bundleBytes),
    }],
  };
  const sourceSetBytes = Buffer.from(`${JSON.stringify(sourceSet)}\n`);
  await writeFile(path.join(inputsRoot, 'source-set.json'), sourceSetBytes);

  const bootstrapDocuments = {
    'changes.json': Buffer.from(canonicalJson({schema: 'b10x-change-ledger/v1', changes: []})),
    'ecosystem.json': Buffer.from(canonicalJson({schema: 'b10x-docs-registry/v2', surfaces: []})),
    'release-facts.json': Buffer.from(canonicalJson({schema: 'b10x-release-facts/v1', releases: []})),
  };
  await Promise.all(Object.entries(bootstrapDocuments).map(([name, bytes]) => (
    writeFile(path.join(inputsRoot, 'bootstrap', name), bytes)
  )));
  await writeFile(path.join(inputsRoot, 'bootstrap', 'metadata.json'), canonicalJson({
    schema: 'b10x-bootstrap-snapshot/v2',
    sourceRepository: 'https://github.com/beyond10x/atlas',
    sourceRevision: atlasControlCommit,
    websiteRevision: websiteRuntimeCommit,
    sourceSetSha256: sha256(sourceSetBytes),
    capturedAt: '2026-09-04T08:00:00Z',
    files: Object.fromEntries(Object.entries(bootstrapDocuments).map(([name, bytes]) => [name, sha256(bytes)])),
  }));

  const projectRoot = path.resolve(import.meta.dirname, '../..');
  await mkdir(path.join(websiteRoot, 'data'), {recursive: true});
  const websiteManifest = parse(await readFile(path.join(projectRoot, 'b10x.docs.yaml'), 'utf8'));
  for (const surface of websiteManifest.surfaces) delete surface.relationships;
  await Promise.all([
    writeFile(path.join(websiteRoot, 'b10x.docs.yaml'), stringify(websiteManifest)),
    cp(path.join(projectRoot, 'data', 'experiences.json'), path.join(websiteRoot, 'data', 'experiences.json')),
  ]);
  return {
    temporary,
    websiteRoot,
    inputsRoot,
    bundleRoot,
    treeRoot,
    sourceSet,
    sourceSetBytes,
    bundle,
    bundleBytes,
    collection,
    commit,
    atlasControlCommit,
    websiteRuntimeCommit,
  };
}
