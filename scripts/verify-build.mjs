import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts, canonicalJson, deploymentFromProvenance, sha256} from './artifact-contract.mjs';
import {compareUtf8} from './order-contract.mjs';
import {effectiveRedirectMap} from './redirect-contract.mjs';
import {bootstrapEnabled, validateSourceLock} from './source-lock-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const options = parseArgs(process.argv.slice(2));
const dataRoot = options.data ? path.resolve(options.data) : root;
const build = options.artifact ? path.resolve(options.artifact) : path.join(root, 'build');
const allowBootstrap = bootstrapEnabled();
const {lock, bootstrap} = await validateSourceLock(dataRoot, {allowBootstrap});
const required = [
  'index.html',
  'vision/index.html',
  'journeys/index.html',
  'ecosystem/index.html',
  'changes/index.html',
  'engineering-protocols/index.html',
  'website/index.html',
  'PROVENANCE.json',
  '.well-known/b10x-docs.json',
  '.well-known/b10x-redirects.json',
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
if (provenanceBytes.toString('utf8') !== canonicalJson(provenance)) throw new Error('website provenance is not canonical JSON');
if (provenance.schema !== 'b10x-website-provenance/v1') throw new Error('invalid website provenance schema');
if (!/^[0-9a-f]{40}$/.test(provenance.websiteCommit) || /^0+$/.test(provenance.websiteCommit)) {
  throw new Error('website provenance has an invalid or zero commit');
}
if (options.websiteSha && provenance.websiteCommit !== options.websiteSha) {
  throw new Error(`website provenance names ${provenance.websiteCommit}, expected ${options.websiteSha}`);
}
if (provenance.bootstrap === true !== bootstrap) throw new Error('provenance bootstrap state disagrees with the validated source lock');
const expectedProvenanceKeys = [
  'schema', 'websiteCommit', 'sourcesLockSha256', 'legacyRoutesSha256', 'routesSha256',
  'artifactSha256', 'sourceCommits', 'routes', 'files', ...(bootstrap ? ['bootstrap'] : []),
].sort(compareUtf8);
if (Object.keys(provenance).sort(compareUtf8).join('\n') !== expectedProvenanceKeys.join('\n')) {
  throw new Error('website provenance has unexpected or missing fields');
}

const lockBytes = await readFile(path.join(dataRoot, 'sources.lock.json'));
if (provenance.sourcesLockSha256 !== sha256(lockBytes)) throw new Error('provenance source-lock digest does not match sources.lock.json bytes');
const legacyRoutesBytes = await readFile(path.join(dataRoot, 'legacy-routes.json'));
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

const declaredRedirects = JSON.parse(legacyRoutesBytes);
const expectedRedirects = canonicalJson(effectiveRedirectMap(declaredRedirects, facts));
const effectiveRedirects = await readFile(path.join(build, '.well-known', 'b10x-redirects.json'), 'utf8');
if (effectiveRedirects !== expectedRedirects) {
  throw new Error('effective redirects are not the deterministic projection of legacy-routes.json and the artifact inventory');
}

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

function parseArgs(args) {
  const result = {};
  const allowed = new Set(['artifact', 'data', 'website-sha']);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || !value || !allowed.has(name.slice(2))) {
      throw new Error('usage: verify-build [--artifact <directory>] [--data <website-directory>] [--website-sha <sha>]');
    }
    result[name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (result.websiteSha && (!/^[0-9a-f]{40}$/.test(result.websiteSha) || /^0+$/.test(result.websiteSha))) {
    throw new Error('website-sha must be a non-zero full commit');
  }
  return result;
}
