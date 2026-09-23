import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {access, mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {quarantineFixture} from './helpers/quarantine-fixture.mjs';

const exec = promisify(execFile);
const quarantinedEventlog = [{repository: 'eventlog', check: 'bundle-schema', message: 'bundle.json violates the exported Docs System bundle schema'}];
const github = 'https://github.com/beyond10x/eventlog';

function environmentFor(fixture, extra = {}) {
  const environment = {...process.env, B10X_DOCS_SOURCE_SET: fixture.sourceSetPath, ...extra};
  delete environment.B10X_BOOTSTRAP_FIXTURE;
  delete environment.B10X_SOURCE_WORKSPACE;
  delete environment.B10X_GENERATION_LEASE_TOKEN;
  return environment;
}

async function prepare(fixture) {
  await exec(process.execPath, ['scripts/prepare-site.mjs'], {cwd: fixture.websiteRoot, env: environmentFor(fixture)});
  return path.join(fixture.websiteRoot, '.generated');
}

async function exists(file) {
  return access(file).then(() => true, () => false);
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else if (entry.isFile()) files.push(candidate);
  }
  return files;
}

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

test('a quarantined source is absent from every Website projection and every inbound link points at GitHub', async (context) => {
  const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
  const generated = await prepare(fixture);

  assert.equal(await exists(path.join(generated, 'docs', 'eventlog')), false, 'no section');
  assert.equal(await exists(path.join(generated, 'ecosystem', 'eventlog.mdx')), false, 'no profile');
  const registry = await json(path.join(generated, 'data', 'ecosystem.json'));
  assert.ok(!registry.surfaces.some((surface) => surface.repository.id === 'eventlog'), 'no registry card');
  const sidebars = await readFile(path.join(generated, 'sidebars.cjs'), 'utf8');
  assert.doesNotMatch(sidebars, /eventlog/, 'no sidebar entry');
  const documents = await json(path.join(generated, 'data', 'document-index.json'));
  assert.ok(documents.documents.length > 0);
  assert.ok(!documents.documents.some((document) => document.project === 'eventlog'), 'nothing to search');
  for (const name of ['changes.json', 'release-facts.json']) {
    assert.doesNotMatch(await readFile(path.join(generated, 'data', name), 'utf8'), /"repository": "eventlog"/, `${name} carries no quarantined entry`);
  }
  for (const feed of ['changes/feed.json', 'changes/rss.xml', 'releases/feed.json', 'releases/rss.xml']) {
    const bytes = await readFile(path.join(generated, 'static', ...feed.split('/')), 'utf8');
    assert.doesNotMatch(bytes, /eventlog/, `${feed} has no entry for the quarantined source`);
    assert.match(bytes, /harness/, `${feed} still carries the published sources`);
  }
  const dependencies = await json(path.join(generated, 'data', 'dependencies.json'));
  assert.ok(!dependencies.nodes.some((node) => node.id === 'eventlog'));

  const guide = await readFile(path.join(generated, 'docs', 'harness', 'guide', 'index.md'), 'utf8');
  assert.match(guide, new RegExp(`\\[Eventlog guide\\]\\(${github}\\)`));
  assert.match(guide, new RegExp(`\\[Eventlog profile\\]\\(${github}\\)`));
  assert.match(guide, new RegExp(`\\[eventlog-api\\]: ${github}`));
  assert.match(guide, new RegExp(`<a href="${github}">Eventlog home</a>`));
  assert.match(guide, /\[Agent Platform guide\]\(https:\/\/beyond10x\.github\.io\/docs\/agent-platform\/guide\/\)/);
  const platform = registry.surfaces.find((surface) => surface.repository.id === 'agent-platform');
  assert.deepEqual(platform.relationships.map((relation) => relation.target), ['harness/docs'], 'a relationship into the quarantined source is dropped');
  const harness = registry.surfaces.find((surface) => surface.repository.id === 'harness');
  assert.ok(harness.sections.some((section) => section.label === 'Eventlog companion' && section.url === github));

  // The class, not the three instances above: no generated file outside the raw collected source
  // copy names a route the quarantined source would have owned.
  const quarantinedRoute = /(?:https:\/\/beyond10x\.github\.io)?\/(?:docs|ecosystem|api|components|data|source-assets|updates\/field-notes)\/eventlog(?:[/"')#?\s]|$)/;
  for (const file of await walk(generated)) {
    const relative = path.relative(generated, file).split(path.sep).join('/');
    if (relative.startsWith('collection/')) continue;
    assert.doesNotMatch(await readFile(file, 'utf8'), quarantinedRoute, `${relative} links into the quarantined source`);
  }
  const completion = await json(path.join(generated, '.complete.json'));
  assert.equal(completion.inputSchema, 'b10x-docs-source-set/v2');
});

test('a build left with no field notes still publishes the field-note feeds the Website links to', async (context) => {
  // No fixture source carries a field note, which is where quarantining every source that owns one
  // leaves a real build: the blog plugin then emits no feed, and /updates/ links to it.
  const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
  const generated = await prepare(fixture);
  for (const name of ['feed.json', 'rss.xml', 'atom.xml']) {
    assert.ok(await exists(path.join(generated, 'static', 'updates', 'field-notes', name)), `${name} is published`);
  }
  const feed = await json(path.join(generated, 'static', 'updates', 'field-notes', 'feed.json'));
  assert.deepEqual(feed.items, []);
});

test('quarantining the only member of a family prepares the site with that family out of the sidebar', async (context) => {
  const fixture = await quarantineFixture(context, {
    quarantined: [{repository: 'devcenter', check: 'bundle-digest', message: 'bundle digest does not match its source-set reference'}],
  });
  const generated = await prepare(fixture);
  const sidebars = await readFile(path.join(generated, 'sidebars.cjs'), 'utf8');
  assert.doesNotMatch(sidebars, /families\/products/);
  assert.doesNotMatch(sidebars, /devcenter/);
  assert.ok(await exists(path.join(generated, 'docs', 'families', 'products.mdx')), 'the authored family landing is still generated');
});

test('provenance names each quarantined source and records only the published ones as sources', async (context) => {
  const fixture = await quarantineFixture(context, {quarantined: quarantinedEventlog});
  const build = path.join(fixture.websiteRoot, 'build');
  await mkdir(build, {recursive: true});
  await writeFile(path.join(build, 'index.html'), '<!doctype html>\n');
  await exec(process.execPath, ['scripts/write-provenance.mjs'], {
    cwd: fixture.websiteRoot,
    env: environmentFor(fixture, {GITHUB_SHA: fixture.sourceSet.websiteRuntimeCommit}),
  });
  const provenance = await json(path.join(build, 'PROVENANCE.json'));
  assert.equal(provenance.schema, 'b10x-website-provenance/v3');
  assert.deepEqual(provenance.quarantinedSources, quarantinedEventlog);
  assert.deepEqual(Object.keys(provenance.sourceCommits), ['agent-platform', 'agentic-principles', 'devcenter', 'harness']);
  assert.deepEqual(Object.keys(provenance.sourceBundles), Object.keys(provenance.sourceCommits));
  const deployment = await json(path.join(build, '._b10x', 'deployment.json'));
  assert.equal(deployment.schema, 'b10x-docs-deployment/v3');
  assert.equal(deployment.sourceCount, 4);
  assert.deepEqual(deployment.quarantinedSources, ['eventlog']);
});

test('a v1 source set still writes v2 provenance with no quarantine field', async (context) => {
  const fixture = await quarantineFixture(context);
  const build = path.join(fixture.websiteRoot, 'build');
  await mkdir(build, {recursive: true});
  await writeFile(path.join(build, 'index.html'), '<!doctype html>\n');
  await exec(process.execPath, ['scripts/write-provenance.mjs'], {
    cwd: fixture.websiteRoot,
    env: environmentFor(fixture, {GITHUB_SHA: fixture.sourceSet.websiteRuntimeCommit}),
  });
  const provenance = await json(path.join(build, 'PROVENANCE.json'));
  assert.equal(provenance.schema, 'b10x-website-provenance/v2');
  assert.equal(Object.hasOwn(provenance, 'quarantinedSources'), false);
  assert.equal(Object.keys(provenance.sourceCommits).length, 5);
});

// Every repository on the real roster, in its real documentation family, so that quarantining any
// one of them exercises the Website's own data (experiences, families, search goldens) against it.
const rosterFamilies = {
  Foundation: ['agentic-principles', 'aep', 'ess', 'research'],
  Build: ['agentide', 'agentplugins', 'docs-system', 'entity-runtime', 'extensions', 'gates', 'harness', 'mcp', 'metaharness', 'substrate', 'worktree'],
  Services: ['aep-service', 'agent-platform', 'connectors', 'eventlog', 'identity', 'mandate', 'secrets', 'service-sdk', 'workflow', 'workspace'],
  Products: ['devcenter'],
};
const rosterSources = Object.entries(rosterFamilies)
  .flatMap(([group, repositories]) => repositories.map((repository) => ({
    repository,
    displayName: repository,
    group,
    body: `# ${repository}\n\n## Events\n\nSee [harness](https://beyond10x.github.io/docs/harness/), [aep](https://beyond10x.github.io/docs/aep/) and [devcenter](/ecosystem/devcenter/).\n`,
  })))
  .sort((left, right) => (left.repository < right.repository ? -1 : 1));

test('the fixture roster is the production roster', async () => {
  const {parse} = await import('yaml');
  const production = parse(await readFile(path.join(import.meta.dirname, '..', 'sources.yaml'), 'utf8')).repositories;
  assert.deepEqual(rosterSources.map((source) => source.repository), production);
});

test('quarantining any one of the 26 sources prepares a site with no route of it anywhere', async (context) => {
  const failures = [];
  const queue = [...rosterSources];
  const worker = async () => {
    for (let source = queue.shift(); source; source = queue.shift()) {
      const {repository} = source;
      try {
        const fixture = await quarantineFixture(context, {
          sources: rosterSources,
          quarantined: [{repository, check: 'bundle-schema', message: `${repository} bundle is invalid`}],
        });
        const generated = await prepare(fixture);
        const route = new RegExp(`(?:https:\\/\\/beyond10x\\.github\\.io)?\\/(?:docs|ecosystem|api|components|data|source-assets|updates\\/field-notes)\\/${repository}(?:[/"')#?\\s]|$)`);
        for (const file of await walk(generated)) {
          const relative = path.relative(generated, file).split(path.sep).join('/');
          if (relative.startsWith('collection/')) continue;
          if (route.test(await readFile(file, 'utf8'))) failures.push(`${repository}: ${relative} links into it`);
        }
        const quarantine = await json(path.join(generated, 'data', 'quarantine.json'));
        if (JSON.stringify(quarantine.repositories) !== JSON.stringify([repository])) failures.push(`${repository}: quarantine.json is ${JSON.stringify(quarantine)}`);
      } catch (error) {
        failures.push(`${repository}: ${String(error.stderr ?? error.message).split('\n').filter(Boolean).slice(-3).join(' | ')}`);
      }
    }
  };
  await Promise.all(Array.from({length: 4}, worker));
  assert.deepEqual(failures, []);
});

// The contract a Website-authored file must meet so no hard-coded route can reach a quarantined
// source: Link is PublishedLink under every binding form, @docusaurus/Link is reached by no
// import, dynamic import or require, localization goes through src/lib/published, and every route
// literal into a source is an argument of publishedHref or the target of a PublishedLink.
function publishedLinkOffences(relative, source, sourceRoute) {
  const offences = [];
  const wrapper = relative === 'src/lib/PublishedLink.tsx';
  const bindsDocusaurusLink = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"`]@docusaurus\/Link['"`]/;
  if (!wrapper && bindsDocusaurusLink.test(source)) {
    offences.push(`${relative} reaches @docusaurus/Link instead of the quarantine-aware PublishedLink`);
  }
  if (!wrapper) {
    const publishedLink = /^(?:@site\/src\/lib\/PublishedLink|(?:\.\.?\/)+(?:[\w-]+\/)*lib\/PublishedLink|\.\/PublishedLink)(?:\.tsx)?$/;
    for (const match of source.matchAll(/\bimport\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
      const clause = match[1];
      const bindsLink = /(?:^|[\s,{])Link(?:\s*[,}]|\s*$)/.test(clause) || /\bas\s+Link\b/.test(clause) || /\*\s*as\s+Link\b/.test(clause);
      if (!bindsLink) continue;
      const defaultOnly = /^Link$/.test(clause.trim());
      if (!defaultOnly || !publishedLink.test(match[2])) {
        offences.push(`${relative} binds Link to ${match[2]} (${clause.trim()}), not the default export of PublishedLink`);
      }
    }
    if (/\b(?:const|let|var|function|class)\s+Link\b|\bLink\s*=[^=>]/.test(source)) {
      offences.push(`${relative} declares its own Link`);
    }
    if (/<Link\b/.test(source) && !/\bimport\s+Link\s+from\s+['"][^'"]*PublishedLink['"]/.test(source)) {
      offences.push(`${relative} renders <Link> without importing PublishedLink`);
    }
  }
  if (relative !== 'src/lib/published.ts' && /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*lib\/links(?:\.ts)?['"]/.test(source)) {
    offences.push(`${relative} localizes links without the quarantine rule; import from src/lib/published instead`);
  }
  // A lookup built from the published registry resolves a key of a quarantined surface to nothing,
  // and the shared components then render an anchor without a target. Every such lookup is completed
  // with the quarantined surfaces the rule links to GitHub.
  for (const match of source.matchAll(/new Map(?:<[^>]*>)?\(\s*[\w.]*surfaces\.map\(/g)) {
    if (!/withQuarantinedSurfaces\(\s*$/.test(source.slice(Math.max(0, match.index - 60), match.index))) {
      offences.push(`${relative} builds a surface lookup from published data only; wrap it in withQuarantinedSurfaces`);
    }
  }
  for (const match of source.matchAll(/(['"`])((?:https:\/\/beyond10x\.github\.io)?\/[^'"`\s]*)\1/g)) {
    const value = match[2].replace(/^https:\/\/beyond10x\.github\.io/, '');
    if (!sourceRoute.test(value)) continue;
    const before = source.slice(Math.max(0, match.index - 200), match.index);
    const throughRule = /publishedHref\(\s*$/.test(before);
    const onLink = /<Link\b[^<>]*\b(?:to|href)=$/.test(before);
    if (!throughRule && !onLink) offences.push(`${relative}: ${match[2]} bypasses publishedHref and PublishedLink`);
  }
  return offences;
}

test('the published-link contract refuses every way of reaching the unfiltered Link', () => {
  const route = /^\/docs\/harness(?:[/?#]|$)/;
  const offending = {
    'static import': "import Link from '@docusaurus/Link';\n<Link to=\"/x/\" />",
    'renamed import': "import DocusaurusLink from '@docusaurus/Link';",
    'dynamic import': "const module = await import('@docusaurus/Link');",
    'require': "const Anchor = require('@docusaurus/Link').default;",
    'side-effect import': "import '@docusaurus/Link';",
    'Link bound elsewhere': "import Link from '@theme/Link';\n<Link to=\"/x/\" />",
    'Link as a named import': "import {Link} from 'react-router-dom';\n<Link to=\"/x/\" />",
    'Link aliased': "import {NavLink as Link} from 'react-router-dom';",
    'Link declared locally': "const Link = (props) => <a {...props} />;\n<Link to=\"/x/\" />",
    'Link rendered without an import': "<Link to=\"/x/\" />",
    'route literal outside the rule': "import Link from '@site/src/lib/PublishedLink';\nconst url = '/docs/harness/';",
    'localization bypass by require': "const links = require('../lib/links');",
    'surface lookup from published data only': "const surfaces = new Map(registry.surfaces.map((surface) => [surface.key, surface]));",
  };
  for (const [label, source] of Object.entries(offending)) {
    assert.notDeepEqual(publishedLinkOffences('src/pages/example.js', source, route), [], label);
  }
  const allowed = "import Link from '@site/src/lib/PublishedLink';\nimport {publishedHref} from '@site/src/lib/published';\nconst url = publishedHref('/docs/harness/');\n<Link to=\"/docs/harness/guide/\" />";
  assert.deepEqual(publishedLinkOffences('src/pages/example.tsx', allowed, route), []);
});

test('every Website-authored route into a source goes through the quarantine rule', async () => {
  const {parse} = await import('yaml');
  const root = path.join(import.meta.dirname, '..');
  const roster = parse(await readFile(path.join(root, 'sources.yaml'), 'utf8')).repositories;
  const sourceRoute = new RegExp(`^/(?:docs|ecosystem|api|components|data|source-assets|updates/field-notes)/(?:${roster.join('|')})(?:[/?#]|$)`);
  const files = (await walk(path.join(root, 'src'))).filter((file) => /\.(?:jsx?|tsx?|mjs|mdx?)$/.test(file));
  const offences = [];
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    offences.push(...publishedLinkOffences(relative, await readFile(file, 'utf8'), sourceRoute));
  }
  assert.deepEqual(offences, []);
  const published = await readFile(path.join(root, 'src', 'lib', 'published.ts'), 'utf8');
  assert.match(published, /export function localizeWebsiteHref[^]*?publishedHref\(localize\(publishedHref\(value\)\)\)/, 'the localization every experience, change and profile URL renders through applies the rule');
});
