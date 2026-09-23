import {cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parse, stringify} from 'yaml';
import {canonicalJson, sha256} from '../../scripts/artifact-contract.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const atlasControlCommit = '2'.repeat(40);
const websiteRuntimeCommit = '3'.repeat(40);

// One source per documentation family, each its family's start repository, plus a second Services
// source so that quarantining it leaves every family populated. `harness` links into `eventlog` in
// every form a source writes.
export const FIXTURE_SOURCES = Object.freeze([
  {
    repository: 'agent-platform',
    displayName: 'Agent Platform',
    group: 'Services',
    relationships: [
      {kind: 'uses', label: 'Reads the event log', target: 'eventlog/docs'},
      {kind: 'uses', label: 'Runs the agent loop', target: 'harness/docs'},
    ],
  },
  {repository: 'agentic-principles', displayName: 'Agentic Principles', group: 'Foundation'},
  {repository: 'devcenter', displayName: 'Devcenter', group: 'Products'},
  {repository: 'eventlog', displayName: 'Eventlog', group: 'Services'},
  {
    repository: 'harness',
    displayName: 'Harness',
    group: 'Build',
    body: [
      '# Harness',
      '',
      'Clone-free documentation input.',
      '',
      '- [Eventlog guide](https://beyond10x.github.io/docs/eventlog/guide/#events)',
      '- [Eventlog profile](/ecosystem/eventlog/)',
      '- [Eventlog API][eventlog-api]',
      '- <a href="https://beyond10x.github.io/docs/eventlog/">Eventlog home</a>',
      '- [Agent Platform guide](https://beyond10x.github.io/docs/agent-platform/guide/)',
      '',
      '[eventlog-api]: https://beyond10x.github.io/api/eventlog/',
      '',
    ].join('\n'),
    sections: [
      {label: 'Eventlog companion', url: 'https://beyond10x.github.io/docs/eventlog/'},
    ],
  },
]);

/**
 * A copy of this Website — its scripts and data, never its generated output — with a five-source
 * roster and normalized publication inputs, so `prepare-site.mjs` can run against a source set
 * that quarantines some of those sources. `quarantined` omitted writes the v1 source set.
 */
export async function quarantineFixture(context, {quarantined, sources = FIXTURE_SOURCES} = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'b10x-quarantine-'));
  context.after(() => rm(temporary, {recursive: true, force: true}));
  const websiteRoot = path.join(temporary, 'website');
  const inputsRoot = path.join(temporary, 'inputs');
  await mkdir(path.join(websiteRoot, 'src'), {recursive: true});
  await Promise.all([
    cp(path.join(projectRoot, 'scripts'), path.join(websiteRoot, 'scripts'), {recursive: true}),
    cp(path.join(projectRoot, 'data'), path.join(websiteRoot, 'data'), {recursive: true}),
    cp(path.join(projectRoot, 'src', 'quarantine-routes.mjs'), path.join(websiteRoot, 'src', 'quarantine-routes.mjs')),
    cp(path.join(projectRoot, 'legacy-routes.json'), path.join(websiteRoot, 'legacy-routes.json')),
    cp(path.join(projectRoot, 'package.json'), path.join(websiteRoot, 'package.json')),
    symlink(path.join(projectRoot, 'node_modules'), path.join(websiteRoot, 'node_modules'), 'dir'),
  ]);
  const websiteManifest = parse(await readFile(path.join(projectRoot, 'b10x.docs.yaml'), 'utf8'));
  for (const surface of websiteManifest.surfaces) delete surface.relationships;
  await writeFile(path.join(websiteRoot, 'b10x.docs.yaml'), stringify(websiteManifest));
  await writeFile(path.join(websiteRoot, 'sources.yaml'), [
    'schema: b10x-website-sources/v1',
    'organization: beyond10x',
    'manifestPath: b10x.docs.yaml',
    'compatibilityRepositories:',
    '  - getting-started',
    'repositories:',
    ...sources.map((source) => `  - ${source.repository}`),
    '',
  ].join('\n'));

  const quarantinedNames = new Set((quarantined ?? []).map((entry) => entry.repository));
  await mkdir(path.join(inputsRoot, 'sources'), {recursive: true});
  await mkdir(path.join(inputsRoot, 'bootstrap'), {recursive: true});
  const entries = [];
  for (const [index, source] of sources.entries()) {
    if (quarantinedNames.has(source.repository)) continue;
    entries.push(await writeBundle(inputsRoot, source, index));
  }
  const sourceSet = quarantined === undefined
    ? {schema: 'b10x-docs-source-set/v1', atlasControlCommit, websiteRuntimeCommit, sources: entries}
    : {schema: 'b10x-docs-source-set/v2', atlasControlCommit, websiteRuntimeCommit, sources: entries, quarantined};
  const sourceSetBytes = Buffer.from(`${JSON.stringify(sourceSet)}\n`);
  const sourceSetPath = path.join(inputsRoot, 'source-set.json');
  await writeFile(sourceSetPath, sourceSetBytes);

  const release = (repository, version, publishedAt) => ({
    repository,
    version,
    publishedAt,
    url: `https://github.com/beyond10x/${repository}/releases/tag/${version}`,
  });
  const change = (repository, version, publishedAt) => ({
    key: `${repository}/${version}`,
    id: `${repository}/${version}`,
    repository,
    publishedAt,
    title: `${repository} ${version}`,
    summary: `${repository} released version ${version}.`,
    kind: 'release',
    impact: 'notable',
    source: {url: `https://github.com/beyond10x/${repository}/releases/tag/${version}`, version},
    journeys: ['operate-services'],
    affectedSurfaces: [`${repository}/docs`],
    automatic: true,
    channel: 'releases',
  });
  const bootstrapDocuments = {
    'changes.json': Buffer.from(canonicalJson({
      schema: 'b10x-change-ledger/v1',
      changes: [change('eventlog', '0.2.0', '2026-09-20T00:00:00Z'), change('harness', '0.1.0', '2026-09-19T00:00:00Z')],
    })),
    'ecosystem.json': Buffer.from(canonicalJson({schema: 'b10x-docs-registry/v2', surfaces: []})),
    'release-facts.json': Buffer.from(canonicalJson({
      schema: 'b10x-release-facts/v1',
      releases: [release('eventlog', '0.2.0', '2026-09-20T00:00:00Z'), release('harness', '0.1.0', '2026-09-19T00:00:00Z')],
    })),
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
    capturedAt: '2026-09-23T08:00:00Z',
    files: Object.fromEntries(Object.entries(bootstrapDocuments).map(([name, bytes]) => [name, sha256(bytes)])),
  }));
  return {temporary, websiteRoot, inputsRoot, sourceSetPath, sourceSet, sourceSetBytes};
}

