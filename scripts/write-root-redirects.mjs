import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {writeRootOwnedRedirects} from './root-redirect-contract.mjs';
import {loadPublicationInputs} from './publication-inputs.mjs';
import {bootstrapEnabled} from './source-lock-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const declared = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
const {quarantined} = await loadPublicationInputs({root, allowBootstrap: bootstrapEnabled()});
const map = await writeRootOwnedRedirects(path.join(root, 'build'), declared, {quarantined: new Set(quarantined.map((entry) => entry.repository))});
process.stdout.write(`materialized ${map.redirects.length} root-owned compatibility routes\n`);
