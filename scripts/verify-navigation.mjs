import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts} from './artifact-contract.mjs';
import {PRIMARY_ROUTE_MATRIX, verifyRenderedNavigation} from './navigation-contract.mjs';
import {loadPublicationInputs} from './publication-inputs.mjs';
import {effectiveRedirectMap} from './redirect-contract.mjs';
import {bootstrapEnabled} from './source-lock-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const declared = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
const build = path.join(root, 'build');
// With a source quarantined, a declared redirect into it resolves where the effective map sends it:
// the source's GitHub repository. Without one, the declared map is checked exactly as before.
const quarantined = new Set((await loadPublicationInputs({root, allowBootstrap: bootstrapEnabled()})).quarantined.map((entry) => entry.repository));
const redirects = quarantined.size ? effectiveRedirectMap(declared, await artifactFacts(build), {quarantined}) : declared;
const result = await verifyRenderedNavigation({build, redirects});
process.stdout.write(
  `verified ${result.linksChecked} rendered navigation links across ${result.documentCount} HTML pages; `
  + `${PRIMARY_ROUTE_MATRIX.length} primary destinations resolve\n`,
);
