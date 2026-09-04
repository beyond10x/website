import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertGenerationLeaseAccess,
  claimGenerationLease,
  releaseGenerationLease,
  withGenerationLease,
} from '../scripts/generation-lease.mjs';
import {generatedInputIssue, previewEnvironment, previewPlan} from '../scripts/preview.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('preview plans prepare once, preserve Docusaurus arguments, and make reuse explicit', () => {
  const args = ['--host', '127.0.0.1', '--port', '4310', '--no-open'];
  assert.deepEqual(previewPlan('dev', args), {
    prepare: true,
    reusedInputs: false,
    command: 'start',
    args,
  });
  assert.deepEqual(previewPlan('dev-fast', args), {
    prepare: false,
    reusedInputs: true,
    command: 'start',
    args,
  });
  assert.deepEqual(previewPlan('build', ['--no-minify']), {
    prepare: true,
    reusedInputs: false,
    command: 'build',
    args: ['--no-minify'],
  });
  assert.throws(() => previewPlan('gate'), /dev\|dev-fast\|build/);
});

test('fast preview accepts only a completed generated tree for the current source lock', async (context) => {
  const siteRoot = await mkdtemp(path.join(os.tmpdir(), 'b10x-website-generated-inputs-'));
  context.after(() => rm(siteRoot, {recursive: true, force: true}));
  const sourceLock = '{"schema":"test"}\n';
  await writeFile(path.join(siteRoot, 'sources.lock.json'), sourceLock);
  for (const relative of [
    '.generated/data/ecosystem.json',
    '.generated/data/experiences.json',
    '.generated/docs/index.mdx',
    '.generated/sidebars.cjs',
  ]) {
    const target = path.join(siteRoot, relative);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, 'prepared\n');
  }
  const completionPath = path.join(siteRoot, '.generated', '.complete.json');
  await writeFile(completionPath, `${JSON.stringify({
    schema: 'b10x-website-generated-completion/v1',
    sourceLockSha256: createHash('sha256').update(sourceLock).digest('hex'),
  })}\n`);
  assert.equal(generatedInputIssue(siteRoot), undefined);

  await writeFile(path.join(siteRoot, 'sources.lock.json'), '{"schema":"changed"}\n');
  assert.match(generatedInputIssue(siteRoot), /sources\.lock\.json changed/);
  await writeFile(completionPath, '{"schema":"invalid"}\n');
  assert.match(generatedInputIssue(siteRoot), /invalid \.generated\/\.complete\.json contract/);
  await rm(completionPath);
  assert.match(generatedInputIssue(siteRoot), /missing \.generated\/\.complete\.json/);
});

test('fast preview binds generated source-set inputs by exact bytes', async (context) => {
  const siteRoot = await mkdtemp(path.join(os.tmpdir(), 'b10x-website-generated-source-set-'));
  context.after(() => rm(siteRoot, {recursive: true, force: true}));
  const sourceSetPath = path.join(siteRoot, 'inputs', 'source-set.json');
  const sourceSet = '{"schema":"b10x-docs-source-set/v1"}\n';
  await mkdir(path.dirname(sourceSetPath), {recursive: true});
  await writeFile(sourceSetPath, sourceSet);
  for (const relative of [
    '.generated/data/ecosystem.json',
    '.generated/data/experiences.json',
    '.generated/docs/index.mdx',
    '.generated/sidebars.cjs',
  ]) {
    const target = path.join(siteRoot, relative);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, 'prepared\n');
  }
  const completionPath = path.join(siteRoot, '.generated', '.complete.json');
  await writeFile(completionPath, `${JSON.stringify({
    schema: 'b10x-website-generated-completion/v2',
    inputSchema: 'b10x-docs-source-set/v1',
    inputSha256: createHash('sha256').update(sourceSet).digest('hex'),
  })}\n`);
  const environment = {B10X_DOCS_SOURCE_SET: sourceSetPath};
  assert.equal(generatedInputIssue(siteRoot, environment), undefined);

  await writeFile(sourceSetPath, '{"schema":"changed"}\n');
  assert.match(generatedInputIssue(siteRoot, environment), /source-set\.json changed/);
});

test('preview server processes receive status metadata but no ambient credentials or lease capability', () => {
  const environment = previewEnvironment({
    PATH: '/usr/bin',
    B10X_SOURCE_WORKSPACE: '/workspace',
    GH_TOKEN: 'github-secret',
    GITHUB_TOKEN: 'actions-secret',
    NPM_TOKEN: 'npm-secret',
    B10X_GENERATION_LEASE_TOKEN: 'ambient-coordination-token',
    'NPM_CONFIG_//registry.npmjs.org/:_authToken': 'registry-secret',
    AWS_ACCESS_KEY_ID: 'cloud-secret',
    SOME_PRIVATE_KEY: 'private-key',
    GIT_ASKPASS: '/tmp/askpass',
    GIT_SSH_COMMAND: 'ssh -i /tmp/key',
    SSH_AUTH_SOCK: '/tmp/agent',
  }, {
    revision: 'f5b6cd1b48c0',
    treeState: 'dirty',
    reusedInputs: true,
  });

  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.B10X_SOURCE_WORKSPACE, '/workspace');
  assert.equal(environment.B10X_LOCAL_PREVIEW, '1');
  assert.equal(environment.B10X_PREVIEW_REVISION, 'f5b6cd1b48c0');
  assert.equal(environment.B10X_PREVIEW_TREE_STATE, 'dirty');
  assert.equal(environment.B10X_PREVIEW_REUSED_INPUTS, 'true');
  assert.equal(environment.B10X_GENERATION_LEASE_TOKEN, undefined);
  for (const name of [
    'GH_TOKEN', 'GITHUB_TOKEN', 'NPM_TOKEN', 'NPM_CONFIG_//registry.npmjs.org/:_authToken',
    'AWS_ACCESS_KEY_ID', 'SOME_PRIVATE_KEY',
    'GIT_ASKPASS', 'GIT_SSH_COMMAND', 'SSH_AUTH_SOCK',
  ]) assert.equal(environment[name], undefined, `${name} must not reach the preview child`);
});

