import path from 'node:path';
import {bootstrapEnabled} from './source-lock-contract.mjs';
import {loadPublicationInputs} from './publication-inputs.mjs';

const root = path.resolve(import.meta.dirname, '..');
const allowBootstrap = bootstrapEnabled();
const result = await loadPublicationInputs({root, allowBootstrap});
process.stdout.write(result.bootstrap
  ? 'source lock: explicit local bootstrap fixture\n'
  : `${result.mode === 'source-set' ? 'source set' : 'source lock'}: ${result.lock.sources.length} exact public repositories\n`);
