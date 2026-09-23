import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {canonicalJson, sha256} from '../scripts/artifact-contract.mjs';
import {completeSurfaceLookup} from '../src/quarantine-routes.mjs';
import {quarantineFixture} from './helpers/quarantine-fixture.mjs';

const exec = promisify(execFile);

// Adversarial pass 1, story:docs-v3-quarantine-rendering. The acceptance statement: "every former
// inbound link points at its GitHub repository". A published source's impact change that affects a
// surface of the quarantined source is such an inbound link: /changes/ renders each affected
// surface as `<a href={surfaces.get(key)?.canonicalUrl}>` (ChangeTimelineEntry in
// @beyond10x/docs-system/components, fed by src/pages/changes.tsx from the prepared registry).
// Real instance: data/bootstrap/changes.json `docs-system/passive-data-sources-0.3.1` affects
// `ess/docs`, so quarantining ess reaches this.
test('an impact change affecting a quarantined surface still links it, to its GitHub repository', async (context) => {
  const fixture = await quarantineFixture(context, {
    quarantined: [{repository: 'eventlog', check: 'bundle-schema', message: 'bundle.json violates the exported Docs System bundle schema'}],
  });
  const bootstrap = path.join(fixture.inputsRoot, 'bootstrap');
  const changes = JSON.parse(await readFile(path.join(bootstrap, 'changes.json'), 'utf8'));
  changes.changes.push({
    key: 'harness/eventlog-bridge-0.1.1',
    id: 'harness/eventlog-bridge-0.1.1',
    repository: 'harness',
    publishedAt: '2026-09-18T00:00:00Z',
    title: 'Harness writes to the event log',
    summary: 'Harness now appends its turns to the event log.',
    kind: 'capability',
    impact: 'significant',
    source: {url: 'https://github.com/beyond10x/harness/releases/tag/0.1.1', version: '0.1.1'},
    journeys: ['operate-services'],
    affectedSurfaces: ['harness/docs', 'eventlog/docs'],
    automatic: false,
    channel: 'impact',
  });
  const changesBytes = Buffer.from(canonicalJson(changes));
  await writeFile(path.join(bootstrap, 'changes.json'), changesBytes);
  const metadata = JSON.parse(await readFile(path.join(bootstrap, 'metadata.json'), 'utf8'));
  metadata.files['changes.json'] = sha256(changesBytes);
  await writeFile(path.join(bootstrap, 'metadata.json'), canonicalJson(metadata));

  const environment = {...process.env, B10X_DOCS_SOURCE_SET: fixture.sourceSetPath};
  delete environment.B10X_BOOTSTRAP_FIXTURE;
  delete environment.B10X_SOURCE_WORKSPACE;
  delete environment.B10X_GENERATION_LEASE_TOKEN;
  await exec(process.execPath, ['scripts/prepare-site.mjs'], {cwd: fixture.websiteRoot, env: environment});
  const data = path.join(fixture.websiteRoot, '.generated', 'data');
  const ledger = JSON.parse(await readFile(path.join(data, 'changes.json'), 'utf8'));
  const registry = JSON.parse(await readFile(path.join(data, 'ecosystem.json'), 'utf8'));

  const change = ledger.changes.find((entry) => entry.key === 'harness/eventlog-bridge-0.1.1');
  assert.ok(change, 'the published source keeps its change');
  // Coordinator decision (wave 2 U2, correction round 2): quarantined surfaces stay out of the
  // registry, so this intent is asserted at the layer that renders it. src/pages/changes.tsx hands
  // ChangeTimelineEntry the prepared registry completed by withQuarantinedSurfaces, whose core is
  // completeSurfaceLookup, over the quarantine list prepare-site wrote; ChangeTimelineEntry renders
  // surfaces.get(key)?.canonicalUrl as the href (the page localizes portal URLs afterwards).
  const quarantined = new Set(JSON.parse(await readFile(path.join(data, 'quarantine.json'), 'utf8')).repositories);
  const surfaces = completeSurfaceLookup(
    new Map(registry.surfaces.map((surface) => [surface.key, surface])),
    ledger.changes.flatMap((entry) => entry.affectedSurfaces ?? []),
    quarantined,
  );
  const rendered = change.affectedSurfaces.map((key) => ({key, href: surfaces.get(key)?.canonicalUrl}));
  assert.deepEqual(rendered, [
    {key: 'harness/docs', href: 'https://beyond10x.github.io/docs/harness/'},
    {key: 'eventlog/docs', href: 'https://github.com/beyond10x/eventlog'},
  ]);
  // The registry decision itself, pinned: the quarantined surface has no registry card.
  assert.ok(!registry.surfaces.some((surface) => surface.key === 'eventlog/docs'), 'eventlog/docs is absent from registry.surfaces');
});
