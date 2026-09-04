import path from 'node:path';
import {canonicalJson, sha256} from './artifact-contract.mjs';
import {assertPortableRelativePath, compareUtf8} from './order-contract.mjs';

export function facadeRepositories(roster) {
  return [...new Set([...roster.repositories, ...(roster.compatibilityRepositories ?? [])])].sort(compareUtf8);
}

export function synthesizeFacadeRoutes(repository, input, rootRoutes, stableRoutes = {}) {
  const routes = [...input];
  const profile = stableRoutes.profileRoute
    ?? (rootRoutes.has(`/ecosystem/${repository}/`) ? `/ecosystem/${repository}/` : '/ecosystem/');
  const documentation = stableRoutes.canonicalRoute
    ?? (rootRoutes.has(`/docs/${repository}/`) ? `/docs/${repository}/` : '/');
  assertCanonicalRoute(profile, 'profile route');
  assertCanonicalRoute(documentation, 'canonical route');
  if (!routes.some((redirect) => redirect.from === '/')) {
    routes.push({from: '/', to: profile, type: 'html'});
  }
  if (!routes.some((redirect) => redirect.from === '/docs' || redirect.from === '/docs/')) {
    routes.push({from: '/docs/', to: documentation, type: 'html'});
  }
  if (!routes.some((redirect) => redirect.from === '/ecosystem' || redirect.from === '/ecosystem/')) {
    routes.push({from: '/ecosystem/', to: profile, type: 'html'});
  }
  if (stableRoutes.profileRoute || stableRoutes.canonicalRoute) {
    assertEntryPoint(routes, '/', profile, repository);
    assertEntryPoint(routes, '/docs/', documentation, repository);
    assertEntryPoint(routes, '/ecosystem/', profile, repository);
  }
  for (const redirect of routes.filter((candidate) => candidate.type === 'html')) {
    if (rootRoutes && !rootRoutes.has(redirect.to)) throw new Error(`${repository} façade target ${redirect.to} is absent from root provenance`);
  }
  return routes.sort((left, right) => compareUtf8(left.from, right.from));
}

export function facadeRouteManifest(redirects) {
  const manifest = redirects.map((redirect) => {
    assertFacadeFrom(redirect?.from);
    if (redirect.type === 'html') {
      assertCanonicalRoute(redirect.to, `façade target for ${redirect.from}`);
      return {from: redirect.from, to: redirect.to, type: 'html'};
    }
    if (redirect.type !== 'alias'
      || typeof redirect.source !== 'string'
      || typeof redirect.mediaType !== 'string'
      || redirect.mediaType.trim() === '') {
      throw new Error(`façade route ${redirect?.from ?? '<unknown>'} is invalid`);
    }
    const source = redirect.source.startsWith('/') ? redirect.source : `/${redirect.source}`;
    assertFacadeFrom(source);
    return {from: redirect.from, source, type: 'alias', mediaType: redirect.mediaType};
  });
  const sorted = manifest.sort((left, right) => compareUtf8(left.from, right.from));
  if (new Set(sorted.map((entry) => entry.from)).size !== sorted.length) {
    throw new Error('façade route manifest contains duplicate routes');
  }
  return sorted;
}

export function routeManifestSha256(routeManifest) {
  return sha256(Buffer.from(JSON.stringify(routeManifest)));
}

