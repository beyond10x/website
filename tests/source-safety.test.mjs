import assert from 'node:assert/strict';
import {execFile as execFileCallback} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {parse as parseYaml} from 'yaml';
import test from 'node:test';
import {assertPassiveMdx} from '@beyond10x/docs-system/collector';
import {artifactFacts, sha256} from '../scripts/artifact-contract.mjs';
import {validateBootstrapSnapshots} from '../scripts/bootstrap-contract.mjs';
import {credentialFreeGitEnvironment, credentialFreeRepositoryUrl, declaredAnchors, extractDeclaredSource, isCollectableManifestSchema, resolveCommit, resolveWorkspaceCommit, safeTreePath, sourceWorkspaceFromEnvironment, staticPrefix} from '../scripts/git-source.mjs';
import {sourceKey, sourceMap} from '../scripts/source-routing.mjs';

const execFile = promisify(execFileCallback);

test('static source anchors bound wildcard extraction without changing glob semantics', () => {
  assert.equal(staticPrefix('README.md'), 'README.md');
  assert.equal(staticPrefix('website/docs/**/*.md'), 'website/docs');
  assert.equal(staticPrefix('*.md'), '.');
  assert.deepEqual(
    declaredAnchors({
      surfaces: [{source: {root: '.', documents: {include: ['README.md', 'website/docs/**/*.md']}, specifications: [{path: 'openapi.json'}]}}],
    }),
    ['README.md', 'openapi.json', 'website/docs'],
  );
});

test('repository paths cannot escape or switch separator conventions', () => {
  assert.equal(safeTreePath('website/docs/index.md'), 'website/docs/index.md');
  assert.throws(() => safeTreePath('../private.md'), /escapes/);
  assert.throws(() => safeTreePath('/absolute.md'), /unsafe/);
  assert.throws(() => safeTreePath('website\\docs\\index.md'), /unsafe/);
});

test('source locking accepts explicit v3 compatibility and v4 experience manifests', () => {
  assert.equal(isCollectableManifestSchema('b10x-docs/v3'), true);
  assert.equal(isCollectableManifestSchema('b10x-docs/v4'), true);
  assert.equal(isCollectableManifestSchema('b10x-docs/v2'), false);
});

