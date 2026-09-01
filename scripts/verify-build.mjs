import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts, canonicalJson, deploymentFromProvenance, sha256} from './artifact-contract.mjs';
import {bootstrapEnabled, validateSourceLock} from './source-lock-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const allowBootstrap = bootstrapEnabled();
const {lock, bootstrap} = await validateSourceLock(root, {allowBootstrap});
const required = [
  'index.html',
  'vision/index.html',
  'journeys/index.html',
  'ecosystem/index.html',
  'changes/index.html',
  'PROVENANCE.json',
  '.well-known/b10x-docs.json',
  '._b10x/deployment.json',
  '.well-known/b10x-compatibility-artifacts.json',
  'artifacts/ess/lab/billing_web_realized.wasm',
  'pagefind/pagefind.js',
];
await Promise.all(required.map((file) => access(path.join(build, file))));

const provenanceBytes = await readFile(path.join(build, 'PROVENANCE.json'));
const wellKnownBytes = await readFile(path.join(build, '.well-known', 'b10x-docs.json'));
if (!provenanceBytes.equals(wellKnownBytes)) throw new Error('root provenance copies differ byte-for-byte');
const provenance = JSON.parse(provenanceBytes);
if (provenance.schema !== 'b10x-website-provenance/v1') throw new Error('invalid website provenance schema');
if (!/^[0-9a-f]{40}$/.test(provenance.websiteCommit) || /^0+$/.test(provenance.websiteCommit)) {
  throw new Error('website provenance has an invalid or zero commit');
}
if (provenance.bootstrap === true !== bootstrap) throw new Error('provenance bootstrap state disagrees with the validated source lock');

const lockBytes = await readFile(path.join(root, 'sources.lock.json'));
if (provenance.sourcesLockSha256 !== sha256(lockBytes)) throw new Error('provenance source-lock digest does not match sources.lock.json bytes');
const legacyRoutesBytes = await readFile(path.join(root, 'legacy-routes.json'));
if (provenance.legacyRoutesSha256 !== sha256(legacyRoutesBytes)) throw new Error('provenance legacy-route digest does not match legacy-routes.json bytes');
const expectedCommits = Object.fromEntries(lock.sources.map((source) => [source.repository, source.commit]));
if (canonicalJson(provenance.sourceCommits) !== canonicalJson(expectedCommits)) throw new Error('provenance source commits do not exactly match the source lock');
if (!bootstrap && Object.keys(provenance.sourceCommits).length !== 19) throw new Error('production provenance must contain exactly 19 source commits');

const facts = await artifactFacts(build);
for (const property of ['artifactSha256', 'routesSha256']) {
  if (provenance[property] !== facts[property]) throw new Error(`provenance ${property} does not match the built artifact`);
}
if (canonicalJson(provenance.files) !== canonicalJson(facts.files)) throw new Error('provenance file inventory does not match the built artifact');
if (canonicalJson(provenance.routes) !== canonicalJson(facts.routes)) throw new Error('provenance route inventory does not match the built artifact');
if (facts.routes[0] !== '/' || new Set(facts.routes).size !== facts.routes.length) throw new Error('built route inventory is not unique and rooted');

const deploymentBytes = await readFile(path.join(build, '._b10x', 'deployment.json'), 'utf8');
const expectedDeployment = canonicalJson(deploymentFromProvenance(provenance));
if (deploymentBytes !== expectedDeployment) throw new Error('deployment metadata disagrees with the verified provenance');

const compatibility = JSON.parse(await readFile(path.join(build, '.well-known', 'b10x-compatibility-artifacts.json'), 'utf8'));
if (compatibility.schema !== 'b10x-compatibility-artifacts/v1' || compatibility.artifacts.length !== 1) {
  throw new Error('invalid compatibility artifact ledger');
}
const frozen = compatibility.artifacts[0];
if (frozen.path !== 'static/artifacts/ess/lab/billing_web_realized.wasm' || frozen.mediaType !== 'application/wasm') {
  throw new Error('unexpected frozen compatibility artifact declaration');
}
const frozenBytes = await readFile(path.join(build, frozen.path.replace(/^static\//, '')));
if (frozenBytes.byteLength !== frozen.size || sha256(frozenBytes) !== frozen.sha256) {
  throw new Error('frozen ESS compatibility artifact bytes disagree with their ledger');
}

process.stdout.write(`verified ${facts.routes.length} routes, ${facts.files.length} files, and ${bootstrap ? 'bootstrap' : 'production'} deployment agreement\n`);
