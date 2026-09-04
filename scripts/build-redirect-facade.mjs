import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeRedirectMap} from '@beyond10x/docs-system/redirects';
import {artifactFacts, canonicalJson, deploymentFromProvenance, sha256} from './artifact-contract.mjs';
import {
  facadeDeploymentFromProvenance,
  facadeRepositories,
  facadeRouteManifest,
  routeManifestSha256,
  synthesizeFacadeRoutes,
  validateFacadeProvenance,
} from './facade-contract.mjs';
import {validateSourceLock} from './source-lock-contract.mjs';
import {compareUtf8} from './order-contract.mjs';
import {effectiveRedirectMap} from './redirect-contract.mjs';

const runtimeRoot = path.resolve(import.meta.dirname, '..');

export async function buildRedirectFacade(options) {
  const mode = facadeMode(options);
  const repository = options.repository;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(repository)) throw new Error(`invalid repository ${repository}`);
  const output = path.resolve(options.out);
  const dataRoot = path.resolve(options.data ?? runtimeRoot);
  if (mode === 'v1') {
    const {roster} = await validateSourceLock(dataRoot, {allowBootstrap: true});
    if (!facadeRepositories(roster).includes(repository)) {
      throw new Error(`${repository} is not in the active or compatibility-only façade roster`);
    }
  }

  const globalMapBytes = await readFile(path.join(dataRoot, 'legacy-routes.json'));
  const globalMap = JSON.parse(globalMapBytes);
  let initialRoot;
  let declared;
  let rootFiles = new Map();
  const migrationCommit = mode === 'v1' ? options.websiteSha : options.migrationWebsiteSha;
  if (migrationCommit) {
    initialRoot = await fetchRootProvenance(globalMap.origin, migrationCommit);
    if (initialRoot.document.legacyRoutesSha256 !== sha256(globalMapBytes)) {
      throw new Error('checked-out legacy routes disagree with deployed root provenance');
    }
    rootFiles = new Map(initialRoot.document.files.map((file) => [file.path, file]));
    const effectiveBytes = await fetchVerifiedFile(globalMap.origin, '.well-known/b10x-redirects.json', rootFiles);
    const effectiveMap = JSON.parse(effectiveBytes);
    const expectedEffectiveMap = effectiveRedirectMap(globalMap, {
      routes: initialRoot.document.routes,
      files: initialRoot.document.files,
    });
    if (!effectiveBytes.equals(Buffer.from(canonicalJson(expectedEffectiveMap)))) {
      throw new Error('root effective redirect map is not the deterministic projection of the Website redirect contract');
    }
    if (effectiveMap.schema !== 'b10x-redirects/v1' || effectiveMap.origin !== globalMap.origin) {
      throw new Error('root effective redirect map is invalid');
    }
    declared = repositoryRedirects(effectiveMap, repository);
  } else {
    declared = repositoryRedirects(globalMap, repository);
    if (declared.some((redirect) => redirect.type === 'alias')) {
      throw new Error(`${repository} requires migration-website-sha to materialize stable alias bytes`);
    }
  }

  const rootRoutes = initialRoot ? new Set(initialRoot.document.routes) : undefined;
  const redirects = synthesizeFacadeRoutes(
    repository,
    declared,
    rootRoutes,
    mode === 'v2'
      ? {canonicalRoute: options.canonicalRoute, profileRoute: options.profileRoute}
      : undefined,
  );
  const routeManifest = facadeRouteManifest(redirects);
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
    aliases.push({
      from: redirect.from,
      source: redirect.source,
      mediaType: redirect.mediaType,
      size: expected.size,
      sha256: expected.sha256,
    });
  }

  if (initialRoot) {
    const finalRoot = await fetchRootProvenance(globalMap.origin, migrationCommit);
    if (!initialRoot.bytes.equals(finalRoot.bytes)) {
      throw new Error('root provenance changed while façade aliases were being fetched');
    }
  }
  await writeRedirectMap(output, {...globalMap, redirects}, {aliasSourceRoot: aliasRoot});
  await writeFile(path.join(output, '.nojekyll'), '');
  const facts = await artifactFacts(output);
  const facadeProvenance = mode === 'v1'
    ? {
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
      }
    : {
        schema: 'b10x-facade-provenance/v2',
        repository,
        deliveryRole: 'stable-redirect',
        canonicalRoute: options.canonicalRoute,
        profileRoute: options.profileRoute,
        runtimeCommit: options.runtimeSha,
        controlCommit: options.controlSha,
        ...(options.migrationWebsiteSha ? {migrationWebsiteCommit: options.migrationWebsiteSha} : {}),
        routeManifestSha256: routeManifestSha256(routeManifest),
        routesSha256: facts.routesSha256,
        artifactSha256: facts.artifactSha256,
        routeManifest,
        routes: facts.routes,
        files: facts.files,
      };
  if (mode === 'v2') validateFacadeProvenance(facadeProvenance, options);
  const document = canonicalJson(facadeProvenance);
  await Promise.all([
    mkdir(path.join(output, '.well-known'), {recursive: true}),
    mkdir(path.join(output, '._b10x'), {recursive: true}),
  ]);
  await Promise.all([
    writeFile(path.join(output, 'PROVENANCE.json'), document),
    writeFile(path.join(output, '.well-known', 'b10x-docs.json'), document),
    writeFile(
      path.join(output, '._b10x', 'deployment.json'),
      canonicalJson(mode === 'v1'
        ? deploymentFromProvenance(facadeProvenance)
        : facadeDeploymentFromProvenance(facadeProvenance)),
    ),
  ]);
  process.stdout.write(mode === 'v1'
    ? `built ${redirects.length} compatibility routes for ${repository} from root ${options.websiteSha}\n`
    : `built ${redirects.length} stable compatibility routes for ${repository}\n`);
  return {mode, redirects, provenance: facadeProvenance, facts};
}