test('production source Git cannot inherit private URL rewrites or developer credentials', () => {
  const sanitized = credentialFreeGitEnvironment({
    PATH: '/usr/bin',
    GIT_CONFIG_GLOBAL: '/tmp/developer.gitconfig',
    GIT_CONFIG_SYSTEM: '/tmp/system.gitconfig',
    GIT_CONFIG_PARAMETERS: "'url.ssh://git@github.com/.insteadOf'='https://anonymous:@github.com/'",
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'url.ssh://git@github.com/.insteadOf',
    GIT_CONFIG_VALUE_0: 'https://anonymous:@github.com/',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: '!private-helper',
    GIT_ASKPASS: '/tmp/private-askpass',
    GIT_COMMON_DIR: '/tmp/private-common.git',
    GIT_DIR: '/tmp/private-repository.git',
    GIT_WORK_TREE: '/tmp/private-worktree',
    GIT_SSH_COMMAND: 'ssh -i /tmp/private-key',
    SSH_ASKPASS: '/tmp/private-ssh-askpass',
    SSH_AUTH_SOCK: '/tmp/private-agent.sock',
    NETRC: '/tmp/private-netrc',
  });
  assert.equal(sanitized.PATH, '/usr/bin');
  assert.equal(sanitized.GIT_CONFIG_GLOBAL, os.devNull);
  assert.equal(sanitized.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(sanitized.GIT_TERMINAL_PROMPT, '0');
  assert.equal(sanitized.GCM_INTERACTIVE, 'Never');
  assert.equal(sanitized.NETRC, os.devNull);
  assert.equal(sanitized.SSH_ASKPASS_REQUIRE, 'never');
  for (const key of [
    'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
    'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_1', 'GIT_ASKPASS', 'GIT_SSH_COMMAND',
    'GIT_COMMON_DIR', 'GIT_DIR', 'GIT_WORK_TREE', 'SSH_ASKPASS', 'SSH_AUTH_SOCK',
  ]) assert.equal(sanitized[key], undefined, `${key} must not cross the publication boundary`);
});

test('production Git transports canonical source identities with explicit anonymous credentials', () => {
  assert.equal(
    credentialFreeRepositoryUrl('https://github.com/beyond10x/aep'),
    'https://anonymous:@github.com/beyond10x/aep.git',
  );
  assert.throws(() => credentialFreeRepositoryUrl('https://github.com/example/private'), /outside the public beyond10x allowlist/);
});

test('remote source resolution applies the credential-free boundary to the Git process', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-remote-source-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  const bin = path.join(directory, 'bin');
  await mkdir(bin, {recursive: true});
  await writeFile(path.join(bin, 'git'), [
    '#!/usr/bin/env node',
    "import assert from 'node:assert/strict';",
    "assert.deepEqual(process.argv.slice(2, 12), ['-c', 'credential.helper=', '-c', 'credential.interactive=false', '-c', 'core.askPass=', '-c', 'http.extraHeader=', '-c', 'http.proactiveAuth=none']);",
    "assert.equal(process.env.GIT_CONFIG_GLOBAL, '/dev/null');",
    "assert.equal(process.env.GIT_CONFIG_NOSYSTEM, '1');",
    "assert.equal(process.env.GIT_TERMINAL_PROMPT, '0');",
    "assert.equal(process.env.NETRC, '/dev/null');",
    "assert.equal(process.env.GIT_CONFIG_COUNT, undefined);",
    "assert.equal(process.env.GIT_ASKPASS, undefined);",
    "assert.equal(process.env.GIT_SSH_COMMAND, undefined);",
    "assert.equal(process.env.SSH_AUTH_SOCK, undefined);",
    "assert.ok(process.argv.includes('https://anonymous:@github.com/beyond10x/aep.git'));",
    `process.stdout.write('${'a'.repeat(40)}\\trefs/heads/main\\n');`,
    '',
  ].join('\n'), {mode: 0o755});
  const commit = await resolveCommit(
    'https://github.com/beyond10x/aep',
    'refs/heads/main',
    {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GIT_CONFIG_GLOBAL: '/tmp/developer.gitconfig',
      GIT_CONFIG_PARAMETERS: "'url.ssh://git@github.com/.insteadOf'='https://anonymous:@github.com/'",
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'url.ssh://git@github.com/.insteadOf',
      GIT_CONFIG_VALUE_0: 'https://anonymous:@github.com/',
      GIT_ASKPASS: '/tmp/private-askpass',
      GIT_COMMON_DIR: '/tmp/private-common.git',
      GIT_SSH_COMMAND: 'ssh -i /tmp/private-key',
      SSH_AUTH_SOCK: '/tmp/private-agent.sock',
      NETRC: '/tmp/private-netrc',
    },
  );
  assert.equal(commit, 'a'.repeat(40));
});

test('production extraction refuses URL rewrites planted in its persistent object cache', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-source-cache-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  const bare = path.join(directory, 'objects', 'aep.git');
  await mkdir(path.dirname(bare), {recursive: true});
  await testGit(directory, ['init', '--bare', bare]);
  await testGit(directory, [
    `--git-dir=${bare}`,
    'config',
    'url.file:///tmp/private-aep.git.insteadOf',
    'https://anonymous:@github.com/beyond10x/aep.git',
  ]);
  await assert.rejects(extractDeclaredSource({
    repository: 'aep',
    url: 'https://github.com/beyond10x/aep',
    commit: 'a'.repeat(40),
    manifestPath: 'b10x.docs.yaml',
    cacheRoot: directory,
  }), /unsupported local Git configuration: url\.file:\/\/\/tmp\/private-aep\.git\.insteadof/);
});

