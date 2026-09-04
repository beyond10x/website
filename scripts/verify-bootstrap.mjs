import path from 'node:path';
import {validateBootstrapSnapshots} from './bootstrap-contract.mjs';
import {bootstrapEnabled} from './source-lock-contract.mjs';
import {loadPublicationInputs} from './publication-inputs.mjs';

const root = path.resolve(import.meta.dirname, '..');
const inputs = await loadPublicationInputs({root, allowBootstrap: bootstrapEnabled()});
await validateBootstrapSnapshots(root, inputs.roster.repositories, {
  directory: inputs.bootstrapRoot,
  sourceLockBytes: inputs.sourceLockBytes,
  sourceSetSha256: inputs.sourceSetSha256,
  websiteRevision: inputs.sourceSet?.websiteRuntimeCommit,
  sourceRevision: inputs.sourceSet?.atlasControlCommit,
});
process.stdout.write('verified typed bootstrap ledgers and their pinned source snapshot\n');
