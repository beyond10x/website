import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {parse, stringify} from 'yaml';
import {collectManifestSources} from '@beyond10x/docs-system/collector';
import {readManifest} from '@beyond10x/docs-system/manifest';
import {portalRefusals} from '../scripts/source-preview-checks.mjs';
import {FIXTURE_SOURCES, quarantineFixture} from './helpers/quarantine-fixture.mjs';

// Adversarial cases for story:docs-v3-declared-navigation-rendering, driven from the unit's own
// v5 ESS fixture and its own site harness.

const exec = promisify(execFile);
const essManifest = await readFile(path.join(import.meta.dirname, 'fixtures', 'ess-v5.yaml'), 'utf8');
const exists = (file) => access(file).then(() => true, () => false);

function leavesOf(items) {
  return items.flatMap((item) => (typeof item === 'string' ? [item] : leavesOf(item.items)));
}

function essFiles(manifestText, {omit = []} = {}) {
  const [surface] = parse(manifestText).surfaces;
  const {navigation} = surface.source;
  const tree = Array.isArray(navigation.sidebar) ? leavesOf(navigation.sidebar) : [];
  const documents = [...new Set([...tree, ...(navigation.menuWithheld ?? []), ...(navigation.landing ? [navigation.landing] : [])])]
    .filter((document) => !omit.includes(document));
  return Object.fromEntries([
    ...documents.map((document) => [`website/${document}`, `# ${document}\n\nThe ${document} page of the ESS fixture.\n\n\`\`\`bash\ness --version\n\`\`\`\n`]),
    ['website/static/img/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n'],
    ['website/blog/2026-09-01-field-note.md', '# A field note\n\nThe ESS fixture field note.\n'],
  ]);
}

function sourcesWith(manifestText, files = essFiles(manifestText)) {
  return [...FIXTURE_SOURCES, {repository: 'ess', manifest: manifestText, files}]
    .sort((left, right) => (left.repository < right.repository ? -1 : 1));
}

function environmentFor(fixture) {
  const environment = {...process.env, B10X_DOCS_SOURCE_SET: fixture.sourceSetPath};
  delete environment.B10X_BOOTSTRAP_FIXTURE;
  delete environment.B10X_SOURCE_WORKSPACE;
  delete environment.B10X_GENERATION_LEASE_TOKEN;
  return environment;
}

async function prepare(context, sources) {
  const fixture = await quarantineFixture(context, {sources});
  const environment = environmentFor(fixture);
  await exec(process.execPath, ['scripts/prepare-site.mjs'], {cwd: fixture.websiteRoot, env: environment});
  const generated = path.join(fixture.websiteRoot, '.generated');
  const sidebars = await readFile(path.join(generated, 'sidebars.cjs'), 'utf8');
  return {fixture, environment, generated, sidebars: JSON.parse(sidebars.replace(/^module\.exports = /, '').replace(/;\n$/, ''))};
}

function withSurface(manifestText, change) {
  const manifest = parse(manifestText);
  change(manifest.surfaces[0]);
  return stringify(manifest);
}

async function codeContractSource({fixture, environment}) {
  return exec(process.execPath, ['scripts/code-contract.mjs', 'source'], {cwd: fixture.websiteRoot, env: environment})
    .then(({stdout, stderr}) => ({status: 0, stdout, stderr}), (error) => ({status: error.code, stdout: error.stdout, stderr: error.stderr}));
}

