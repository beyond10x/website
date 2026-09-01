import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {writeRedirectMap} from '@beyond10x/docs-system/redirects';
import {artifactFacts, canonicalJson, deploymentFromProvenance, sha256} from './artifact-contract.mjs';
import {validateSourceLock} from './source-lock-contract.mjs';
import {facadeRepositories, synthesizeFacadeRoutes} from './facade-contract.mjs';
import {compareUtf8} from './order-contract.mjs';
import {effectiveRedirectMap} from './redirect-contract.mjs';

const options = parseArgs(process.argv.slice(2));
const runtimeRoot = path.resolve(import.meta.dirname, '..');
const dataRoot = path.resolve(options.data ?? runtimeRoot);
const repository = options.repository;
if (!/^[a-z0-9][a-z0-9-]*$/.test(repository)) throw new Error(`invalid repository ${repository}`);
if (!/^[0-9a-f]{40}$/.test(options.websiteSha) || /^0+$/.test(options.websiteSha)) throw new Error('website-sha must be a non-zero full commit');
const {roster} = await validateSourceLock(dataRoot, {allowBootstrap: true});
if (!facadeRepositories(roster).includes(repository)) throw new Error(`${repository} is not in the active or compatibility-only façade roster`);

const output = path.resolve(options.out);
const globalMapBytes = await readFile(path.join(dataRoot, 'legacy-routes.json'));
const globalMap = JSON.parse(globalMapBytes);
const initialRoot = await fetchRootProvenance(globalMap.origin, options.websiteSha);
if (initialRoot.document.legacyRoutesSha256 !== sha256(globalMapBytes)) {
  throw new Error('checked-out legacy routes disagree with deployed root provenance');
}
const rootFiles = new Map(initialRoot.document.files.map((file) => [file.path, file]));
const effectiveBytes = await fetchVerifiedFile(globalMap.origin, '.well-known/b10x-redirects.json', rootFiles);
const effectiveMap = JSON.parse(effectiveBytes);
const expectedEffectiveMap = effectiveRedirectMap(globalMap, {routes: initialRoot.document.routes, files: initialRoot.document.files});
if (!effectiveBytes.equals(Buffer.from(canonicalJson(expectedEffectiveMap)))) {
  throw new Error('root effective redirect map is not the deterministic projection of the Website redirect contract');
}
if (effectiveMap.schema !== 'b10x-redirects/v1' || effectiveMap.origin !== globalMap.origin) throw new Error('root effective redirect map is invalid');
const prefix = `/${repository}`;
const declared = effectiveMap.redirects
  .filter((redirect) => redirect.from === prefix || redirect.from.startsWith(`${prefix}/`))
  .map((redirect) => ({...redirect, from: redirect.from.slice(prefix.length) || '/'}));
