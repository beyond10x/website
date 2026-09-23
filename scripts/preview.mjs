import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {devNull} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {
  claimGenerationLease,
  releaseGenerationLease,
  setGenerationLeaseChild,
} from './generation-lease.mjs';
import {
  PreviewEnvironmentError,
  PreviewInterruptedError,
  SOURCE_PREVIEW_GUARANTEE,
  SourceValidationError,
  adviseCrossSourceLinks,
  collectSnapshotSources,
  crossSourceLinks,
  obtainSnapshot,
  preparationError,
  previewDocuments,
  serveExitCode,
  snapshotRouteMap,
  sourcePreviewCacheRoot,
  stageSourceWorkingTree,
  stagingDirectory,
  websiteRevisionWarning,
  writePreviewInputs,
} from './source-preview.mjs';

const root = path.resolve(import.meta.dirname, '..');
const prepareSite = path.join(root, 'scripts', 'prepare-site.mjs');
const docusaurus = path.join(root, 'node_modules', '@docusaurus', 'core', 'bin', 'docusaurus.mjs');
const requiredGeneratedInputs = [
  '.generated/.complete.json',
  '.generated/data/ecosystem.json',
  '.generated/data/experiences.json',
  '.generated/docs/index.mdx',
  '.generated/sidebars.cjs',
];
const sensitiveEnvironmentName = /(?:access.?key|api.?key|auth|credentials?|password|passphrase|private.?key|secrets?|tokens?)/i;
const gitCredentialEnvironment = new Set([
  'GIT_ASKPASS',
  'GIT_CONFIG_PARAMETERS',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'NETRC',
  'SSH_ASKPASS',
  'SSH_AUTH_SOCK',
  'SSH_ENV',
]);

export function previewPlan(mode, args = []) {
  if (mode === 'dev') {
    return {prepare: true, reusedInputs: false, command: 'start', args};
  }
  if (mode === 'dev-fast') {
    return {prepare: false, reusedInputs: true, command: 'start', args};
  }
  if (mode === 'build') {
    return {prepare: true, reusedInputs: false, command: 'build', args};
  }
  if (mode === 'source') {
    return {prepare: true, reusedInputs: false, command: 'start', args, source: true};
  }
  throw new Error('usage: node scripts/preview.mjs <dev|dev-fast|build|source> [Docusaurus arguments]');
}

