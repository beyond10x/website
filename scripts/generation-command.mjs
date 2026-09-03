import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {withGenerationLease} from './generation-lease.mjs';

const root = path.resolve(import.meta.dirname, '..');
const docusaurus = path.join(root, 'node_modules', '@docusaurus', 'core', 'bin', 'docusaurus.mjs');

function commandPlan(mode, extraArguments) {
  if (mode === 'build-site') {
    return {
      owner: 'site build',
      commands: [[process.execPath, [docusaurus, 'build', ...extraArguments], false]],
    };
  }
  if (mode === 'clear') {
    return {
      owner: 'site clear',
      commands: [[process.execPath, [docusaurus, 'clear', ...extraArguments], false]],
    };
  }
  if (mode === 'build') {
    if (extraArguments.length > 0) throw new Error('the complete build does not accept positional arguments');
    return {
      owner: 'complete site build',
      commands: [
        ['npm', ['run', 'prepare:site'], true],
        ['npm', ['run', 'build:site'], true],
        ['npm', ['run', 'redirects:root'], false],
        ['npm', ['run', 'verify:navigation'], false],
        ['npm', ['run', 'index:search'], false],
        ['npm', ['run', 'verify:search'], false],
        ['npm', ['run', 'redirects:effective'], false],
        ['npm', ['run', 'crawl'], false],
        [process.execPath, ['scripts/write-provenance.mjs'], false],
      ],
    };
  }
  throw new Error('usage: node scripts/generation-command.mjs <build|build-site|clear> [arguments]');
}

function childEnvironment(access, borrowLease) {
  const environment = {...process.env};
  delete environment.B10X_GENERATION_LEASE_TOKEN;
  if (borrowLease) environment.B10X_GENERATION_LEASE_TOKEN = access.token;
  return environment;
}

const [mode, ...extraArguments] = process.argv.slice(2);
try {
  const plan = commandPlan(mode, extraArguments);
  process.exitCode = await withGenerationLease(plan.owner, async (access) => {
    for (const [command, arguments_, borrowLease] of plan.commands) {
      const result = spawnSync(command, arguments_, {
        cwd: root,
        env: childEnvironment(access, borrowLease),
        stdio: 'inherit',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) return result.status ?? 1;
    }
    return 0;
  });
} catch (error) {
  process.stderr.write(`[website generation] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
