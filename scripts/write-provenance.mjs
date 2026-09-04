import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {artifactFacts, canonicalJson, deploymentFromProvenance, sha256} from './artifact-contract.mjs';
import {bootstrapEnabled} from './source-lock-contract.mjs';
import {loadPublicationInputs} from './publication-inputs.mjs';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const allowBootstrap = bootstrapEnabled();
const inputs = await loadPublicationInputs({root, allowBootstrap});
const {lock, bootstrap} = inputs;
const lockBytes = inputs.sourceLockBytes;
const legacyRoutesBytes = await readFile(path.join(root, 'legacy-routes.json'));
const facts = await artifactFacts(build);
const websiteCommit = resolveWebsiteCommit({bootstrap, lockBytes, sourceSet: inputs.sourceSet});
const sourceCommits = Object.fromEntries(
  lock.sources.map((source) => [source.repository, source.commit]),
);
const provenance = inputs.mode === 'legacy'
  ? {
      schema: 'b10x-website-provenance/v1',
      websiteCommit,
      sourcesLockSha256: sha256(lockBytes),
      legacyRoutesSha256: sha256(legacyRoutesBytes),
      routesSha256: facts.routesSha256,
      artifactSha256: facts.artifactSha256,
      sourceCommits,
      routes: facts.routes,
      files: facts.files,
      ...(bootstrap ? {bootstrap: true} : {}),
    }
  : {
      schema: 'b10x-website-provenance/v2',
      websiteCommit,
      atlasControlCommit: inputs.sourceSet.atlasControlCommit,
      sourceSetSha256: inputs.sourceSetSha256,
      sourcesLockSha256: sha256(lockBytes),
      legacyRoutesSha256: sha256(legacyRoutesBytes),
      routesSha256: facts.routesSha256,
      artifactSha256: facts.artifactSha256,
      sourceCommits,
      sourceBundles: Object.fromEntries(inputs.sourceSet.sources.map((source) => {
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
      })),
      routes: facts.routes,
      files: facts.files,
    };
const document = canonicalJson(provenance);
const deployment = canonicalJson(deploymentFromProvenance(provenance));
await Promise.all([
  mkdir(path.join(build, '.well-known'), {recursive: true}),
  mkdir(path.join(build, '._b10x'), {recursive: true}),
]);
await Promise.all([
  writeFile(path.join(build, 'PROVENANCE.json'), document),
  writeFile(path.join(build, '.well-known', 'b10x-docs.json'), document),
  writeFile(path.join(build, '._b10x', 'deployment.json'), deployment),
]);
process.stdout.write(`wrote ${bootstrap ? 'bootstrap' : 'production'} provenance for ${facts.files.length} files and ${facts.routes.length} routes\n`);

function resolveWebsiteCommit({bootstrap, lockBytes, sourceSet}) {
  const candidate = process.env.GITHUB_SHA ?? gitCommit();
  if (/^[0-9a-f]{40}$/.test(candidate ?? '') && !/^0+$/.test(candidate)) {
    if (sourceSet && candidate !== sourceSet.websiteRuntimeCommit) {
      throw new Error(`source set Website runtime ${sourceSet.websiteRuntimeCommit} does not match build revision ${candidate}`);
    }
    return candidate;
  }
  if (!bootstrap) throw new Error('production provenance requires a non-zero full website commit');
  return sha256(Buffer.concat([Buffer.from('b10x-website-bootstrap\0'), lockBytes])).slice(0, 40);
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return undefined;
  }
}
