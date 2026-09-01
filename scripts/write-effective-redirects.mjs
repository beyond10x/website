import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts, canonicalJson} from './artifact-contract.mjs';
import {effectiveRedirectMap} from './redirect-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const declared = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
const {routes, files} = await artifactFacts(build);
const output = effectiveRedirectMap(declared, {routes, files});
await mkdir(path.join(build, '.well-known'), {recursive: true});
await writeFile(path.join(build, '.well-known', 'b10x-redirects.json'), canonicalJson(output));
process.stdout.write(`wrote ${output.redirects.length} effective compatibility routes; every target and alias exists\n`);