test('preview and production generation cannot mutate one worktree concurrently', async (context) => {
  const leasePath = path.join(os.tmpdir(), `b10x-website-generation-test-${process.pid}-${Date.now()}.json`);
  context.after(() => rm(leasePath, {force: true}));
  const preview = claimGenerationLease('local dev-fast', leasePath);
  assert.throws(
    () => assertGenerationLeaseAccess('site preparation', leasePath),
    /already owned by local dev-fast/,
  );
  assert.throws(
    () => assertGenerationLeaseAccess('site preparation', leasePath, '00000000-0000-0000-0000-000000000000'),
    /already owned by local dev-fast/,
  );
  assert.doesNotThrow(
    () => assertGenerationLeaseAccess('site preparation', leasePath, preview.token),
  );
  assert.throws(
    () => claimGenerationLease('production gate', leasePath),
    /already owned by local dev-fast/,
  );
  releaseGenerationLease({...preview, token: '00000000-0000-0000-0000-000000000000'});
  assert.throws(
    () => claimGenerationLease('production gate', leasePath),
    /already owned by local dev-fast/,
  );
  releaseGenerationLease(preview);
  const gate = claimGenerationLease('production gate', leasePath);
  releaseGenerationLease(gate);
});

test('a direct mutator owns the lease for its full operation and children can only borrow its token', async (context) => {
  const leasePath = path.join(os.tmpdir(), `b10x-website-generation-operation-${process.pid}-${Date.now()}.json`);
  context.after(() => rm(leasePath, {force: true}));
  const result = await withGenerationLease('direct preparation', async (direct) => {
    assert.equal(direct.borrowed, false);
    assert.throws(
      () => claimGenerationLease('local dev', leasePath),
      /already owned by direct preparation/,
    );
    return withGenerationLease('nested source collection', async (nested) => {
      assert.equal(nested.borrowed, true);
      assert.equal(nested.token, direct.token);
      return 'complete';
    }, {leasePath, token: direct.token});
  }, {leasePath});
  assert.equal(result, 'complete');
  const preview = claimGenerationLease('local dev', leasePath);
  releaseGenerationLease(preview);
});

test('package scripts expose the bounded preview workflow and production origin cannot show its badge', async () => {
  const packageDocument = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageDocument.scripts.start, 'node scripts/preview.mjs dev');
  assert.equal(packageDocument.scripts.dev, 'node scripts/preview.mjs dev');
  assert.equal(packageDocument.scripts['dev:fast'], 'node scripts/preview.mjs dev-fast');
  assert.equal(packageDocument.scripts['preview:build'], 'node scripts/preview.mjs build');
  assert.equal(packageDocument.scripts.build, 'node scripts/generation-command.mjs build');
  assert.equal(packageDocument.scripts['build:site'], 'node scripts/generation-command.mjs build-site');
  assert.equal(packageDocument.scripts.clear, 'node scripts/generation-command.mjs clear');
  assert.equal(packageDocument.scripts['audit:code-rendering'], 'node scripts/code-contract.mjs source && node scripts/code-contract.mjs build');

  const config = await readFile(path.join(root, 'docusaurus.config.ts'), 'utf8');
  const rootTheme = await readFile(path.join(root, 'src/theme/Root.tsx'), 'utf8');
  const gate = await readFile(path.join(root, 'scripts/run-gate.mjs'), 'utf8');
  const preparation = await readFile(path.join(root, 'scripts/prepare-site.mjs'), 'utf8');
  const collection = await readFile(path.join(root, 'scripts/collect-sources.mjs'), 'utf8');
  const sourceLockUpdate = await readFile(path.join(root, 'scripts/update-source-lock.mjs'), 'utf8');
  const generation = await readFile(path.join(root, 'scripts/generation-command.mjs'), 'utf8');
  assert.match(config, /const localPreview = process\.env\.B10X_LOCAL_PREVIEW === '1'/);
  assert.match(config, /faster: localPreview \? false : undefined/);
  assert.match(rootTheme, /window\.location\.origin !== WEBSITE_ORIGIN/);
  assert.match(gate, /claimGenerationLease\('production gate'\)/);
  assert.match(gate, /releaseGenerationLease\(lease\)/);
  assert.match(gate, /production gate refuses local-preview environment/);
  assert.match(preparation, /withGenerationLease\('site preparation'/);
  assert.match(collection, /withGenerationLease\('source collection'/);
  assert.match(sourceLockUpdate, /withGenerationLease\('source lock update'/);
  assert.match(generation, /\['scripts\/code-contract\.mjs', 'source'\]/);
  assert.match(generation, /\['scripts\/code-contract\.mjs', 'build'\]/);
});