function repositoryRedirects(map, repository) {
  if (map.schema !== 'b10x-redirects/v1'
    || map.origin !== 'https://beyond10x.github.io'
    || !Array.isArray(map.redirects)) {
    throw new Error('Website redirect map is invalid');
  }
  const prefix = `/${repository}`;
  return map.redirects
    .filter((redirect) => redirect.from === prefix || redirect.from.startsWith(`${prefix}/`))
    .map((redirect) => ({...redirect, from: redirect.from.slice(prefix.length) || '/'}));
}

async function fetchRootProvenance(origin, websiteSha) {
  const response = await fetch(`${origin}/.well-known/b10x-docs.json`, {cache: 'no-store'});
  if (!response.ok) throw new Error(`root provenance returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const document = JSON.parse(bytes);
  if (!['b10x-website-provenance/v1', 'b10x-website-provenance/v2'].includes(document.schema)) {
    throw new Error('root provenance has an unexpected schema');
  }
  if (document.websiteCommit !== websiteSha) {
    throw new Error(`root website is ${document.websiteCommit}, expected ${websiteSha}`);
  }
  if (!Array.isArray(document.files)
    || !Array.isArray(document.routes)
    || !/^[0-9a-f]{64}$/.test(document.artifactSha256)) {
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
  if (bytes.byteLength !== expected.size || sha256(bytes) !== expected.sha256) {
    throw new Error(`${source} bytes disagree with root provenance`);
  }
  return bytes;
}

function facadeMode(options) {
  const v1 = options.websiteSha !== undefined;
  const v2 = options.canonicalRoute !== undefined
    || options.profileRoute !== undefined
    || options.runtimeSha !== undefined
    || options.migrationWebsiteSha !== undefined;
  if (v1 === v2) throw new Error('exactly one of legacy website-sha or stable route controls is required');
  if (v1) {
    if (!fullCommit(options.websiteSha)) throw new Error('website-sha must be a non-zero full commit');
    return 'v1';
  }
  if (!options.canonicalRoute || !options.profileRoute
    || !fullCommit(options.runtimeSha)
    || !fullCommit(options.controlSha)
    || (options.migrationWebsiteSha && !fullCommit(options.migrationWebsiteSha))
    || (!options.migrationWebsiteSha && options.data)) {
    throw new Error('stable façade requires canonical-route, profile-route, runtime-sha, and control-sha commits');
  }
  return 'v2';
}

function parseArgs(args) {
  const result = {};
  const allowed = new Set([
    'repository', 'website-sha', 'canonical-route', 'profile-route', 'runtime-sha',
    'control-sha', 'migration-website-sha', 'out', 'data',
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || !value || !allowed.has(name.slice(2))) throw new Error(usage());
    const key = name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(result, key)) throw new Error(`duplicate façade option ${name}`);
    result[key] = value;
  }
  if (!result.repository || !result.out) throw new Error(usage());
  return result;
}

function usage() {
  return 'usage: build-redirect-facade --repository <id> --out <directory> (--website-sha <sha> [--data <directory>] | --canonical-route <route> --profile-route <route> --runtime-sha <sha> --control-sha <sha> [--migration-website-sha <sha> --data <directory>])';
}

function fullCommit(value) {
  return /^(?!0{40}$)[0-9a-f]{40}$/.test(value ?? '');
}

function ensureInside(rootDirectory, candidate, context) {
  const relative = path.relative(rootDirectory, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${context} escapes output root`);
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await buildRedirectFacade(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`[redirect façade] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