test('local preview collection extracts the locked Git object and ignores dirty checkout bytes', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-local-source-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  const workspace = path.join(directory, 'workspace');
  const repositoryRoot = path.join(workspace, 'aep');
  await mkdir(repositoryRoot, {recursive: true});
  await testGit(repositoryRoot, ['init']);
  await testGit(repositoryRoot, ['config', 'user.name', 'Website Test']);
  await testGit(repositoryRoot, ['config', 'user.email', 'website-test@example.invalid']);
  await testGit(repositoryRoot, ['branch', '-M', 'main']);
  await testGit(repositoryRoot, ['remote', 'add', 'origin', 'https://github.com/beyond10x/aep.git']);
  await writeFile(path.join(repositoryRoot, 'b10x.docs.yaml'), [
    'schema: b10x-docs/v3',
    'repository:',
    '  id: aep',
    '  displayName: AEP',
    '  url: https://github.com/beyond10x/aep',
    'surfaces:',
    '  - id: docs',
    '    name: AEP',
    '    kind: foundation',
    '    source:',
    '      root: .',
    '      documents:',
    '        include:',
    '          - README.md',
    '',
  ].join('\n'));
  await writeFile(path.join(repositoryRoot, 'README.md'), 'committed public documentation\n');
  await testGit(repositoryRoot, ['add', 'b10x.docs.yaml', 'README.md']);
  await testGit(repositoryRoot, ['commit', '-m', 'fixture']);
  const {stdout} = await testGit(repositoryRoot, ['rev-parse', 'HEAD']);
  const commit = stdout.trim();
  assert.equal(await resolveWorkspaceCommit(workspace, 'aep'), commit);
  await writeFile(path.join(repositoryRoot, 'README.md'), 'dirty private preview bytes\n');
  await assert.rejects(resolveWorkspaceCommit(workspace, 'aep'), /must be clean/);

  const extracted = await extractDeclaredSource({
    repository: 'aep',
    url: 'https://github.com/beyond10x/aep',
    commit,
    manifestPath: 'b10x.docs.yaml',
    cacheRoot: path.join(directory, 'cache'),
    sourceWorkspace: workspace,
  });
  assert.equal(await readFile(path.join(extracted.treeRoot, 'README.md'), 'utf8'), 'committed public documentation\n');
  assert.equal(await readFile(path.join(repositoryRoot, 'README.md'), 'utf8'), 'dirty private preview bytes\n');
  await assert.rejects(extractDeclaredSource({
    repository: 'aep',
    url: 'https://github.com/beyond10x/aep',
    commit: 'f'.repeat(40),
    manifestPath: 'b10x.docs.yaml',
    cacheRoot: path.join(directory, 'missing-cache'),
    sourceWorkspace: workspace,
  }), /is not available as an exact Git object/);
  assert.equal(sourceWorkspaceFromEnvironment({B10X_SOURCE_WORKSPACE: workspace}), workspace);
  assert.throws(() => sourceWorkspaceFromEnvironment({B10X_SOURCE_WORKSPACE: 'relative/workspace'}), /must be an absolute directory/);
});

test('public MDX is passive data with an explicit component allowlist', () => {
  assert.doesNotThrow(() => assertPassiveMdx('# Safe\n\n```js\nexport const example = true\n```', 'safe.md'));
  assert.throws(() => assertPassiveMdx("import Secret from './secret'", 'unsafe.mdx'), /import or export/);
  assert.throws(() => assertPassiveMdx('Hello {runSecret()}', 'unsafe.mdx'), /MDX expression/);
  assert.throws(() => assertPassiveMdx('<Widget />', 'unsafe.mdx'), /undeclared shared component/);
  assert.doesNotThrow(() => assertPassiveMdx('<Diagram />', 'safe.mdx', ['Diagram']));
  assert.throws(() => assertPassiveMdx('<iframe src="https://example.com" />', 'unsafe.mdx'), /forbidden HTML/);
});

test('identical source paths remain scoped to their owning repository', () => {
  const routes = sourceMap(
    [
      {repository: 'aep', sourcePath: 'README.md'},
      {repository: 'ess', sourcePath: 'README.md'},
    ],
    (file) => `/docs/${file.repository}/`,
  );
  assert.equal(routes.get(sourceKey('aep', 'README.md')), '/docs/aep/');
  assert.equal(routes.get(sourceKey('ess', 'README.md')), '/docs/ess/');
  assert.equal(routes.size, 2);
});

