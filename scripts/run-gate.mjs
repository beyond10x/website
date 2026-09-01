import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {bootstrapEnabled, validateSourceLock} from './source-lock-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const allowBootstrap = bootstrapEnabled();
await validateSourceLock(root, {allowBootstrap});

const commands = [
  ['npm', ['run', 'sources:verify']],
  ['node', ['scripts/verify-bootstrap.mjs']],
  ['npm', ['test']],
  ['npm', ['audit', '--audit-level=critical']],
  ['npm', ['run', 'prepare:site']],
  ['node', ['scripts/code-contract.mjs', 'source']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build:site']],
  ['npm', ['run', 'redirects:root']],
  ['node', ['scripts/code-contract.mjs', 'build']],
  ['npm', ['run', 'index:search']],
  ['node', ['scripts/write-effective-redirects.mjs']],
  ['node', ['scripts/write-provenance.mjs']],
  ['node', ['scripts/verify-build.mjs']],
  ['node', ['scripts/crawl-build.mjs']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {cwd: root, env: process.env, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
