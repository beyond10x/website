import assert from 'node:assert/strict';
import {mkdir, readFile, readdir, symlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {artifactFacts, canonicalJson, sha256} from '../scripts/artifact-contract.mjs';
import {resolvePublicationLayout, writePublicationLayout} from '../scripts/publication-layout.mjs';
import {publicationFixture} from './helpers/publication-fixture.mjs';

test('publication resolver preserves the legacy flat rollback layout', async (context) => {
  const fixture = await publicationFixture(context);
  const flat = path.join(fixture.temporary, 'flat');
  await mkdir(flat);
  await writeFile(path.join(flat, 'PROVENANCE.json'), '{}\n');
  const layout = await resolvePublicationLayout(flat);
  assert.equal(layout.schema, 'b10x-publication-layout/v1');
  assert.equal(layout.siteRoot, flat);
  assert.equal(layout.sourceSetPath, undefined);
});

test('publication writer creates the exact v2 layout with inputs separate from the deployable site', async (context) => {
  const fixture = await publicationFixture(context);
  const siteRoot = path.join(fixture.temporary, 'built-site');
  const outputRoot = path.join(fixture.temporary, 'publication');
  await mkdir(siteRoot);
  await writeFile(path.join(siteRoot, 'index.html'), '<!doctype html>\n');
  const facts = await artifactFacts(siteRoot);
  await writeFile(path.join(siteRoot, 'PROVENANCE.json'), canonicalJson({
    schema: 'b10x-website-provenance/v2',
    websiteCommit: fixture.websiteRuntimeCommit,
    atlasControlCommit: fixture.atlasControlCommit,
    sourceSetSha256: sha256(fixture.sourceSetBytes),
    artifactSha256: facts.artifactSha256,
    routesSha256: facts.routesSha256,
    routes: facts.routes,
    files: facts.files,
  }));
  const layout = await writePublicationLayout({
    websiteRoot: fixture.websiteRoot,
    siteRoot,
    inputsRoot: fixture.inputsRoot,
    outputRoot,
  });
  assert.equal(layout.schema, 'b10x-publication-layout/v2');
  assert.deepEqual((await readdir(outputRoot)).sort(), ['inputs', 'publication.json', 'site']);
  assert.equal(await readFile(path.join(layout.siteRoot, 'index.html'), 'utf8'), '<!doctype html>\n');
  assert.equal(layout.sourceSetPath, path.join(outputRoot, 'inputs', 'source-set.json'));

  await writeFile(path.join(outputRoot, 'PROVENANCE.json'), '{}\n');
  await assert.rejects(resolvePublicationLayout(outputRoot), /mixes legacy flat provenance/);
});

test('publication resolver rejects symbolic layout markers', async (context) => {
  const fixture = await publicationFixture(context);
  const publication = path.join(fixture.temporary, 'symbolic-marker');
  await mkdir(path.join(publication, 'site'), {recursive: true});
  await mkdir(path.join(publication, 'inputs'), {recursive: true});
  await writeFile(path.join(publication, 'marker-target.json'), canonicalJson({
    schema: 'b10x-publication-layout/v2',
    site: 'site',
    sourceSet: 'inputs/source-set.json',
  }));
  await symlink('marker-target.json', path.join(publication, 'publication.json'));
  await assert.rejects(resolvePublicationLayout(publication), /layout marker must not be a symbolic link/);
});