export function validateFacadeProvenance(document, expected = {}) {
  if (document?.schema === 'b10x-facade-provenance/v1') {
    if (document.deliveryRole !== 'legacy-redirect'
      || typeof document.repository !== 'string'
      || !fullCommit(document.websiteCommit)
      || !Array.isArray(document.routes)
      || !Array.isArray(document.files)) {
      throw new Error('invalid b10x-facade-provenance/v1 document');
    }
    if (expected.repository && document.repository !== expected.repository) {
      throw new Error('façade provenance repository does not match');
    }
    return {version: 1, document};
  }
  const optionalMigration = Object.hasOwn(document ?? {}, 'migrationWebsiteCommit');
  assertExactKeys(document, [
    'schema', 'repository', 'deliveryRole', 'canonicalRoute', 'profileRoute',
    'runtimeCommit', 'controlCommit', ...(optionalMigration ? ['migrationWebsiteCommit'] : []),
    'routeManifestSha256', 'routesSha256', 'artifactSha256', 'routeManifest', 'routes', 'files',
  ]);
  if (document.schema !== 'b10x-facade-provenance/v2'
    || document.deliveryRole !== 'stable-redirect'
    || !/^[a-z0-9][a-z0-9-]*$/.test(document.repository ?? '')
    || !fullCommit(document.runtimeCommit)
    || !fullCommit(document.controlCommit)
    || (optionalMigration && !fullCommit(document.migrationWebsiteCommit))
    || !digest(document.routeManifestSha256)
    || !digest(document.routesSha256)
    || !digest(document.artifactSha256)
    || !Array.isArray(document.routeManifest)
    || !Array.isArray(document.routes)
    || !Array.isArray(document.files)) {
    throw new Error('invalid b10x-facade-provenance/v2 document');
  }
  assertCanonicalRoute(document.canonicalRoute, 'canonical route');
  assertCanonicalRoute(document.profileRoute, 'profile route');
  const normalizedManifest = facadeRouteManifest(document.routeManifest);
  if (canonicalJson(normalizedManifest) !== canonicalJson(document.routeManifest)
    || routeManifestSha256(normalizedManifest) !== document.routeManifestSha256) {
    throw new Error('façade provenance route manifest or digest is invalid');
  }
  assertEntryPoint(normalizedManifest, '/', document.profileRoute, document.repository);
  assertEntryPoint(normalizedManifest, '/docs/', document.canonicalRoute, document.repository);
  assertEntryPoint(normalizedManifest, '/ecosystem/', document.profileRoute, document.repository);
  if (document.routes.length === 0
    || new Set(document.routes).size !== document.routes.length
    || [...document.routes].sort(compareUtf8).join('\n') !== document.routes.join('\n')
    || document.routesSha256 !== sha256(Buffer.from(`${document.routes.join('\n')}\n`))) {
    throw new Error('façade provenance route inventory or digest is invalid');
  }
  let previousPath;
  for (const file of document.files) {
    if (!file || typeof file !== 'object' || Array.isArray(file)
      || Object.keys(file).sort(compareUtf8).join('\n') !== ['path', 'sha256', 'size'].sort(compareUtf8).join('\n')) {
      throw new Error('façade provenance file inventory is invalid');
    }
    assertPortableRelativePath(file.path, 'façade artifact path');
    if (!digest(file.sha256)
      || !Number.isSafeInteger(file.size)
      || file.size < 0
      || (previousPath !== undefined && compareUtf8(previousPath, file.path) >= 0)) {
      throw new Error('façade provenance file inventory is invalid');
    }
    previousPath = file.path;
  }
  const artifactDigest = sha256(Buffer.from(document.files.map((file) => `${file.sha256}  ${file.path}\n`).join('')));
  if (document.artifactSha256 !== artifactDigest) {
    throw new Error('façade provenance artifact digest is invalid');
  }
  for (const [field, value] of Object.entries({
    repository: document.repository,
    canonicalRoute: document.canonicalRoute,
    profileRoute: document.profileRoute,
    runtimeCommit: document.runtimeCommit,
    controlCommit: document.controlCommit,
    migrationWebsiteCommit: document.migrationWebsiteCommit,
  })) {
    if (expected[field] !== undefined && expected[field] !== value) {
      throw new Error(`façade provenance ${field} does not match`);
    }
  }
  return {version: 2, document};
}

export function facadeDeploymentFromProvenance(provenance) {
  validateFacadeProvenance(provenance);
  return {
    schema: 'b10x-facade-deployment/v2',
    repository: provenance.repository,
    canonicalRoute: provenance.canonicalRoute,
    profileRoute: provenance.profileRoute,
    runtimeCommit: provenance.runtimeCommit,
    controlCommit: provenance.controlCommit,
    routeManifestSha256: provenance.routeManifestSha256,
    routesSha256: provenance.routesSha256,
    artifactSha256: provenance.artifactSha256,
    routeCount: provenance.routes.length,
    fileCount: provenance.files.length,
  };
}

function assertEntryPoint(routes, from, to, repository) {
  const accepted = routes.filter((redirect) => redirect.from === from
    || (from.endsWith('/') && redirect.from === from.slice(0, -1)));
  if (accepted.length !== 1 || accepted[0].type !== 'html' || accepted[0].to !== to) {
    throw new Error(`${repository} façade ${from} must target ${to}`);
  }
}

function assertCanonicalRoute(value, label) {
  if (typeof value !== 'string'
    || !value.startsWith('/')
    || !value.endsWith('/')
    || value.includes('\\')
    || value.includes('?')
    || value.includes('#')
    || path.posix.normalize(value) !== value) {
    throw new Error(`${label} must be a canonical absolute route ending in /`);
  }
}

function assertFacadeFrom(value) {
  if (typeof value !== 'string'
    || !value.startsWith('/')
    || value.includes('\\')
    || value.includes('?')
    || value.includes('#')
    || path.posix.normalize(value) !== value) {
    throw new Error('façade source route must be a canonical absolute path');
  }
}

function assertExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('façade provenance must be an object');
  }
  const actual = Object.keys(value).sort(compareUtf8);
  const wanted = [...expected].sort(compareUtf8);
  if (actual.join('\n') !== wanted.join('\n')) {
    throw new Error('façade provenance has unexpected or missing fields');
  }
}

function fullCommit(value) {
  return /^(?!0{40}$)[0-9a-f]{40}$/.test(value ?? '');
}

function digest(value) {
  return /^[0-9a-f]{64}$/.test(value ?? '');
}
