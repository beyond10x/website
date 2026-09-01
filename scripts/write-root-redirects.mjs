import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {writeRootOwnedRedirects} from './root-redirect-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const declared = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
const map = await writeRootOwnedRedirects(path.join(root, 'build'), declared);
process.stdout.write(`materialized ${map.redirects.length} root-owned compatibility routes\n`);