function declaredIds(section) {
  return (JSON.stringify(section.items).match(/"id":"[^"]+"/g) ?? []).map((match) => match.slice(6, -1));
}

test('control: the gate code contract (source) passes over the v5 ESS fixture when nothing is withheld', async (context) => {
  const manifest = withSurface(essManifest, (surface) => {
    delete surface.source.navigation.menuWithheld;
  });
  const prepared = await prepare(context, sourcesWith(manifest, essFiles(manifest)));
  const result = await codeContractSource(prepared);
  assert.equal(result.status, 0, `code-contract source failed without menuWithheld:\n${result.stderr}`);
});

test('the gate code contract (source) passes over the v5 ESS fixture, which withholds one document from the menu', async (context) => {
  // run-gate.mjs runs `node scripts/code-contract.mjs source` right after prepare:site. It reads each
  // document's generated page at `.generated/docs/<route>/index.md`; a withheld page is written under
  // `.generated/docs/menu.withheld/...` instead.
  const prepared = await prepare(context, sourcesWith(essManifest));
  const result = await codeContractSource(prepared);
  assert.equal(result.status, 0, `code-contract source failed:\n${result.stderr}`);
});

test('every declared leaf is a document the build writes, or prepare-site refuses the source by name', async (context) => {
  // The unit's own site test states this invariant for the happy path. A leaf the manifest validator
  // accepts ("whether the file exists is the collector's concern") and the collector never sees is
  // written into sidebars.cjs, where Docusaurus fails the whole site on an unknown doc id.
  const missing = 'docs/concepts/ess.md';
  let prepared;
  try {
    prepared = await prepare(context, sourcesWith(essManifest, essFiles(essManifest, {omit: [missing]})));
  } catch (error) {
    assert.match(String(error.stderr), /ess.*docs\/concepts\/ess\.md/, 'a refusal names the source and the leaf');
    return;
  }
  const absent = [];
  for (const id of declaredIds(prepared.sidebars.project_ess[2])) {
    if (!(await exists(path.join(prepared.generated, 'docs', `${id}.md`))) && !(await exists(path.join(prepared.generated, 'docs', `${id}.mdx`)))) absent.push(id);
  }
  assert.deepEqual(absent, [], 'sidebars.cjs names doc ids no generated document has');
});

test('a declared sidebar names only documents inside its own repository namespace', async (context) => {
  // routeBase is only required to begin /docs/, and Docs System checks routeBase uniqueness only.
  const manifest = withSurface(essManifest, (surface) => {
    surface.routeBase = '/docs/harness/ess/';
    surface.canonicalUrl = 'https://beyond10x.github.io/docs/harness/ess/';
  });
  let prepared;
  try {
    prepared = await prepare(context, sourcesWith(manifest, essFiles(manifest)));
  } catch (error) {
    assert.match(String(error.stderr), /ess/, 'a refusal names the source');
    return;
  }
  const foreign = declaredIds(prepared.sidebars.project_ess[2]).filter((id) => !id.startsWith('ess/'));
  assert.deepEqual(foreign, [], 'project_ess names documents in another repository\'s namespace');
});

test('control: a quarantined repository beside a v5 declared sidebar leaves that sidebar intact', async (context) => {
  const fixture = await quarantineFixture(context, {
    sources: sourcesWith(essManifest),
    quarantined: [{repository: 'eventlog', check: 'bundle-schema', message: 'eventlog bundle is invalid'}],
  });
  const result = await exec(process.execPath, ['scripts/prepare-site.mjs'], {cwd: fixture.websiteRoot, env: environmentFor(fixture)})
    .then(() => 0, (error) => error);
  assert.equal(result, 0, String(result?.stderr ?? ''));
  const sidebars = JSON.parse((await readFile(path.join(fixture.websiteRoot, '.generated', 'sidebars.cjs'), 'utf8')).replace(/^module\.exports = /, '').replace(/;\n$/, ''));
  assert.equal(sidebars.project_eventlog, undefined);
  assert.deepEqual(sidebars.project_ess[2].items.map((category) => category.label), ['Start here', 'Concepts', 'Guides', 'Reference', 'Examples', 'Project status']);
});

test('the source preview refuses the landing and index double route that prepare-site refuses', async (context) => {
  // source-preview-checks.mjs: "a new per-document refusal there needs its counterpart here".
  // prepare-site now refuses a declared landing and an index document that both serve the route base.
  const manifestText = withSurface(essManifest, (surface) => {
    surface.source.navigation.landing = 'docs/getting-started.md';
  });
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'b10x-adversary-'));
  context.after(() => rm(temporary, {recursive: true, force: true}));
  const treeRoot = path.join(temporary, 'tree');
  for (const [relative, content] of Object.entries(essFiles(manifestText))) {
    const destination = path.join(treeRoot, ...relative.split('/'));
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, content);
  }
  const manifestFile = path.join(temporary, 'b10x.docs.yaml');
  await writeFile(manifestFile, manifestText);
  const manifest = await readManifest(manifestFile);
  const index = await collectManifestSources(manifest, treeRoot);
  const refusals = await portalRefusals({manifest, index, treeRoot});
  assert.ok(refusals.some((refusal) => /\/docs\/ess\//.test(refusal)), `the preview accepts what the gate refuses: ${JSON.stringify(refusals)}`);
});