test('artifact provenance rejects symbolic links and non-regular entries', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-artifact-contract-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html>');
  await symlink('index.html', path.join(directory, 'alias.html'));
  await assert.rejects(artifactFacts(directory), /artifact contains symbolic link .*alias\.html/);

  await rm(path.join(directory, 'alias.html'));
  const socket = path.join(directory, 'artifact.sock');
  const server = createServer();
  context.after(() => server.close());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, resolve);
  });
  await assert.rejects(artifactFacts(directory), /artifact contains non-regular entry .*artifact\.sock/);
});

test('artifact files and routes use explicit UTF-8 byte order', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-artifact-order-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  await writeFile(path.join(directory, 'a.html'), 'lowercase');
  await writeFile(path.join(directory, 'VISION.html'), 'uppercase');

  const facts = await artifactFacts(directory);
  assert.deepEqual(facts.files.map((file) => file.path), ['VISION.html', 'a.html']);
  assert.deepEqual(facts.routes, ['/VISION.html', '/a.html']);
});

test('artifact provenance rejects Git control files', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'b10x-artifact-git-control-'));
  context.after(() => rm(directory, {recursive: true, force: true}));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html>');
  await writeFile(path.join(directory, '.gitignore'), '*');
  await assert.rejects(artifactFacts(directory), /forbidden Git metadata/);
});

test('bootstrap snapshots accept the Website surface and bind the exact source lock', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'b10x-bootstrap-contract-'));
  context.after(() => rm(root, {recursive: true, force: true}));
  const directory = path.join(root, 'data', 'bootstrap');
  await mkdir(directory, {recursive: true});

  const sourceLock = Buffer.from(`${JSON.stringify({schema: 'b10x-sources/v1', sources: []}, null, 2)}\n`);
  const websitePublishedAt = '2026-09-03T07:44:06Z';
  const websiteReleaseUrl = 'https://github.com/beyond10x/website/releases/tag/0.3.0';
  const snapshots = {
    'changes.json': Buffer.from(`${JSON.stringify({
      schema: 'b10x-change-ledger/v1',
      changes: [{
        key: 'website/0.3.0',
        repository: 'website',
        publishedAt: websitePublishedAt,
        source: {url: websiteReleaseUrl},
      }],
    }, null, 2)}\n`),
    'ecosystem.json': Buffer.from(`${JSON.stringify({
      schema: 'b10x-docs-registry/v2',
      surfaces: [{
        id: 'docs',
        name: 'Website',
        summary: 'Unified ecosystem entry point.',
        repository: {id: 'website', url: 'https://github.com/beyond10x/website'},
      }],
    }, null, 2)}\n`),
    'release-facts.json': Buffer.from(`${JSON.stringify({
      schema: 'b10x-release-facts/v1',
      releases: [{
        repository: 'website',
        version: '0.3.0',
        publishedAt: websitePublishedAt,
        url: websiteReleaseUrl,
      }],
    }, null, 2)}\n`),
  };
  await writeFile(path.join(root, 'sources.lock.json'), sourceLock);
  for (const [name, bytes] of Object.entries(snapshots)) await writeFile(path.join(directory, name), bytes);
  await writeFile(path.join(directory, 'metadata.json'), `${JSON.stringify({
    schema: 'b10x-bootstrap-snapshot/v1',
    sourceRevision: 'a'.repeat(40),
    websiteRevision: 'b'.repeat(40),
    sourceLockSha256: sha256(sourceLock),
    files: Object.fromEntries(Object.entries(snapshots).map(([name, bytes]) => [name, sha256(bytes)])),
  }, null, 2)}\n`);

  await assert.doesNotReject(validateBootstrapSnapshots(root, []));
  await writeFile(path.join(root, 'sources.lock.json'), `${JSON.stringify({schema: 'b10x-sources/v1', sources: [{repository: 'changed'}]}, null, 2)}\n`);
  await assert.rejects(validateBootstrapSnapshots(root, []), /source-lock digest/);
});