async function writeBundle(inputsRoot, source, index) {
  const {repository, displayName, group} = source;
  const repositoryUrl = `https://github.com/beyond10x/${repository}`;
  const bundleRoot = path.join(inputsRoot, 'sources', repository);
  const treeRoot = path.join(bundleRoot, 'tree');
  await mkdir(path.join(treeRoot, 'docs'), {recursive: true});
  const manifest = [
    'schema: b10x-docs/v3',
    'repository:',
    `  id: ${repository}`,
    `  url: ${repositoryUrl}`,
    `  displayName: ${displayName}`,
    'delivery:',
    '  publisher: website',
    '  repository: beyond10x.github.io',
    '  origin: https://beyond10x.github.io',
    'surfaces:',
    '  - id: docs',
    `    name: ${displayName}`,
    `    summary: ${displayName} documentation.`,
    '    kind: reference',
    `    canonicalUrl: https://beyond10x.github.io/docs/${repository}/`,
    '    maturity: development',
    '    availability: published',
    '    discoverability: public',
    '    audiences: [developer]',
    '    primaryJourney: build-agents',
    '    journeys: [build-agents]',
    '    capabilities: [documentation]',
    '    adoption:',
    `      label: Read ${displayName} documentation`,
    `      url: https://beyond10x.github.io/docs/${repository}/`,
    '      mode: source-build',
    '      estimatedMinutes: 1',
    '      prerequisites: [Node.js]',
    `      outcome: Understand ${displayName}.`,
    '    sections:',
    `      - {label: Documentation, url: https://beyond10x.github.io/docs/${repository}/, kind: docs}`,
    ...(source.sections ?? []).map((section) => `      - {label: ${section.label}, url: ${section.url}, kind: docs}`),
    ...(source.relationships ? ['    relationships:', ...source.relationships.map((relation) => `      - {kind: ${relation.kind}, label: ${relation.label}, target: ${relation.target}}`)] : []),
    `    routeBase: /docs/${repository}/`,
    '    source:',
    '      root: .',
    '      documents:',
    '        include: [docs/guide.md]',
    `      navigation: {sidebar: flat, group: ${group}, label: ${displayName}, order: ${index}}`,
    '',
  ].join('\n');
  const documentBytes = Buffer.from(source.body ?? `# ${displayName}\n\n## Events\n\n${displayName} documentation input.\n`);
  await Promise.all([
    writeFile(path.join(bundleRoot, 'b10x.docs.yaml'), manifest),
    writeFile(path.join(treeRoot, 'docs', 'guide.md'), documentBytes),
  ]);
  const collectionFiles = [{
    repository,
    surface: 'docs',
    kind: 'document',
    sourcePath: 'docs/guide.md',
    outputPath: `${repository}/docs/document/docs/guide.md`,
    sha256: sha256(documentBytes),
    size: documentBytes.byteLength,
  }];
  const collection = {
    schema: 'b10x-docs-collection/v1',
    repository: {id: repository, url: repositoryUrl, displayName},
    files: collectionFiles,
    contentSha256: sha256(Buffer.from(JSON.stringify(collectionFiles))),
  };
  const collectionBytes = Buffer.from(canonicalJson(collection));
  await writeFile(path.join(bundleRoot, 'collection.json'), collectionBytes);
  const files = [{path: 'docs/guide.md', sha256: sha256(documentBytes), size: documentBytes.byteLength}];
  const commit = (index + 1).toString(16).padStart(40, 'a');
  const bundle = {
    schema: 'b10x-docs-bundle/v1',
    repository: {id: repository, url: repositoryUrl},
    commit,
    producer: {runId: 41},
    manifestSha256: sha256(Buffer.from(manifest)),
    collectionSha256: sha256(collectionBytes),
    contentSha256: sha256(Buffer.from(JSON.stringify(files))),
    files,
  };
  const bundleBytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  await writeFile(path.join(bundleRoot, 'bundle.json'), bundleBytes);
  return {
    repository,
    url: repositoryUrl,
    commit,
    producerRunId: 41,
    producerRunAttempt: 1,
    artifactId: 42,
    artifactDigest: `sha256:${'4'.repeat(64)}`,
    bundleSha256: sha256(bundleBytes),
  };
}
