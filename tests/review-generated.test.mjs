import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {compile} from '@mdx-js/mdx';
import {findExtensionTrailingSlashLinks} from '../scripts/crawl-build.mjs';
import {markdownText} from '../scripts/ess-contract-reference.mjs';
import {quarantineFixture} from './helpers/quarantine-fixture.mjs';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const origin = 'https://beyond10x.github.io';

function environmentFor(fixture) {
  const environment = {...process.env, B10X_DOCS_SOURCE_SET: fixture.sourceSetPath};
  delete environment.B10X_BOOTSTRAP_FIXTURE;
  delete environment.B10X_SOURCE_WORKSPACE;
  delete environment.B10X_GENERATION_LEASE_TOKEN;
  return environment;
}

async function prepare(fixture) {
  await exec(process.execPath, ['scripts/prepare-site.mjs'], {cwd: fixture.websiteRoot, env: environmentFor(fixture)});
  return path.join(fixture.websiteRoot, '.generated');
}

// R1: a Markdown link Docusaurus resolves to a real static file is hashed into `/assets/files/...`
// and then `trailingSlash: true` appends `/`, 404ing on a host that serves exact static paths. The
// parsed artifact crawler normalizes that trailing slash away before checking existence, so it never
// saw this class of defect; findExtensionTrailingSlashLinks (scripts/crawl-build.mjs) is the added
// check that does.
test('findExtensionTrailingSlashLinks flags only a real file reached through a trailing slash', async (context) => {
  const build = await mkdtemp(path.join(os.tmpdir(), 'b10x-trailing-slash-'));
  context.after(() => rm(build, {recursive: true, force: true}));
  await mkdir(path.join(build, 'assets', 'files'), {recursive: true});
  await mkdir(path.join(build, 'data'), {recursive: true});
  await mkdir(path.join(build, 'docs', 'aep'), {recursive: true});
  await writeFile(path.join(build, 'assets', 'files', 'openapi-abc123.json'), '{}');
  await writeFile(path.join(build, 'data', 'foo.json'), '{}');
  await writeFile(path.join(build, 'docs', 'aep', 'index.html'), '<!doctype html><html><body>ok</body></html>');
  await writeFile(path.join(build, 'index.html'), [
    '<!doctype html><html><body>',
    '<a href="/assets/files/openapi-abc123.json/">Broken download</a>',
    '<a href="/data/foo.json">Good download</a>',
    '<a href="/data/missing.json/">Points nowhere, a different diagnostic\'s job</a>',
    '<a href="/docs/aep/">A real page route</a>',
    '</body></html>',
  ].join(''));
  const files = [
    {path: 'index.html'},
    {path: 'docs/aep/index.html'},
    {path: 'assets/files/openapi-abc123.json'},
    {path: 'data/foo.json'},
  ];
  const offenders = await findExtensionTrailingSlashLinks({build, origin, files});
  assert.deepEqual(offenders, [{page: '/', href: '/assets/files/openapi-abc123.json/'}]);
});

// R1: the two fixed generators must keep emitting an unprocessed `pathname://` link, not a plain
// absolute path Docusaurus would hash and then trailing-slash into a 404.
test('the specification and data download links stay unprocessed pathname:// links', async () => {
  const source = await readFile(path.join(root, 'scripts', 'prepare-site.mjs'), 'utf8');
  assert.match(source, /\[Download the canonical \$\{file\.kind === 'openapi' \? 'OpenAPI document' : 'JSON Schema'\}\]\(pathname:\/\/\/api\/\$\{relative\}\/\$\{rawName\}\)/);
  assert.match(source, /\[Download the canonical JSON data\]\(pathname:\/\/\/data\/\$\{file\.repository\}\/\$\{slug\}\.json\)/);
});

// R11: three /api/** pages shared the bare title "http-api | beyond10x" with no product qualifier.
test('a specification page title names its owning repository', async () => {
  const source = await readFile(path.join(root, 'scripts', 'prepare-site.mjs'), 'utf8');
  assert.match(source, /title: \$\{JSON\.stringify\(`\$\{file\.specificationId\} \| \$\{manifest\.repository\.displayName/);
});

// R9: /api, /components and /ecosystem had no sidebar (sidebarPath: false), and Docusaurus derives
// breadcrumbs from the active sidebar, so they also had no breadcrumb.
test('the api, component and ecosystem content-docs plugins keep a sidebar enabled', async () => {
  const config = await readFile(path.join(root, 'docusaurus.config.ts'), 'utf8');
  const pluginsBlock = config.slice(config.indexOf('plugins: ['), config.indexOf('staticDirectories:'));
  for (const id of ['ecosystem-profiles', 'component-data', 'api-reference']) {
    const block = pluginsBlock.slice(pluginsBlock.indexOf(`id: '${id}'`));
    const nextBlockEnd = block.indexOf('],');
    assert.doesNotMatch(block.slice(0, nextBlockEnd), /sidebarPath: false/, `${id} must not disable its sidebar`);
  }
});

// R4: /components/ rendered a fixed title and one sentence with zero links to its own child pages.
test('the components index lists and links every generated component/data page, or says there are none', async (context) => {
  const fixture = await quarantineFixture(context, {});
  const generated = await prepare(fixture);
  const indexMarkdown = await readFile(path.join(generated, 'components', 'index.md'), 'utf8');
  assert.match(indexMarkdown, /^# Public components and data$/m);
  // This fixture roster declares no openapi/json-schema/data source, so the honest empty state must
  // say so rather than silently rendering nothing.
  assert.match(indexMarkdown, /No repository currently publishes a component or data catalog\./);
});

test('source-controlled names on the components index compile to text, never to MDX expressions or JSX', async () => {
  const source = await readFile(path.join(root, 'scripts', 'prepare-site.mjs'), 'utf8');
  assert.match(source, /### \$\{markdownText\(items\[0\]\.repositoryDisplayName\)\}/);
  assert.match(source, /- \[\$\{markdownText\(item\.title\)\}\]/);
  for (const hostile of ['{String(1+1)}', '<img src="x" onerror="alert(1)">', 'a { b']) {
    const compiled = String(await compile(`### ${markdownText(hostile)}\n\n- [${markdownText(hostile)}](/components/x/)\n`));
    assert.doesNotMatch(compiled, /String\(1 \+ 1\)/);
    assert.doesNotMatch(compiled, /_jsx\("img"/);
  }
});
