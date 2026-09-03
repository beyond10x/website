import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {bootstrapEnabled, validateSourceLock} from './source-lock-contract.mjs';
import {claimGenerationLease, releaseGenerationLease} from './generation-lease.mjs';

const root = path.resolve(import.meta.dirname, '..');
const allowBootstrap = bootstrapEnabled();
const previewEnvironment = Object.keys(process.env).filter((name) => name === 'B10X_LOCAL_PREVIEW' || name.startsWith('B10X_PREVIEW_'));
if (previewEnvironment.length > 0) {
  throw new Error(`production gate refuses local-preview environment: ${previewEnvironment.sort().join(', ')}`);
}
const commands = [
  ['npm', ['run', 'sources:verify'], false],
  ['node', ['scripts/verify-bootstrap.mjs'], false],
  ['npm', ['run', 'validate:experiences'], false],
  ['npm', ['test'], true],
  ['npm', ['audit', '--audit-level=critical'], false],
  ['npm', ['run', 'prepare:site'], true],
  ['node', ['scripts/code-contract.mjs', 'source'], false],
  ['npm', ['run', 'typecheck'], false],
  ['npm', ['run', 'build:site'], true],
  ['npm', ['run', 'redirects:root'], false],
  ['node', ['scripts/verify-navigation.mjs'], false],
  ['node', ['scripts/code-contract.mjs', 'build'], false],
  ['npm', ['run', 'index:search'], false],
  ['node', ['--no-warnings', 'scripts/verify-search.mjs'], false],
  ['node', ['scripts/verify-navigation-layout.mjs'], false],
  ['node', ['scripts/write-effective-redirects.mjs'], false],
  ['node', ['scripts/crawl-build.mjs'], false],
  ['node', ['scripts/write-provenance.mjs'], false],
  ['node', ['scripts/verify-build.mjs'], false],
];

const lease = claimGenerationLease('production gate');
let exitCode = 0;
try {
  await validateSourceLock(root, {allowBootstrap});
  for (const [command, args, borrowLease] of commands) {
    const environment = {...process.env};
    delete environment.B10X_GENERATION_LEASE_TOKEN;
    if (borrowLease) environment.B10X_GENERATION_LEASE_TOKEN = lease.token;
    const result = spawnSync(command, args, {cwd: root, env: environment, stdio: 'inherit'});
    if (result.error) throw result.error;
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  releaseGenerationLease(lease);
}
process.exitCode = exitCode;
