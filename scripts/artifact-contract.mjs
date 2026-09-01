import {createHash} from 'node:crypto';
import {lstat, readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {assertPortableRelativePath, compareUtf8} from './order-contract.mjs';
import {routesFromFiles} from './provenance-routes.mjs';

export const metadataPaths = new Set([
  'PROVENANCE.json',
  '.well-known/b10x-docs.json',
  '._b10x/deployment.json',
]);

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function artifactFacts(build) {
  const files = [];
  for (const file of await walk(build)) {
    const relative = path.relative(build, file).split(path.sep).join('/');
    assertPortableRelativePath(relative, 'artifact path');
    if (metadataPaths.has(relative)) continue;
    const bytes = await readFile(file);
    files.push({path: relative, sha256: sha256(bytes), size: bytes.byteLength});
  }
  files.sort((left, right) => compareUtf8(left.path, right.path));
  const routes = routesFromFiles(files);
  const artifactSha256 = sha256(Buffer.from(files.map((file) => `${file.sha256}  ${file.path}\n`).join('')));
  const routesSha256 = sha256(Buffer.from(`${routes.join('\n')}\n`));
  return {files, routes, artifactSha256, routesSha256};
}

export function deploymentFromProvenance(provenance) {
  return {
    schema: 'b10x-docs-deployment/v1',
    websiteCommit: provenance.websiteCommit,
    sourcesLockSha256: provenance.sourcesLockSha256,
    legacyRoutesSha256: provenance.legacyRoutesSha256,
    routesSha256: provenance.routesSha256,
    artifactSha256: provenance.artifactSha256,
    sourceCount: Object.keys(provenance.sourceCommits).length,
    routeCount: provenance.routes.length,
    fileCount: provenance.files.length,
    bootstrap: provenance.bootstrap === true,
  };
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    const details = await lstat(absolute);
    if (details.isSymbolicLink()) throw new Error(`artifact contains symbolic link ${absolute}`);
    if (details.isDirectory()) output.push(...(await walk(absolute)));
    else if (details.isFile()) output.push(absolute);
    else throw new Error(`artifact contains non-regular entry ${absolute}`);
  }
  return output;
}