const redirects = synthesizeFacadeRoutes(repository, declared, new Set(initialRoot.document.routes));
const aliasRoot = path.join(runtimeRoot, '.cache', 'redirect-aliases', repository);
await Promise.all([rm(output, {recursive: true, force: true}), rm(aliasRoot, {recursive: true, force: true})]);
await Promise.all([mkdir(output, {recursive: true}), mkdir(aliasRoot, {recursive: true})]);
const aliases = [];
for (const redirect of redirects) {
  if (redirect.type !== 'alias') continue;
  const expected = rootFiles.get(redirect.source);
  if (!expected) throw new Error(`${redirect.source} is absent from root provenance`);
  const response = await fetch(new URL(redirect.source, `${globalMap.origin}/`), {cache: 'no-store'});
  if (!response.ok) throw new Error(`${redirect.source} returned ${response.status}`);
  const contentType = response.headers.get('content-type')?.split(';')[0];
  if (redirect.mediaType && contentType && contentType !== redirect.mediaType.split(';')[0]) {
    throw new Error(`${redirect.source} returned ${contentType}, expected ${redirect.mediaType}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expected.size || sha256(bytes) !== expected.sha256) {
    throw new Error(`${redirect.source} bytes disagree with root provenance`);
  }
  const destination = path.resolve(aliasRoot, ...redirect.source.split('/'));
  ensureInside(aliasRoot, destination, redirect.source);
  await mkdir(path.dirname(destination), {recursive: true});
  await writeFile(destination, bytes);
  aliases.push({from: redirect.from, source: redirect.source, mediaType: redirect.mediaType, size: expected.size, sha256: expected.sha256});
}

const finalRoot = await fetchRootProvenance(globalMap.origin, options.websiteSha);
if (!initialRoot.bytes.equals(finalRoot.bytes)) throw new Error('root provenance changed while façade aliases were being fetched');
await writeRedirectMap(output, {...globalMap, redirects}, {aliasSourceRoot: aliasRoot});
await writeFile(path.join(output, '.nojekyll'), '');
const facts = await artifactFacts(output);
const facadeProvenance = {
  schema: 'b10x-facade-provenance/v1',
  websiteCommit: options.websiteSha,
  repository,
  deliveryRole: 'legacy-redirect',
  sourcesLockSha256: initialRoot.document.sourcesLockSha256,
  legacyRoutesSha256: sha256(globalMapBytes),
  routesSha256: facts.routesSha256,
  artifactSha256: facts.artifactSha256,
  sourceCommits: initialRoot.document.sourceCommits,
  upstreamRoot: {
    origin: globalMap.origin,
    provenanceSha256: sha256(initialRoot.bytes),
    artifactSha256: initialRoot.document.artifactSha256,
    routesSha256: initialRoot.document.routesSha256,
  },
  aliases: aliases.sort((left, right) => compareUtf8(left.from, right.from)),
  routes: facts.routes,
  files: facts.files,
};
const document = canonicalJson(facadeProvenance);
await Promise.all([
  mkdir(path.join(output, '.well-known'), {recursive: true}),
  mkdir(path.join(output, '._b10x'), {recursive: true}),
]);
await Promise.all([
  writeFile(path.join(output, 'PROVENANCE.json'), document),
  writeFile(path.join(output, '.well-known', 'b10x-docs.json'), document),
  writeFile(path.join(output, '._b10x', 'deployment.json'), canonicalJson(deploymentFromProvenance(facadeProvenance))),
]);
process.stdout.write(`built ${redirects.length} compatibility routes for ${repository} from root ${options.websiteSha}\n`);

async function fetchRootProvenance(origin, websiteSha) {
  const response = await fetch(`${origin}/.well-known/b10x-docs.json`, {cache: 'no-store'});
  if (!response.ok) throw new Error(`root provenance returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const document = JSON.parse(bytes);
  if (document.schema !== 'b10x-website-provenance/v1') throw new Error('root provenance has an unexpected schema');
  if (document.websiteCommit !== websiteSha) throw new Error(`root website is ${document.websiteCommit}, expected ${websiteSha}`);
  if (!Array.isArray(document.files) || !Array.isArray(document.routes) || !/^[0-9a-f]{64}$/.test(document.artifactSha256)) {
    throw new Error('root provenance is incomplete');
  }
  return {bytes, document};
}

async function fetchVerifiedFile(origin, source, rootFiles) {
  const expected = rootFiles.get(source);
  if (!expected) throw new Error(`${source} is absent from root provenance`);
  const response = await fetch(new URL(source, `${origin}/`), {cache: 'no-store'});
  if (!response.ok) throw new Error(`${source} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expected.size || sha256(bytes) !== expected.sha256) throw new Error(`${source} bytes disagree with root provenance`);
  return bytes;
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error('usage: build-redirect-facade --repository <id> --website-sha <sha> --out <directory> [--data <directory>]');
    result[name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (!result.repository || !result.websiteSha || !result.out) throw new Error('usage: build-redirect-facade --repository <id> --website-sha <sha> --out <directory> [--data <directory>]');
  return result;
}

function ensureInside(rootDirectory, candidate, context) {
  const relative = path.relative(rootDirectory, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${context} escapes output root`);
}
