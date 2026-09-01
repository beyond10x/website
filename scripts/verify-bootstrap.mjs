import path from 'node:path';
import {validateBootstrapSnapshots} from './bootstrap-contract.mjs';
import {validateSourceLock} from './source-lock-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const {roster} = await validateSourceLock(root, {allowBootstrap: true});
await validateBootstrapSnapshots(root, roster.repositories);
process.stdout.write('verified typed bootstrap ledgers and their pinned source snapshot\n');