test('reusable façade workflow dual-reads legacy root state and stable route controls', async () => {
  const workflow = await readFile(path.join(path.resolve(import.meta.dirname, '..'), '.github', 'workflows', 'redirect-facade.yml'), 'utf8');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(workflow, /path: \.runtime/);
  assert.match(workflow, /path: \.control-data/);
  assert.match(workflow, /path: \.website-data/);
  assert.match(workflow, /--data \.\.\/\.website-data/);
  assert.match(workflow, /canonical_route:/);
  assert.match(workflow, /profile_route:/);
  assert.match(workflow, /migration_website_sha:/);
  assert.match(workflow, /test -z "\$CANONICAL_ROUTE" && test -z "\$PROFILE_ROUTE"/);
  assert.match(workflow, /--canonical-route "\$CANONICAL_ROUTE"/);
  assert.match(workflow, /--profile-route "\$PROFILE_ROUTE"/);
  assert.match(workflow, /--runtime-sha "\$RUNTIME_SHA"/);
  assert.match(workflow, /--control-sha "\$CONTROL_SHA"/);
  assert.match(workflow, /github\.triggering_actor == 'b10x-bot\[bot\]'/);
  assert.match(workflow, /github\.sha == inputs\.control_sha/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /\.committer\.login == "web-flow"/);
  assert.match(workflow, /\.commit\.verification\.verified == true/);
  assert.match(workflow, /\.commit\.verification\.reason == "valid"/);
  assert.match(workflow, /\.sha == \$revision/);
  assert.doesNotMatch(workflow, /--format='%P'/);
  assert.doesNotMatch(workflow, /\.parents \| length/);
  assert.doesNotMatch(workflow, /working-directory: \.website-data/);
});

test('reusable project-site workflow deploys one bot-authored build run and never repository code', async () => {
  const workflow = await readFile(path.join(path.resolve(import.meta.dirname, '..'), '.github', 'workflows', 'project-site.yml'), 'utf8');
  assert.match(workflow, /path: \.control-data/);
  assert.match(workflow, /github\.triggering_actor == 'b10x-bot\[bot\]'/);
  assert.match(workflow, /github\.sha == inputs\.control_sha/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /\.committer\.login == "web-flow"/);
  assert.match(workflow, /\.commit\.verification\.verified == true/);
  assert.match(workflow, /\.commit\.verification\.reason == "valid"/);
  // The run is selected by the commit being published, never supplied at dispatch.
  assert.doesNotMatch(workflow, /build_run_id:/);
  assert.match(workflow, /head_sha=\$CONTROL_SHA/);
  assert.match(workflow, /\.head_branch == "main"/);
  assert.match(workflow, /\.event == "push"/);
  assert.match(workflow, /\.conclusion == "success"/);
  assert.match(workflow, /run-id: \$\{\{ steps\.build\.outputs\.run_id \}\}/);
  // The runs API can list a finished run late, so the lookup is polled and names what it missed.
  assert.match(workflow, /attempts=30\n/);
  assert.match(workflow, /for attempt in \$\(seq 1 "\$attempts"\); do\n/);
  assert.match(workflow, /sleep 10\n/);
  assert.match(workflow, /for %s after %s attempts.*\n *"\$BUILD_WORKFLOW" "\$CONTROL_SHA" "\$attempts"/);
  assert.doesNotMatch(workflow, /test -n "\$run_id"/);
  // A job re-run must not meet the artifact of an earlier attempt, so the Pages artifact is named
  // per attempt and the upload and the deploy both use that one name.
  assert.match(workflow, /\n {6}PAGES_ARTIFACT: github-pages-\$\{\{ github\.run_attempt \}\}\n/);
  assert.match(workflow, /upload-pages-artifact@[0-9a-f]{40}\n *with:\n *name: \$\{\{ env\.PAGES_ARTIFACT \}\}\n/);
  assert.match(workflow, /deploy-pages@[0-9a-f]{40}\n *with:\n *artifact_name: \$\{\{ env\.PAGES_ARTIFACT \}\}\n/);
  // A site built for another base path answers 404 for every asset, so it is refused first.
  assert.match(workflow, /\.baseUrl == \$base/);
  assert.match(workflow, /b10x-project-site\/v1/);
  assert.match(workflow, /b10x-site-provenance\/v1/);
  assert.match(workflow, /test ! -e _site\/\.git/);
  // Nothing from the source repository is executed here.
  assert.doesNotMatch(workflow, /npm (ci|run|install)/);
  assert.doesNotMatch(workflow, /actions\/checkout@[0-9a-f]+\n *with:\n *repository: beyond10x\/website/);
  assert.doesNotMatch(workflow, /secrets: inherit/);
});

