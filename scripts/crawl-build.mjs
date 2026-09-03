import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJson} from './artifact-contract.mjs';
import {crawlArtifact} from './artifact-crawler.mjs';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const origin = 'https://beyond10x.github.io';
const redirects = JSON.parse(await readFile(path.join(build, '.well-known', 'b10x-redirects.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(root, '.generated', 'data', 'ecosystem.json'), 'utf8'));
const manifests = JSON.parse(await readFile(path.join(root, '.generated', 'data', 'manifests.json'), 'utf8'));
const declaredReferences = [];

for (const surface of registry.surfaces) collectSurfaceReferences(surface, `${surface.repository.id}`, declaredReferences);
for (const manifest of manifests) {
  for (const surface of manifest.surfaces ?? []) {
    collectSurfaceReferences(surface, `${manifest.repository.id}/${surface.id}`, declaredReferences);
  }
}

const publicRepositories = [...new Set(registry.surfaces.map((surface) => surface.repository.id))];
const {report} = await crawlArtifact({build, origin, redirects, declaredReferences, publicRepositories});
await mkdir(path.join(build, '._b10x'), {recursive: true});
await writeFile(path.join(build, '._b10x', 'quality.json'), canonicalJson(report));

if (report.status !== 'passed') {
  throw new Error(`artifact crawl found ${report.diagnostics.length} defect(s):\n${report.diagnostics.slice(0, 100).map((failure) => `- [${failure.code}] ${failure.context} -> ${failure.target}`).join('\n')}`);
}
process.stdout.write(`crawled ${report.routeCount} routes, ${report.htmlDocuments} HTML documents, ${report.svgDocuments} SVG documents, ${report.cssDocuments} stylesheets, and ${report.referencesChecked} references\n`);

function collectSurfaceReferences(surface, context, output) {
  for (const [label, url] of [
    ['canonicalUrl', surface.canonicalUrl],
    ['adoption.url', surface.adoption?.url],
    ...(surface.sections ?? []).map((section) => [`section ${section.label}`, section.url]),
  ]) {
    if (url) output.push({context: `${context} ${label}`, url});
  }
}
