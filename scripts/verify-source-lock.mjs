import path from 'node:path';
import {bootstrapEnabled, validateSourceLock} from './source-lock-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const allowBootstrap = bootstrapEnabled();
const result = await validateSourceLock(root, {allowBootstrap});
process.stdout.write(result.bootstrap
  ? 'source lock: explicit local bootstrap fixture\n'
  : `source lock: ${result.lock.sources.length} exact public repositories\n`);