async function runPagesArtifactWait(responses) {
  const workflow = parseYaml(await readFile(path.join(path.resolve(import.meta.dirname, '..'), '.github', 'workflows', 'project-site.yml'), 'utf8'));
  const step = workflow.jobs.publish.steps.find((candidate) => candidate.name === 'Wait until the Pages artifact is listed');
  assert.ok(step, 'the wait step exists');
  const root = await mkdtemp(path.join(os.tmpdir(), 'b10x-pages-wait-'));
  try {
    const bin = path.join(root, 'bin');
    const temp = path.join(root, 'runner');
    await mkdir(path.join(temp, 'b10x-site-boundary'), {recursive: true});
    await mkdir(bin);
    for (const [index, response] of responses.entries()) {
      await writeFile(path.join(root, `response-${index + 1}.json`), JSON.stringify(response));
    }
    // The fake answers the n-th query with response n, and the last response from then on.
    await writeFile(path.join(bin, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
n=$(( $(cat "$FAKE_ROOT/calls" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$FAKE_ROOT/calls"
printf '%s\\n' "\${@: -1}" >> "$FAKE_ROOT/urls"
file="$FAKE_ROOT/response-$n.json"
[ -f "$file" ] || file="$FAKE_ROOT/response-${responses.length}.json"
cat "$file"
`, {mode: 0o755});
    await writeFile(path.join(bin, 'sleep'), '#!/usr/bin/env bash\necho "$1" >> "$FAKE_ROOT/sleeps"\n', {mode: 0o755});
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_ROOT: root,
      GITHUB_API_URL: 'https://api.example.test',
      GITHUB_REPOSITORY: 'beyond10x/example',
      GITHUB_TOKEN: 'fake',
      RUNNER_TEMP: temp,
      RUN_ID: '42',
      PAGES_ARTIFACT: 'github-pages-2',
    };
    const result = await execFile('bash', ['-e', '-c', step.run], {env}).then(
      ({stdout, stderr}) => ({code: 0, stdout, stderr}),
      (error) => ({code: error.code, stdout: error.stdout, stderr: error.stderr}),
    );
    const read = async (name) => (await readFile(path.join(root, name), 'utf8').catch(() => '')).split('\n').filter(Boolean);
    return {...result, calls: Number((await read('calls'))[0] ?? 0), urls: await read('urls'), sleeps: await read('sleeps')};
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

const pagesArtifact = (name, expired = false) => ({name, expired});

test('project-site deploy waits until the attempt artifact is listed', async () => {
  const result = await runPagesArtifactWait([
    {artifacts: []},
    {artifacts: []},
    {artifacts: [pagesArtifact('github-pages-1'), pagesArtifact('github-pages-2')]},
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.calls, 3);
  assert.deepEqual(result.sleeps, ['10', '10']);
  assert.equal(result.urls[0], 'https://api.example.test/repos/beyond10x/example/actions/runs/42/artifacts?name=github-pages-2&per_page=100');
});

test('project-site deploy wait is bounded and names the artifact and the attempt count', async () => {
  const result = await runPagesArtifactWait([{artifacts: [pagesArtifact('github-pages-2', true)]}]);
  assert.notEqual(result.code, 0);
  assert.equal(result.calls, 30);
  assert.equal(result.sleeps.length, 29);
  assert.match(result.stderr, /::error::Pages artifact github-pages-2 not listed in run 42 after 30 attempts/);
});

test('project-site deploy wait refuses two artifacts of one attempt name', async () => {
  const result = await runPagesArtifactWait([{artifacts: [pagesArtifact('github-pages-2'), pagesArtifact('github-pages-2')]}]);
  assert.notEqual(result.code, 0);
  assert.equal(result.calls, 1);
  assert.match(result.stderr, /::error::2 artifacts named github-pages-2 in run 42/);
});

test('reusable root workflow executes immutable controls and blocks human reruns', async () => {
  const workflow = await readFile(path.join(path.resolve(import.meta.dirname, '..'), '.github', 'workflows', 'deploy-root.yml'), 'utf8');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(workflow, /github\.triggering_actor == 'b10x-bot\[bot\]'/);
  assert.match(workflow, /github\.sha == inputs\.control_sha/);
  assert.match(workflow, /path: _publication/);
  assert.match(workflow, /publication-layout\.mjs resolve --publication _publication/);
  assert.match(workflow, /cargo run --locked --quiet --manifest-path \.runtime\/tools\/website\/Cargo\.toml -- --root \.runtime verify-build/);
  assert.match(workflow, /--publication _publication/);
  assert.match(workflow, /--website-data \.website-data/);
  assert.match(workflow, /path: \$\{\{ steps\.layout\.outputs\.site_path \}\}/);
  assert.match(workflow, /\.committer\.login == "web-flow"/);
  assert.match(workflow, /\.commit\.verification\.verified == true/);
  assert.match(workflow, /\.commit\.verification\.reason == "valid"/);
  assert.match(workflow, /\.sha == \$revision/);
  assert.doesNotMatch(workflow, /--format='%P'/);
  assert.doesNotMatch(workflow, /\.parents \| length/);
  assert.doesNotMatch(workflow, /working-directory: \.website-data/);
});

test('root verifier code runs without Pages authority and the deploy job builds nothing', async () => {
  const workflow = await readFile(path.join(path.resolve(import.meta.dirname, '..'), '.github', 'workflows', 'deploy-root.yml'), 'utf8');
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
  const verifyStart = jobs.indexOf('\n  verify:\n');
  const deployStart = jobs.indexOf('\n  deploy:\n');
  assert.ok(verifyStart > 0 && deployStart > verifyStart, 'verify precedes deploy');
  assert.deepEqual([...jobs.matchAll(/^  [a-z][a-z-]*:$/gm)].map((match) => match[0].trim()), ['verify:', 'deploy:']);
  const verify = jobs.slice(verifyStart, deployStart);
  const deploy = jobs.slice(deployStart);
  assert.match(verify, /    permissions:\n      contents: read\n    outputs:/);
  assert.doesNotMatch(verify, /pages: write|id-token: write|environment:/);
  assert.match(verify, /-- --root \.runtime verify-build/);
  assert.match(verify, /npm ci --ignore-scripts/);
  assert.match(deploy, /    needs: verify\n/);
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.match(deploy, /github\.triggering_actor == 'b10x-bot\[bot\]'/);
  assert.match(deploy, /ref: \$\{\{ inputs\.published_sha \}\}/);
  assert.match(deploy, /test "\$\(git -C _publication rev-parse HEAD\)" = "\$PUBLISHED_SHA"/);
  assert.match(deploy, /remote_head beyond10x\.github\.io published\)" = "\$PUBLISHED_SHA"/);
  assert.match(deploy, /remote_head beyond10x\.github\.io main\)" = "\$CONTROL_SHA"/);
  assert.match(deploy, /path: \$\{\{ steps\.layout\.outputs\.site_path \}\}/);
  assert.doesNotMatch(deploy, /cargo|npm|node |rust-toolchain|setup-node|\.runtime|\.website-data|github\.token/);
});

function testGit(repositoryRoot, args) {
  return execFile('git', ['-C', repositoryRoot, ...args], {encoding: 'utf8'});
}
