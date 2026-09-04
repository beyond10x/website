import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts, canonicalJson, deploymentFromProvenance, sha256} from './artifact-contract.mjs';
import {compareUtf8} from './order-contract.mjs';
import {effectiveRedirectMap} from './redirect-contract.mjs';
import {bootstrapEnabled} from './source-lock-contract.mjs';
import {validateBootstrapSnapshots} from './bootstrap-contract.mjs';
import {resolvePublicationLayout} from './publication-layout.mjs';
import {loadPublicationInputs, SOURCE_SET_ENVIRONMENT} from './publication-inputs.mjs';

const root = path.resolve(import.meta.dirname, '..');
const options = parseArgs(process.argv.slice(2));
if (options.publication && options.artifact) throw new Error('--publication and --artifact are mutually exclusive');
if (options.websiteData && options.data) throw new Error('--website-data and --data are mutually exclusive');
const websiteRoot = path.resolve(options.websiteData ?? options.data ?? root);
const layout = options.publication ? await resolvePublicationLayout(path.resolve(options.publication)) : undefined;
const build = layout?.siteRoot ?? (options.artifact ? path.resolve(options.artifact) : path.join(root, 'build'));
const inputEnvironment = {...process.env};
if (layout?.sourceSetPath) {
  inputEnvironment[SOURCE_SET_ENVIRONMENT] = layout.sourceSetPath;
  delete inputEnvironment.B10X_BOOTSTRAP_FIXTURE;
  delete inputEnvironment.B10X_SOURCE_WORKSPACE;
} else if (layout?.schema === 'b10x-publication-layout/v1') {
  delete inputEnvironment[SOURCE_SET_ENVIRONMENT];
  delete inputEnvironment.B10X_SOURCE_WORKSPACE;
}
const allowBootstrap = bootstrapEnabled(inputEnvironment);
const inputs = await loadPublicationInputs({root: websiteRoot, environment: inputEnvironment, allowBootstrap});
const {roster, lock, bootstrap} = inputs;
if (layout?.schema === 'b10x-publication-layout/v2' && inputs.mode !== 'source-set') {
  throw new Error('layout v2 requires source-set publication inputs');
}
if (layout?.schema === 'b10x-publication-layout/v1' && inputs.mode !== 'legacy') {
  throw new Error('legacy flat publication cannot select source-set inputs');
}
await validateBootstrapSnapshots(websiteRoot, roster.repositories, {
  directory: inputs.bootstrapRoot,
  sourceLockBytes: inputs.sourceLockBytes,
  sourceSetSha256: inputs.sourceSetSha256,
  websiteRevision: inputs.sourceSet?.websiteRuntimeCommit,
  sourceRevision: inputs.sourceSet?.atlasControlCommit,
});
const required = [
  'index.html',
  'vision/index.html',
  'start/index.html',
  'learn/index.html',
  'build/index.html',
  'products/index.html',
  'start/spec-driven-development/index.html',
  'learn/safe-agentic-coding/index.html',
  'learn/from-principle-to-action/index.html',
  'build/agent-systems/index.html',
  'products/evaluate/index.html',
  'operate/index.html',
  'contribute/index.html',
  'updates/index.html',
  'journeys/index.html',
  'ecosystem/index.html',
  'changes/index.html',
  'engineering-protocols/index.html',
  'website/index.html',
  'PROVENANCE.json',
  '.well-known/b10x-docs.json',
  '.well-known/b10x-redirects.json',
  '._b10x/deployment.json',
  '._b10x/quality.json',
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
const provenanceSchema = inputs.mode === 'source-set' ? 'b10x-website-provenance/v2' : 'b10x-website-provenance/v1';
if (provenance.schema !== provenanceSchema) throw new Error(`invalid website provenance schema for ${inputs.mode} inputs`);
if (!/^[0-9a-f]{40}$/.test(provenance.websiteCommit) || /^0+$/.test(provenance.websiteCommit)) {
  throw new Error('website provenance has an invalid or zero commit');
}
if (options.websiteSha && provenance.websiteCommit !== options.websiteSha) {
  throw new Error(`website provenance names ${provenance.websiteCommit}, expected ${options.websiteSha}`);
}
if (inputs.sourceSet && provenance.websiteCommit !== inputs.sourceSet.websiteRuntimeCommit) {
  throw new Error('website provenance commit disagrees with the source set runtime');
}
if (provenance.bootstrap === true !== bootstrap) throw new Error('provenance bootstrap state disagrees with the validated source lock');
const expectedProvenanceKeys = (inputs.mode === 'source-set'
  ? [
      'schema', 'websiteCommit', 'atlasControlCommit', 'sourceSetSha256', 'sourcesLockSha256',
      'legacyRoutesSha256', 'routesSha256', 'artifactSha256', 'sourceCommits', 'sourceBundles',
      'routes', 'files',
    ]
  : [
      'schema', 'websiteCommit', 'sourcesLockSha256', 'legacyRoutesSha256', 'routesSha256',
      'artifactSha256', 'sourceCommits', 'routes', 'files', ...(bootstrap ? ['bootstrap'] : []),
    ]).sort(compareUtf8);
if (Object.keys(provenance).sort(compareUtf8).join('\n') !== expectedProvenanceKeys.join('\n')) {
  throw new Error('website provenance has unexpected or missing fields');
}

const lockBytes = inputs.sourceLockBytes;
if (provenance.sourcesLockSha256 !== sha256(lockBytes)) throw new Error('provenance source-lock digest does not match sources.lock.json bytes');
if (inputs.sourceSet) {
  if (provenance.sourceSetSha256 !== inputs.sourceSetSha256
    || provenance.atlasControlCommit !== inputs.sourceSet.atlasControlCommit) {
    throw new Error('provenance does not identify the exact source set and Atlas control revision');
  }
  const expectedBundles = Object.fromEntries(inputs.sourceSet.sources.map((source) => {
    const bundle = inputs.bundles.get(source.repository).document;
    return [source.repository, {
      bundleSha256: source.bundleSha256,
      commit: bundle.commit,
      producerRunId: source.producerRunId,
      producerRunAttempt: source.producerRunAttempt,
      artifactId: source.artifactId,
      artifactDigest: source.artifactDigest,
      manifestSha256: bundle.manifestSha256,
      collectionSha256: bundle.collectionSha256,
      contentSha256: bundle.contentSha256,
    }];
  }));
  if (canonicalJson(provenance.sourceBundles) !== canonicalJson(expectedBundles)) {
    throw new Error('provenance source bundles do not exactly match source-set inputs');
  }
}
const legacyRoutesBytes = await readFile(path.join(websiteRoot, 'legacy-routes.json'));
if (provenance.legacyRoutesSha256 !== sha256(legacyRoutesBytes)) throw new Error('provenance legacy-route digest does not match legacy-routes.json bytes');
const expectedCommits = Object.fromEntries(lock.sources.map((source) => [source.repository, source.commit]));
if (canonicalJson(provenance.sourceCommits) !== canonicalJson(expectedCommits)) throw new Error('provenance source commits do not exactly match the source lock');
if (!bootstrap && Object.keys(provenance.sourceCommits).length !== roster.repositories.length) {
  throw new Error(`production provenance must contain exactly ${roster.repositories.length} source commits from sources.yaml`);
}

const facts = await artifactFacts(build);
const privateBenchRoutes = facts.routes.filter((route) => (
  route === '/bench/'
  || route.startsWith('/api/bench/')
  || route.startsWith('/components/bench/')
  || route.startsWith('/docs/bench/')
  || route.startsWith('/ecosystem/bench/')
));
if (privateBenchRoutes.length > 0 || Object.hasOwn(provenance.sourceCommits, 'bench')) {
  throw new Error(`private Bench material entered the public artifact: ${privateBenchRoutes.join(', ') || 'source commit'}`);
}
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

const quality = JSON.parse(await readFile(path.join(build, '._b10x', 'quality.json'), 'utf8'));
if (quality.schema !== 'b10x-website-quality/v1' || quality.status !== 'passed' || quality.diagnostics.length !== 0) {
  throw new Error('website quality report is absent, failed, or contains diagnostics');
}

process.stdout.write(`verified ${facts.routes.length} routes, ${facts.files.length} files, and ${bootstrap ? 'bootstrap' : 'production'} ${layout?.schema ?? inputs.inputSchema} deployment agreement\n`);

function parseArgs(args) {
  const result = {};
  const allowed = new Set(['artifact', 'data', 'publication', 'website-data', 'website-sha']);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || !value || !allowed.has(name.slice(2))) {
      throw new Error('usage: verify-build [--publication <directory> | --artifact <directory>] [--website-data <website-directory> | --data <website-directory>] [--website-sha <sha>]');
    }
    result[name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (result.websiteSha && (!/^[0-9a-f]{40}$/.test(result.websiteSha) || /^0+$/.test(result.websiteSha))) {
    throw new Error('website-sha must be a non-zero full commit');
  }
  return result;
}
