import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {devNull} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  claimGenerationLease,
  releaseGenerationLease,
  setGenerationLeaseChild,
} from './generation-lease.mjs';

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
  throw new Error('usage: node scripts/preview.mjs <dev|dev-fast|build> [Docusaurus arguments]');
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

export function generatedInputIssue(siteRoot = root) {
  const missing = missingGeneratedInputs(siteRoot);
  if (missing.length > 0) return `missing ${missing.join(', ')}`;
  let completion;
  try {
    completion = JSON.parse(readFileSync(path.join(siteRoot, '.generated', '.complete.json'), 'utf8'));
  } catch (error) {
    return `invalid .generated/.complete.json: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (completion?.schema !== 'b10x-website-generated-completion/v1'
    || typeof completion.sourceLockSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(completion.sourceLockSha256)) {
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

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const plan = previewPlan(mode, args);
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
    process.stderr.write(`[website preview] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
