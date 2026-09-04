import assert from 'node:assert/strict';
import {readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {collectSources} from '../scripts/collect-sources.mjs';
import {loadPublicationInputs} from '../scripts/publication-inputs.mjs';
import {publicationFixture} from './helpers/publication-fixture.mjs';

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
