import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalJson} from './artifact-contract.mjs';
import {crawlArtifact, parseMarkup} from './artifact-crawler.mjs';
import {loadPublicationInputs} from './publication-inputs.mjs';
import {bootstrapEnabled} from './source-lock-contract.mjs';

// A link Docusaurus resolves to a real static file, then suffixes with a trailing slash
// (`trailingSlash: true` applies to every internal href, including hashed file links), 404s on a
// host that serves exact static paths (e.g. GitHub Pages). The parsed crawler above normalizes the
// trailing slash away before checking existence, so it cannot see this class of defect on its own.
const ASSET_EXTENSION_TRAILING_SLASH = /\.(?:json|xml|pdf|csv|txt|ya?ml|zip|wasm|xlsx?|docx?|mdx?|js|css|map|svg|png|jpe?g|gif|ico)\/$/i;

export async function findExtensionTrailingSlashLinks({build: buildRoot, origin: siteOrigin, files}) {
  const fileSet = new Set(files.map((file) => file.path));
  const offenders = [];
  for (const file of files) {
    if (!file.path.endsWith('.html')) continue;
    const source = await readFile(path.join(buildRoot, ...file.path.split('/')), 'utf8');
    const {references} = parseMarkup(source);
    const pageUrl = new URL(routeForFile(file.path), `${siteOrigin}/`);
    for (const reference of references) {
      if (reference.attribute !== 'href') continue;
      let resolved;
      try {
        resolved = new URL(reference.value, pageUrl);
      } catch {
        continue;
      }
      if (resolved.origin !== siteOrigin || !ASSET_EXTENSION_TRAILING_SLASH.test(resolved.pathname)) continue;
      if (!fileSet.has(resolved.pathname.replace(/^\/+|\/+$/g, ''))) continue;
      offenders.push({page: routeForFile(file.path), href: resolved.pathname});
    }
  }
  return offenders;
}

function routeForFile(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

async function main() {
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

  // A quarantined source is public and on the roster; links to it are rewritten to its GitHub
  // repository, which is therefore a catalogued destination.
  const {quarantined} = await loadPublicationInputs({root, allowBootstrap: bootstrapEnabled()});
  const publicRepositories = [...new Set([
    ...registry.surfaces.map((surface) => surface.repository.id),
    ...quarantined.map((entry) => entry.repository),
  ])];
  const {report, facts} = await crawlArtifact({build, origin, redirects, declaredReferences, publicRepositories});
  await mkdir(path.join(build, '._b10x'), {recursive: true});
  await writeFile(path.join(build, '._b10x', 'quality.json'), canonicalJson(report));

  if (report.status !== 'passed') {
    throw new Error(`artifact crawl found ${report.diagnostics.length} defect(s):\n${report.diagnostics.slice(0, 100).map((failure) => `- [${failure.code}] ${failure.context} -> ${failure.target}`).join('\n')}`);
  }

  const trailingSlashAssetLinks = await findExtensionTrailingSlashLinks({build, origin, files: facts.files});
  if (trailingSlashAssetLinks.length > 0) {
    throw new Error(`${trailingSlashAssetLinks.length} rendered href(s) point at a real file with a trailing slash appended (404s on a static host):\n${trailingSlashAssetLinks.slice(0, 100).map((item) => `- ${item.page} -> ${item.href}`).join('\n')}`);
  }
  process.stdout.write(`crawled ${report.routeCount} routes, ${report.htmlDocuments} HTML documents, ${report.svgDocuments} SVG documents, ${report.cssDocuments} stylesheets, and ${report.referencesChecked} references\n`);
}

function collectSurfaceReferences(surface, context, output) {
  for (const [label, url] of [
    ['canonicalUrl', surface.canonicalUrl],
    ['adoption.url', surface.adoption?.url],
    ...(surface.sections ?? []).map((section) => [`section ${section.label}`, section.url]),
  ]) {
    if (url) output.push({context: `${context} ${label}`, url});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
