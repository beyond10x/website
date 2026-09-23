import assert from 'node:assert/strict';
import {cp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {collectSources, withoutQuarantinedReferences} from '../scripts/collect-sources.mjs';
import {loadPublicationInputs} from '../scripts/publication-inputs.mjs';
import {publicationFixture} from './helpers/publication-fixture.mjs';
import {quarantineFixture} from './helpers/quarantine-fixture.mjs';
import {validateBootstrapSnapshots} from '../scripts/bootstrap-contract.mjs';

test('source-set inputs validate a minimal producer and collect without Git', async (context) => {
  const fixture = await publicationFixture(context);
  const environment = {B10X_DOCS_SOURCE_SET: path.join(fixture.inputsRoot, 'source-set.json')};
  const inputs = await loadPublicationInputs({root: fixture.websiteRoot, environment});
  assert.equal(inputs.mode, 'source-set');
  assert.equal(inputs.lock.sources[0].contentSha256, fixture.collection.contentSha256);
  assert.deepEqual(inputs.bundles.get('harness').document.producer, {runId: 41});

  const outputRoot = path.join(fixture.temporary, 'generated');
  const result = await collectSources({
    root: fixture.websiteRoot,
    outputRoot,
    inputs,
    sourceWorkspace: path.join(fixture.temporary, 'must-not-be-used'),
  });
  assert.equal(result.indexes.length, 1);
  assert.equal(
    await readFile(path.join(result.collectionRoot, 'harness', 'docs', 'document', 'docs', 'guide.md'), 'utf8'),
    '# Harness\n\nClone-free documentation input.\n',
  );
});

test('source-set inputs check optional producer artifact identity when the bundle carries it', async (context) => {
  const fixture = await publicationFixture(context, {artifactProducer: true});
  const sourceSetPath = path.join(fixture.inputsRoot, 'source-set.json');
  await assert.doesNotReject(loadPublicationInputs({
    root: fixture.websiteRoot,
    environment: {B10X_DOCS_SOURCE_SET: sourceSetPath},
  }));
  const sourceSet = JSON.parse(await readFile(sourceSetPath, 'utf8'));
  sourceSet.sources[0].artifactId += 1;
  await writeFile(sourceSetPath, `${JSON.stringify(sourceSet)}\n`);
  await assert.rejects(loadPublicationInputs({
    root: fixture.websiteRoot,
    environment: {B10X_DOCS_SOURCE_SET: sourceSetPath},
  }), /source-set provenance disagrees with bundle\.json/);
});

test('source-set inputs reject non-canonical metadata, ambient workspaces, and changed bundle bytes', async (context) => {
  const fixture = await publicationFixture(context);
  const sourceSetPath = path.join(fixture.inputsRoot, 'source-set.json');
  await assert.rejects(loadPublicationInputs({
    root: fixture.websiteRoot,
    environment: {
      B10X_DOCS_SOURCE_SET: sourceSetPath,
      B10X_SOURCE_WORKSPACE: path.join(fixture.temporary, 'workspace'),
    },
  }), /cannot be combined with B10X_SOURCE_WORKSPACE/);

  await writeFile(path.join(fixture.inputsRoot, 'unexpected.txt'), 'not a publication input\n');
  await assert.rejects(loadPublicationInputs({
    root: fixture.websiteRoot,
    environment: {B10X_DOCS_SOURCE_SET: sourceSetPath},
  }), /must contain exactly bootstrap, source-set\.json, and sources/);
  await rm(path.join(fixture.inputsRoot, 'unexpected.txt'));

  await writeFile(path.join(fixture.treeRoot, 'docs', 'guide.md'), 'changed after bundling\n');
  await assert.rejects(loadPublicationInputs({
    root: fixture.websiteRoot,
    environment: {B10X_DOCS_SOURCE_SET: sourceSetPath},
  }), /tree bytes disagree with bundle\.json/);

  await writeFile(path.join(fixture.treeRoot, 'docs', 'guide.md'), '# Harness\n\nClone-free documentation input.\n');
  await writeFile(sourceSetPath, `${JSON.stringify(fixture.sourceSet, null, 2)}\n`);
  await assert.rejects(loadPublicationInputs({
    root: fixture.websiteRoot,
    environment: {B10X_DOCS_SOURCE_SET: sourceSetPath},
  }), /source-set\.json must be canonical JSON/);
});

const quarantinedEventlog = [{repository: 'eventlog', check: 'bundle-schema', message: 'bundle.json violates the exported Docs System bundle schema'}];

async function rewriteSourceSet(fixture, mutate) {
  const document = JSON.parse(await readFile(fixture.sourceSetPath, 'utf8'));
  mutate(document);
  await writeFile(fixture.sourceSetPath, `${JSON.stringify(document)}\n`);
}

function sourceSetEnvironment(fixture) {
  return {B10X_DOCS_SOURCE_SET: fixture.sourceSetPath};
}

test('a v2 source set publishes its sources and names each quarantined repository with its failing check', async (context) => {
  const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
  const inputs = await loadPublicationInputs({root: fixture.websiteRoot, environment: sourceSetEnvironment(fixture)});
  assert.equal(inputs.mode, 'source-set');
  assert.equal(inputs.inputSchema, 'b10x-docs-source-set/v2');
  assert.deepEqual(inputs.roster.repositories, ['agent-platform', 'agentic-principles', 'devcenter', 'harness']);
  assert.deepEqual(inputs.sourceRoster, ['agent-platform', 'agentic-principles', 'devcenter', 'eventlog', 'harness']);
  assert.deepEqual(inputs.quarantined, quarantinedEventlog);
  assert.deepEqual(inputs.lock.sources.map((source) => source.repository), inputs.roster.repositories);
  assert.equal(inputs.bundles.has('eventlog'), false);
});

test('a v1 source set still loads with the whole roster published and nothing quarantined', async (context) => {
  const fixture = await quarantineFixture(context);
  const inputs = await loadPublicationInputs({root: fixture.websiteRoot, environment: sourceSetEnvironment(fixture)});
  assert.equal(inputs.inputSchema, 'b10x-docs-source-set/v1');
  assert.deepEqual(inputs.roster.repositories, inputs.sourceRoster);
  assert.deepEqual(inputs.quarantined, []);
  await rewriteSourceSet(fixture, (document) => { document.quarantined = []; });
  await assert.rejects(
    loadPublicationInputs({root: fixture.websiteRoot, environment: sourceSetEnvironment(fixture)}),
    /source set has unexpected or missing fields/,
  );
});

test('sources plus quarantined must be the exact sorted roster, each repository exactly once', async (context) => {
  const cases = [
    ['a quarantined repository also published', (document) => {
      document.quarantined = [{...quarantinedEventlog[0], repository: 'harness'}];
    }, /exact sorted 5-repository roster/],
    ['a roster repository in neither list', (document) => { document.quarantined = []; }, /exact sorted 5-repository roster/],
    ['a quarantined repository off the roster', (document) => {
      document.quarantined = [...quarantinedEventlog, {...quarantinedEventlog[0], repository: 'zzz'}];
    }, /exact sorted 5-repository roster/],
    ['an unsorted quarantine list', (document) => {
      document.quarantined = [{...quarantinedEventlog[0], repository: 'harness'}, ...quarantinedEventlog];
      document.sources = document.sources.filter((entry) => entry.repository !== 'harness');
    }, /exact sorted 5-repository roster/],
    ['a quarantine entry without its message', (document) => {
      document.quarantined = [{repository: 'eventlog', check: 'bundle-schema'}];
    }, /quarantine entry eventlog has unexpected or missing fields/],
    ['a quarantine entry with an empty check', (document) => {
      document.quarantined = [{...quarantinedEventlog[0], check: '  '}];
    }, /invalid quarantine entry for eventlog/],
    ['a quarantine entry whose check spans lines', (document) => {
      document.quarantined = [{...quarantinedEventlog[0], check: 'bundle\nschema'}];
    }, /invalid quarantine entry for eventlog/],
    ['a quarantine entry with an empty message', (document) => {
      document.quarantined = [{...quarantinedEventlog[0], message: ''}];
    }, /invalid quarantine entry for eventlog/],
    ['a quarantine list that is not a list', (document) => { document.quarantined = {eventlog: 'x'}; }, /is not b10x-docs-source-set\/v2/],
  ];
  for (const [label, mutate, expected] of cases) {
    const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
    await rewriteSourceSet(fixture, mutate);
    await assert.rejects(
      loadPublicationInputs({root: fixture.websiteRoot, environment: sourceSetEnvironment(fixture)}),
      expected,
      label,
    );
  }
});

test('a v2 source set that publishes nothing is refused', async (context) => {
  const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
  await rewriteSourceSet(fixture, (document) => {
    document.quarantined = document.sources.map((entry) => ({repository: entry.repository, check: 'bundle-schema', message: 'invalid'}))
      .concat(quarantinedEventlog)
      .sort((left, right) => (left.repository < right.repository ? -1 : 1));
    document.sources = [];
  });
  await assert.rejects(
    loadPublicationInputs({root: fixture.websiteRoot, environment: sourceSetEnvironment(fixture)}),
    /must publish at least one source/,
  );
});

test('a quarantined source contributes no bundle directory to the publication inputs', async (context) => {
  const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
  await cp(path.join(fixture.inputsRoot, 'sources', 'harness'), path.join(fixture.inputsRoot, 'sources', 'eventlog'), {recursive: true});
  await assert.rejects(
    loadPublicationInputs({root: fixture.websiteRoot, environment: sourceSetEnvironment(fixture)}),
    /publication source bundles must contain the exact published source roster/,
  );
});

test('a quarantined source may appear in the Atlas bootstrap snapshots it is absent from the build of', async (context) => {
  const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
  const inputs = await loadPublicationInputs({root: fixture.websiteRoot, environment: sourceSetEnvironment(fixture)});
  await assert.doesNotReject(validateBootstrapSnapshots(fixture.websiteRoot, inputs.sourceRoster, {
    directory: inputs.bootstrapRoot,
    sourceSetSha256: inputs.sourceSetSha256,
    websiteRevision: inputs.sourceSet.websiteRuntimeCommit,
    sourceRevision: inputs.sourceSet.atlasControlCommit,
  }));
});

test('every manifest reference to a quarantined surface is dropped before the registry is built', () => {
  const manifest = {
    schema: 'b10x-docs/v3',
    repository: {id: 'website'},
    journeyPaths: {'build-agents': ['harness/docs', 'eventlog/docs'], operate: ['eventlog/docs']},
    surfaces: [{
      id: 'docs',
      relationships: [{kind: 'uses', target: 'eventlog/docs'}, {kind: 'uses', target: 'harness/docs'}],
    }, {id: 'start'}],
  };
  const stripped = withoutQuarantinedReferences(manifest, new Set(['eventlog']));
  assert.deepEqual(stripped.surfaces[0].relationships, [{kind: 'uses', target: 'harness/docs'}]);
  assert.equal(Object.hasOwn(stripped.surfaces[1], 'relationships'), false);
  assert.deepEqual(stripped.journeyPaths, {'build-agents': ['harness/docs'], operate: []});
  assert.equal(manifest.surfaces[0].relationships.length, 2, 'the input is not mutated');
  assert.equal(withoutQuarantinedReferences(manifest, new Set()), manifest, 'nothing quarantined, nothing copied');
});
