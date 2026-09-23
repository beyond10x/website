import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {readManifest} from '@beyond10x/docs-system/manifest';
import {isCollectableManifestSchema} from '../scripts/git-source.mjs';
import {renderSidebars} from '../scripts/sidebar-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const v5FixturePath = path.join(root, 'tests/fixtures/b10x.docs.v5.example.yaml');

function extractJourneyLabelKeys(ecosystemSource) {
  const block = ecosystemSource.match(/const journeyLabels = \{([\s\S]*?)\} satisfies Record<Journey, string>;/);
  assert.ok(block, 'journeyLabels must be declared with a `satisfies Record<Journey, string>` exhaustiveness check');
  return [...block[1].matchAll(/(?:^|\n)\s*(?:'([\w-]+)'|([\w-]+))\s*:/g)].map(([, quoted, bare]) => quoted ?? bare);
}

function extractDocsSystemJourneyMembers(typesSource) {
  const declaration = typesSource.match(/export type Journey = ([^;]+);/);
  assert.ok(declaration, 'docs-system types.d.ts no longer declares a Journey union in the expected shape');
  return declaration[1].split('|').map((member) => member.trim().replace(/^'|'$/g, ''));
}

test('R13: the ecosystem journey filter list is exhaustive against the installed docs-system Journey type', async () => {
  const ecosystemSource = await readFile(path.join(root, 'src/pages/ecosystem.tsx'), 'utf8');
  const typesFile = fileURLToPath(import.meta.resolve('@beyond10x/docs-system/types')).replace(/\.js$/, '.d.ts');
  const typesSource = await readFile(typesFile, 'utf8');
  const declaredByDocsSystem = extractDocsSystemJourneyMembers(typesSource).sort();
  const mappedByWebsite = extractJourneyLabelKeys(ecosystemSource).sort();
  assert.deepEqual(mappedByWebsite, declaredByDocsSystem, 'ecosystem.tsx journey labels must cover exactly the installed docs-system Journey union');
});

test('R12: ecosystem family, journey, and search state round-trip through the URL via replaceState', async () => {
  const source = await readFile(path.join(root, 'src/pages/ecosystem.tsx'), 'utf8');
  assert.match(source, /const search = new URLSearchParams\(location\.search\);/, 'state must be restored from the current URL on load/navigation');
  assert.match(source, /search\.get\('journey'\)/);
  assert.match(source, /search\.get\('family'\)/);
  assert.match(source, /search\.get\('q'\)/);
  assert.match(source, /setUrlReady\(true\);/, 'the write-back effect must not fire before the initial restore has run');
  assert.match(source, /if \(!urlReady \|\| typeof window === 'undefined'\) return;/);
  assert.match(source, /search\.set\('q', query\.trim\(\)\)/);
  assert.match(source, /search\.set\('journey', journey\)/);
  assert.match(source, /search\.set\('family', family\)/);
  assert.match(source, /window\.history\.replaceState\(null, '', `\$\{window\.location\.pathname\}\$\{serialized \? `\?\$\{serialized\}` : ''\}`\);/);
  assert.match(source, /\}, \[family, journey, query, urlReady\]\);/, 'the write-back effect must react to every piece of filter state it serializes');
});

test('R14: a project surface with no declared navigation.group fails sidebar rendering loudly, naming the repository', () => {
  const registry = {surfaces: [
    {name: 'Start', kind: 'front-door', repository: {id: 'website'}},
    {name: 'Orphan project', kind: 'project', repository: {id: 'orphan-project'}},
  ]};
  const manifestsMissingGroup = [
    {repository: {id: 'website'}, surfaces: [{source: {navigation: {label: 'Start', order: 0, sidebar: 'flat'}}}]},
    {repository: {id: 'orphan-project'}, surfaces: [{source: {}}]},
  ];
  assert.throws(
    () => renderSidebars(registry, manifestsMissingGroup),
    /orphan-project declares no documentation family/,
  );
});

test('R14: a front-door surface with no declared navigation.group is not subject to the family requirement', () => {
  const registry = {surfaces: [{name: 'Start', kind: 'front-door', repository: {id: 'website'}}]};
  const manifests = [{repository: {id: 'website'}, surfaces: [{source: {}}]}];
  assert.doesNotThrow(() => renderSidebars(registry, manifests));
});

test('R7: the website collector now accepts b10x-docs/v3, v4, and v5', () => {
  assert.equal(isCollectableManifestSchema('b10x-docs/v3'), true);
  assert.equal(isCollectableManifestSchema('b10x-docs/v4'), true);
  assert.equal(isCollectableManifestSchema('b10x-docs/v5'), true);
});

test('R7: docs-system\'s own readManifest validates a b10x-docs/v5 fixture (schema, canonicalUrl, and the v5-only sidebar/menuWithheld path rules)', async () => {
  const manifest = await readManifest(v5FixturePath);
  assert.equal(manifest.schema, 'b10x-docs/v5');
  const [surface] = manifest.surfaces;
  assert.deepEqual(surface.source.navigation.sidebar, [
    {label: 'Getting started', items: ['getting-started/index.md', 'getting-started/install.md']},
    {label: 'Reference', items: ['guide.md']},
  ]);
  assert.deepEqual(surface.source.navigation.menuWithheld, ['internal-notes.md']);
});

test('R7: readManifest refuses a v5 sidebar leaf that is also declared menuWithheld', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-review-ecosystem-v5-'));
  try {
    const conflicting = (await readFile(v5FixturePath, 'utf8')).replace('- internal-notes.md', '- guide.md');
    const file = path.join(directory, 'b10x.docs.yaml');
    await writeFile(file, conflicting);
    await assert.rejects(readManifest(file), /menuWithheld|sidebar leaf/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
