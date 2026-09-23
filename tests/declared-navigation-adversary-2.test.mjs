import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {parse, stringify} from 'yaml';
import {FIXTURE_SOURCES, quarantineFixture} from './helpers/quarantine-fixture.mjs';

// Adversarial pass 2 for story:docs-v3-declared-navigation-rendering, driven from the unit's own
// v5 ESS fixture and its own site harness.

const exec = promisify(execFile);
const essManifest = await readFile(path.join(import.meta.dirname, 'fixtures', 'ess-v5.yaml'), 'utf8');

function leavesOf(items) {
  return items.flatMap((item) => (typeof item === 'string' ? [item] : leavesOf(item.items)));
}

function essFiles(manifestText) {
  const [surface] = parse(manifestText).surfaces;
  const {navigation} = surface.source;
  const tree = Array.isArray(navigation.sidebar) ? leavesOf(navigation.sidebar) : [];
  const documents = [...new Set([...tree, ...(navigation.menuWithheld ?? []), ...(navigation.landing ? [navigation.landing] : [])])];
  return Object.fromEntries([
    ...documents.map((document) => [`website/${document}`, `# ${document}\n\nThe ${document} page of the ESS fixture.\n`]),
    ['website/static/img/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n'],
    ['website/blog/2026-09-01-field-note.md', '# A field note\n\nThe ESS fixture field note.\n'],
  ]);
}

function sourcesWith(manifestText) {
  return [...FIXTURE_SOURCES, {repository: 'ess', manifest: manifestText, files: essFiles(manifestText)}]
    .sort((left, right) => (left.repository < right.repository ? -1 : 1));
}

function environmentFor(fixture) {
  const environment = {...process.env, B10X_DOCS_SOURCE_SET: fixture.sourceSetPath};
  delete environment.B10X_BOOTSTRAP_FIXTURE;
  delete environment.B10X_SOURCE_WORKSPACE;
  delete environment.B10X_GENERATION_LEASE_TOKEN;
  return environment;
}

async function pagesServing(directory, slug) {
  const found = [];
  for (const entry of await readdir(directory, {withFileTypes: true, recursive: true})) {
    if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath ?? entry.path, entry.name);
    const text = await readFile(file, 'utf8');
    if (new RegExp(`^slug: "?${slug.replace(/[/.]/g, '\\$&')}"?$`, 'm').test(text)) found.push({file: path.relative(directory, file), text});
  }
  return found;
}

test('a menu-withheld root index keeps /docs/ess/ as its one page, or prepare-site refuses it by name', async (context) => {
  // Docs System accepts any published document in menuWithheld, the root index included, when it is
  // not a sidebar leaf. isMenuWithheld writes it under menu.withheld/, so the profile loop no longer
  // sees docs/ess/index.md and writes the generated project document there, with slug /ess/ too.
  const manifest = parse(essManifest);
  const {navigation} = manifest.surfaces[0].source;
  delete navigation.landing;
  navigation.menuWithheld = ['docs/index.md'];
  navigation.sidebar[0].items = ['docs/getting-started.md'];
  const manifestText = stringify(manifest);
  const fixture = await quarantineFixture(context, {sources: sourcesWith(manifestText)});
  try {
    await exec(process.execPath, ['scripts/prepare-site.mjs'], {cwd: fixture.websiteRoot, env: environmentFor(fixture)});
  } catch (error) {
    assert.match(String(error.stderr), /ess.*docs\/index\.md/, 'a refusal names the source and the document');
    return;
  }
  const pages = await pagesServing(path.join(fixture.websiteRoot, '.generated', 'docs'), '/ess/');
  assert.deepEqual(pages.map((page) => page.file), ['menu.withheld/ess/index.md'], 'exactly one generated page serves /docs/ess/, the withheld source document');
});