export function previewEnvironment(source, metadata) {
  const environment = {};
  for (const [name, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue;
    if (sensitiveEnvironmentName.test(name) || gitCredentialEnvironment.has(name)) continue;
    environment[name] = value;
  }
  return {
    ...environment,
    B10X_LOCAL_PREVIEW: '1',
    B10X_PREVIEW_REVISION: metadata.revision,
    B10X_PREVIEW_TREE_STATE: metadata.treeState,
    B10X_PREVIEW_REUSED_INPUTS: String(metadata.reusedInputs),
  };
}

export function missingGeneratedInputs(siteRoot = root) {
  return requiredGeneratedInputs.filter((relative) => !existsSync(path.join(siteRoot, relative)));
}

export function generatedInputIssue(siteRoot = root, environment = process.env) {
  const missing = missingGeneratedInputs(siteRoot);
  if (missing.length > 0) return `missing ${missing.join(', ')}`;
  let completion;
  try {
    completion = JSON.parse(readFileSync(path.join(siteRoot, '.generated', '.complete.json'), 'utf8'));
  } catch (error) {
    return `invalid .generated/.complete.json: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (completion?.schema === 'b10x-website-generated-completion/v1') {
    if (typeof completion.sourceLockSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(completion.sourceLockSha256)) {
      return 'invalid .generated/.complete.json contract';
    }
    let sourceLockSha256;
    try {
      sourceLockSha256 = createHash('sha256')
        .update(readFileSync(path.join(siteRoot, 'sources.lock.json')))
        .digest('hex');
    } catch (error) {
      return `cannot inspect sources.lock.json: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (completion.sourceLockSha256 !== sourceLockSha256) {
      return 'sources.lock.json changed after the last complete preparation';
    }
    return undefined;
  }
  if (completion?.schema !== 'b10x-website-generated-completion/v2'
    || !['b10x-docs-source-set/v1', 'b10x-docs-source-set/v2'].includes(completion.inputSchema)
    || typeof completion.inputSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(completion.inputSha256)) {
    return 'invalid .generated/.complete.json contract';
  }
  const sourceSet = environment.B10X_DOCS_SOURCE_SET;
  if (typeof sourceSet !== 'string' || !path.isAbsolute(sourceSet)) {
    return 'prepared source-set inputs require absolute B10X_DOCS_SOURCE_SET';
  }
  let inputSha256;
  try {
    inputSha256 = createHash('sha256').update(readFileSync(sourceSet)).digest('hex');
  } catch (error) {
    return `cannot inspect source-set.json: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (completion.inputSha256 !== inputSha256) {
    return 'source-set.json changed after the last complete preparation';
  }
  return undefined;
}

function gitOutput(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: devNull,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function repositoryMetadata(reusedInputs) {
  const revision = gitOutput(['rev-parse', '--verify', 'HEAD^{commit}']);
  const status = gitOutput(['status', '--porcelain=v1', '--untracked-files=all']);
  return {
    revision: revision && /^[0-9a-f]{40}$/.test(revision) ? revision.slice(0, 12) : 'unavailable',
    treeState: status === undefined ? 'unknown' : status.length > 0 ? 'dirty' : 'clean',
    reusedInputs,
  };
}

function runNode(module, args, environment, lease, lifecycle) {
  return new Promise((resolve, reject) => {
    if (lifecycle.signal) {
      resolve(lifecycle.signal === 'SIGINT' ? 130 : 143);
      return;
    }
    const child = spawn(process.execPath, [module, ...args], {
      cwd: root,
      env: environment,
      stdio: 'inherit',
    });
    lifecycle.child = child;
    let complete = false;
    const finish = (error, code, signal) => {
      if (complete) return;
      complete = true;
      if (lifecycle.child === child) lifecycle.child = undefined;
      if (error) reject(error);
      else if (lifecycle.signal === 'SIGINT' || signal === 'SIGINT') resolve(130);
      else if (lifecycle.signal === 'SIGTERM' || signal === 'SIGTERM') resolve(143);
      else resolve(code ?? 1);
    };
    child.once('error', (error) => finish(error));
    child.once('close', (code, signal) => finish(undefined, code, signal));
    try {
      setGenerationLeaseChild(lease, child.pid);
    } catch (error) {
      child.kill('SIGTERM');
      finish(error);
      return;
    }
    if (lifecycle.signal) child.kill(lifecycle.signal);
  });
}

export function sourcePreviewArguments(args, environment = process.env, cwd = process.cwd()) {
  const {tokens} = parseArgs({
    args,
    options: {source: {type: 'string'}, snapshot: {type: 'string'}},
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const consumed = new Set();
  const values = {};
  for (const token of tokens) {
    if (token.kind !== 'option' || !['source', 'snapshot'].includes(token.name)) continue;
    if (typeof token.value !== 'string') throw new PreviewEnvironmentError(`--${token.name} needs a directory`);
    values[token.name] = token.value;
    consumed.add(token.index);
    if (!token.inlineValue) consumed.add(token.index + 1);
  }
  const invokedByPackageScript = environment.npm_lifecycle_event === 'preview:source' && environment.INIT_CWD;
  return {
    sourceDirectory: path.resolve(values.source ?? (invokedByPackageScript ? environment.INIT_CWD : cwd)),
    snapshot: values.snapshot,
    docusaurusArgs: args.filter((_, index) => !consumed.has(index)),
  };
}

async function sourceMain(plan, lifecycle) {
  const say = (line) => process.stdout.write(`[source preview] ${line}\n`);
  say(SOURCE_PREVIEW_GUARANTEE);
  const options = sourcePreviewArguments(plan.args);
  const staging = stagingDirectory(root);
  let source;
  try {
    source = await stageSourceWorkingTree({sourceDirectory: options.sourceDirectory, websiteRoot: root, stagingRoot: staging});
  } catch (error) {
    await rm(staging, {recursive: true, force: true});
    throw error;
  }
  try {
    say(`${source.repository} · ${source.commit.slice(0, 12)} · ${source.treeState} · ${source.index.files.length} declared files pass per-source validation`);
    if (lifecycle.signal) throw new PreviewInterruptedError();
    const documents = await previewDocuments(source);
    const websiteHead = gitOutput(['rev-parse', '--verify', 'HEAD^{commit}']);
    const {snapshot, origin, warning} = await obtainSnapshot({
      override: options.snapshot,
      cacheDirectory: path.join(sourcePreviewCacheRoot(root), 'publication'),
      roster: source.roster,
      signal: lifecycle.abort.signal,
    });
    if (warning) say(warning);
    const {provenance} = snapshot;
    const routes = snapshotRouteMap(snapshot);
    say(`snapshot (${origin}) ${snapshot.directory} · Website ${provenance.websiteCommit.slice(0, 12)} · Atlas ${provenance.atlasControlCommit.slice(0, 12)} · ${Object.keys(provenance.sourceCommits).length} sources · ${routes.size} routes`);
    const revisionWarning = websiteRevisionWarning(provenance.websiteCommit, websiteHead);
    say(revisionWarning ?? `Website worktree ${websiteHead.slice(0, 12)} is the revision that published the snapshot`);
    if (!existsSync(docusaurus)) {
      throw new PreviewEnvironmentError('Docusaurus is not installed; run npm ci --ignore-scripts in the Website checkout first');
    }
    if (lifecycle.signal) throw new PreviewInterruptedError();
    const lease = claimGenerationLease(`source preview ${source.repository}`);
    try {
      const others = await collectSnapshotSources({
        snapshot,
        exclude: source.repository,
        cacheRoot: path.join(root, '.cache', 'sources'),
        signal: lifecycle.abort.signal,
      });
      say(`collected ${others.length} other sources at their published commits; each reproduces its published collection digest`);
      const {sourceSetPath} = await writePreviewInputs({
        websiteRoot: root,
        snapshot,
        source,
        others,
        outputRoot: path.join(sourcePreviewCacheRoot(root), 'inputs'),
      });
      await rm(staging, {recursive: true, force: true});

      const environment = previewEnvironment(process.env, {
        revision: source.commit.slice(0, 12),
        treeState: source.treeState,
        reusedInputs: false,
      });
      delete environment.B10X_SOURCE_WORKSPACE;
      delete environment.B10X_BOOTSTRAP_FIXTURE;
      environment.B10X_DOCS_SOURCE_SET = sourceSetPath;

      const prepareStatus = await runNode(prepareSite, [], {
        ...environment,
        B10X_GENERATION_LEASE_TOKEN: lease.token,
      }, lease, lifecycle);
      if (lifecycle.signal) throw new PreviewInterruptedError('interrupted during portal preparation');
      if (prepareStatus !== 0) {
        throw preparationError({
          repository: source.repository,
          status: prepareStatus,
          websiteCommit: provenance.websiteCommit,
          headCommit: websiteHead,
        });
      }

      const advice = adviseCrossSourceLinks(crossSourceLinks({
        repository: source.repository,
        roster: source.roster,
        documents,
      }), routes);
      const absent = advice.filter((entry) => entry.status === 'absent').length;
      say(`advisory: ${advice.length} links into other sources, ${advice.length - absent} in the snapshot route map, ${absent} absent`);
      for (const entry of advice) {
        say(`advisory: ${entry.status === 'resolves' ? 'resolves' : 'ABSENT  '} ${entry.document} → ${entry.target} ${entry.path}`);
      }
      say(`serving ${source.repository} at /docs/${source.repository}/ (stop with Ctrl-C)`);
      const status = await runNode(docusaurus, [plan.command, ...options.docusaurusArgs], environment, lease, lifecycle);
      return serveExitCode({status, signal: lifecycle.signal});
    } finally {
      releaseGenerationLease(lease);
    }
  } finally {
    await rm(staging, {recursive: true, force: true});
  }
}

async function withInterrupts(run) {
  const lifecycle = {child: undefined, signal: undefined, abort: new AbortController()};
  const interrupt = (signal) => {
    lifecycle.signal = lifecycle.signal ?? signal;
    lifecycle.abort.abort(new PreviewInterruptedError());
    if (lifecycle.child && lifecycle.child.exitCode === null && lifecycle.child.signalCode === null) {
      lifecycle.child.kill(signal);
    }
  };
  const onInterrupt = () => interrupt('SIGINT');
  const onTerminate = () => interrupt('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  try {
    return await run(lifecycle);
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  }
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const plan = previewPlan(mode, args);
  if (plan.source) return withInterrupts((lifecycle) => sourceMain(plan, lifecycle));
  if (!existsSync(docusaurus)) {
    throw new Error('Docusaurus is not installed; run npm ci --ignore-scripts first');
  }
  const lease = claimGenerationLease(`local ${mode}`);
  const lifecycle = {child: undefined, signal: undefined};
  const interrupt = (signal) => {
    lifecycle.signal = lifecycle.signal ?? signal;
    if (lifecycle.child && lifecycle.child.exitCode === null && lifecycle.child.signalCode === null) {
      lifecycle.child.kill(signal);
    }
  };
  const onInterrupt = () => interrupt('SIGINT');
  const onTerminate = () => interrupt('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  try {
    if (plan.reusedInputs) {
      const issue = generatedInputIssue();
      if (issue) throw new Error(`dev:fast needs complete prepared inputs; run npm run dev first (${issue})`);
    }
    const metadata = repositoryMetadata(plan.reusedInputs);
    const environment = previewEnvironment(process.env, metadata);
    const inputLabel = plan.reusedInputs
      ? 'REUSING generated inputs; source locks, manifests, and imported docs may be stale'
      : 'refreshing generated inputs once';
    process.stdout.write(`[website preview] ${metadata.revision} · ${metadata.treeState} · ${inputLabel}\n`);

    if (plan.prepare) {
      const prepareStatus = await runNode(prepareSite, [], {
        ...environment,
        B10X_GENERATION_LEASE_TOKEN: lease.token,
      }, lease, lifecycle);
      if (prepareStatus !== 0) return prepareStatus;
    }
    return await runNode(docusaurus, [plan.command, ...plan.args], environment, lease, lifecycle);
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    releaseGenerationLease(lease);
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof PreviewInterruptedError) {
      process.stderr.write(`[source preview] ${message}; the staging and fetch directories were removed\n`);
      // A snapshot extraction may still hold a Git child; do not wait on it.
      process.exit(130);
    } else if (error instanceof SourceValidationError) {
      process.stderr.write(`[source preview] ${error.repository} failed per-source validation: ${message}\n`);
      process.exitCode = 1;
    } else if (error instanceof PreviewEnvironmentError) {
      process.stderr.write(`[source preview] cannot start: ${message}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`[website preview] ${message}\n`);
      process.exitCode = process.argv[2] === 'source' ? 2 : 1;
    }
  }
}
