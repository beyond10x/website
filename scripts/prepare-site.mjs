import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'yaml';
import {resolveDocumentPageMetadata} from '@beyond10x/docs-system/documents';
import {evaluateExperienceCatalog} from '@beyond10x/docs-system/experiences';
import {writeJsonFeed, writeRss} from '@beyond10x/docs-system/feeds';
import {readExperienceCatalog} from '@beyond10x/docs-system/manifest';
import {compareUtf8} from './order-contract.mjs';
import {sourceKey, sourceMap} from './source-routing.mjs';
import {bootstrapEnabled, validateSourceLock} from './source-lock-contract.mjs';
import {validateBootstrapSnapshots} from './bootstrap-contract.mjs';
import {buildApiCatalog, describeApiSpecification, renderApiCatalogLanding} from './api-catalog.mjs';
import {assertDocumentationFamilyDistribution, documentationFamilies, documentationFamilyOrder, renderSidebars, sourceSidebarMetadata} from './sidebar-contract.mjs';
import {normalizePassiveMarkdown} from './passive-markdown.mjs';
import {assertSearchAudienceVocabulary, experienceIdsForSourceDocument} from './search-metadata-contract.mjs';
import {withGenerationLease} from './generation-lease.mjs';

await withGenerationLease('site preparation', async () => {
const root = path.resolve(import.meta.dirname, '..');
const generated = path.join(root, '.generated');
const docs = path.join(generated, 'docs');
const data = path.join(generated, 'data');
const ecosystem = path.join(generated, 'ecosystem');
const api = path.join(generated, 'api');
const components = path.join(generated, 'components');
const blog = path.join(generated, 'blog');
const generatedStatic = path.join(generated, 'static');

await rm(generated, {recursive: true, force: true});
await Promise.all(
  [docs, data, ecosystem, api, components, blog, generatedStatic].map((directory) => mkdir(directory, {recursive: true})),
);

const {roster, lock, bootstrap} = await validateSourceLock(root, {allowBootstrap: bootstrapEnabled()});
const sourceLockPath = path.join(root, 'sources.lock.json');
const preparedSourceLockSha256 = createHash('sha256')
  .update(await readFile(sourceLockPath))
  .digest('hex');
await validateBootstrapSnapshots(root, roster.repositories);
const legacyRegistry = JSON.parse(await readFile(path.join(root, 'data/bootstrap/ecosystem.json'), 'utf8'));
const legacyLedgerInput = JSON.parse(await readFile(path.join(root, 'data/bootstrap/changes.json'), 'utf8'));
const searchGolden = JSON.parse(await readFile(path.join(root, 'data/search-golden.json'), 'utf8'));
const experienceCatalog = await readExperienceCatalog(path.join(root, 'data/experiences.json'));
const evaluatedExperienceCatalog = {
  schema: 'b10x-evaluated-experiences/v1',
  experiences: evaluateExperienceCatalog(experienceCatalog),
};
if (searchGolden.schema !== 'b10x-search-golden/v1' || !Array.isArray(searchGolden.queries)) {
  throw new Error('search golden contract must use b10x-search-golden/v1');
}
const rankedSearchQueries = new Map();
for (const entry of searchGolden.queries) {
  const entries = rankedSearchQueries.get(entry.expectedFirst) ?? [];
  entries.push(entry.query);
  rankedSearchQueries.set(entry.expectedFirst, entries);
}
const legacyLedger = {
  ...legacyLedgerInput,
  changes: legacyLedgerInput.changes.map((change) => ({
    ...change,
    channel: change.channel ?? (change.automatic ? 'releases' : 'impact'),
  })),
};
const lockByRepository = new Map(lock.sources.map((source) => [source.repository, source]));
let registry;
let manifests = [];
let indexes = [];
let collectionRoot;
let apiCatalog = buildApiCatalog([]);
let documentIndex = {schema: 'b10x-document-index/v1', documents: []};

if (lock.sources.length > 0) {
  const {collectSources} = await import('./collect-sources.mjs');
  const collected = await collectSources({root, outputRoot: generated});
  ({registry, manifests, indexes, collectionRoot} = collected);
  assertDocumentationFamilyDistribution(manifests);
  ({apiCatalog, documentIndex} = await materializeCollection({manifests, indexes, collectionRoot}));
} else {
  registry = fixtureRegistry(roster.repositories, legacyRegistry);
}

const displayNames = Object.fromEntries(
  registry.surfaces.map((surface) => [surface.repository.id, surface.repository.displayName ?? surface.name]),
);
const surfaces = registry.surfaces.map((input) => {
  const surface = structuredClone(input);
  const repository = surface.repository.id;
  surface.name = displayNames[repository] ?? surface.name;
  surface.key = `${repository}/${surface.id}`;
  surface.sections = surface.sections ?? [];
  if (repository === 'website') {
    surface.sections = surface.sections.map((section) => section.url === 'https://beyond10x.github.io/journeys/'
      ? {...section, label: 'Paths', url: 'https://beyond10x.github.io/start/'}
      : section);
  }
  if (!surface.sections.some((section) => section.url === `/docs/${repository}/`)) {
    surface.sections.unshift({label: 'Unified documentation', url: `/docs/${repository}/`, kind: 'docs'});
  }
  return surface;
});
registry = {schema: 'b10x-docs-registry/v2', surfaces};
const dependencyGraph = buildDependencyGraph(surfaces);
await Promise.all([
  writeFile(path.join(data, 'ecosystem.json'), `${JSON.stringify(registry, null, 2)}\n`),
  writeFile(path.join(data, 'changes.json'), `${JSON.stringify(legacyLedger, null, 2)}\n`),
  writeFile(path.join(data, 'release-facts.json'), await readFile(path.join(root, 'data/bootstrap/release-facts.json'), 'utf8')),
  writeFile(path.join(generatedStatic, 'ecosystem.json'), `${JSON.stringify(registry, null, 2)}\n`),
  writeFile(path.join(generatedStatic, 'changes.json'), `${JSON.stringify(legacyLedger, null, 2)}\n`),
  writeFile(path.join(generatedStatic, 'release-facts.json'), await readFile(path.join(root, 'data/bootstrap/release-facts.json'), 'utf8')),
  writeFile(path.join(data, 'dependencies.json'), `${JSON.stringify(dependencyGraph, null, 2)}\n`),
  writeFile(path.join(generatedStatic, 'dependencies.json'), `${JSON.stringify(dependencyGraph, null, 2)}\n`),
  writeFile(path.join(data, 'manifests.json'), `${JSON.stringify(manifests, null, 2)}\n`),
  writeFile(path.join(data, 'api-catalog.json'), `${JSON.stringify(apiCatalog, null, 2)}\n`),
  writeFile(path.join(generatedStatic, 'api-catalog.json'), `${JSON.stringify(apiCatalog, null, 2)}\n`),
  writeFile(path.join(data, 'document-index.json'), `${JSON.stringify(documentIndex, null, 2)}\n`),
  writeFile(path.join(generatedStatic, 'document-index.json'), `${JSON.stringify(documentIndex, null, 2)}\n`),
  writeFile(path.join(data, 'experiences.json'), `${JSON.stringify(evaluatedExperienceCatalog, null, 2)}\n`),
  writeFile(path.join(generatedStatic, 'experiences.json'), `${JSON.stringify(evaluatedExperienceCatalog, null, 2)}\n`),
  writeFile(
    path.join(generated, 'sidebars.cjs'),
    renderSidebars(registry, manifests),
  ),
]);
if (bootstrap) {
  const fixtureOpenApi = path.join(generatedStatic, 'api', 'aep-service', 'http-api', 'openapi.json');
  await mkdir(path.dirname(fixtureOpenApi), {recursive: true});
  await writeFile(fixtureOpenApi, `${JSON.stringify({openapi: '3.1.0', info: {title: 'AEP Service local preview contract', version: '0.0.0-local'}, paths: {}}, null, 2)}\n`);
  const fixtureFieldNotes = path.join(generatedStatic, 'updates', 'field-notes');
  await mkdir(fixtureFieldNotes, {recursive: true});
  await Promise.all([
    writeFile(path.join(fixtureFieldNotes, 'feed.json'), `${JSON.stringify({version: 'https://jsonfeed.org/version/1.1', title: 'beyond10x field notes', home_page_url: 'https://beyond10x.github.io/updates/field-notes/', feed_url: 'https://beyond10x.github.io/updates/field-notes/feed.json', items: []}, null, 2)}\n`),
    writeFile(path.join(fixtureFieldNotes, 'rss.xml'), '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>beyond10x field notes</title><link>https://beyond10x.github.io/updates/field-notes/</link><description>Repository-owned field notes.</description></channel></rss>\n'),
    writeFile(path.join(fixtureFieldNotes, 'atom.xml'), '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>https://beyond10x.github.io/updates/field-notes/</id><title>beyond10x field notes</title><updated>1970-01-01T00:00:00Z</updated></feed>\n'),
  ]);
}
await Promise.all([
  writeRss(path.join(generatedStatic, 'changes', 'rss.xml'), legacyLedger, {scope: 'all'}),
  writeJsonFeed(path.join(generatedStatic, 'changes', 'feed.json'), legacyLedger, {scope: 'all'}),
  writeRss(path.join(generatedStatic, 'changes', 'impact.rss.xml'), legacyLedger, {scope: 'impact'}),
  writeJsonFeed(path.join(generatedStatic, 'changes', 'impact.feed.json'), legacyLedger, {scope: 'impact'}),
  writeRss(path.join(generatedStatic, 'releases', 'rss.xml'), legacyLedger, {scope: 'releases'}),
  writeJsonFeed(path.join(generatedStatic, 'releases', 'feed.json'), legacyLedger, {scope: 'releases'}),
]);
for (const repository of ['aep', 'ess']) {
  const entries = legacyLedger.changes.filter((change) => change.repository === repository && change.source.version);
  const repositoryLedger = {...legacyLedger, changes: entries};
  await writeRss(path.join(generatedStatic, 'releases', repository, 'rss.xml'), repositoryLedger, {
    scope: 'all',
    homePageUrl: 'https://beyond10x.github.io/releases/',
    feedUrl: `https://beyond10x.github.io/releases/${repository}/rss.xml`,
    title: `${displayNameForRelease(repository)} releases`,
  });
  await writeFile(
    path.join(generatedStatic, 'releases', repository, 'atom.xml'),
    renderAtom(entries, `${displayNameForRelease(repository)} releases`, `https://beyond10x.github.io/releases/${repository}/atom.xml`),
  );
}

await writeFile(
  path.join(docs, 'index.mdx'),
  [
    '---',
    'title: Technical documentation',
    'slug: /',
    'description: Browse source-locked technical references or return to an audience-first path.',
    '---',
    '',
    "import EcosystemFamilyOrientation from '@site/src/components/EcosystemFamilyOrientation';",
    "import registry from '@site/.generated/data/ecosystem.json';",
    '',
    '# Technical documentation',
    '',
    'This is the repository-owned reference corpus. If you are new to agentic coding, [start with an outcome-led path](/start/) instead of choosing a repository.',
    '',
    '## Browse by technical boundary',
    '',
    '<EcosystemFamilyOrientation surfaces={registry.surfaces} title="Choose the family that owns your question" description="Families organize technical reference. They are not a required onboarding sequence or one deployment stack." />',
    '',
  ].join('\n'),
);
if (!bootstrap) {
  const familyDocs = path.join(docs, 'families');
  await mkdir(familyDocs, {recursive: true});
  for (const family of documentationFamiliesForLanding()) {
    await writeFile(path.join(familyDocs, `${family.file}.mdx`), [
      '---',
      `title: ${family.label}`,
      `slug: ${family.slug}`,
      `description: ${JSON.stringify(family.description)}`,
      'hide_title: true',
      '---',
      '',
      "import EcosystemFamilyLanding from '@site/src/components/EcosystemFamilyLanding';",
      '',
      `<EcosystemFamilyLanding family="${family.id}" />`,
      '',
    ].join('\n'));
  }
}
await writeFile(
  path.join(api, 'index.mdx'),
  renderApiCatalogLanding(),
);

function documentationFamiliesForLanding() {
  return documentationFamilies.map((family) => ({
    ...family,
    file: family.slug.replace(/^\/+|\/+$/g, ''),
  }));
}
await writeFile(
  path.join(components, 'index.md'),
  `---\ntitle: Public components and data\nslug: /\n---\n\n# Public components and data\n\nRepository-owned catalogs and component projections appear here at locked source revisions.\n`,
);

const profiledRepositories = new Set();
for (const surface of surfaces) {
  const repository = surface.repository.id;
  const source = lockByRepository.get(repository);
  const revision = source?.commit ?? 'local-preview';
  const sourceUrl = `${surface.repository.url}${source ? `/tree/${revision}` : ''}`;
  const relationships = (surface.relationships ?? [])
    .filter(isPresentedRelationship)
    .map((relation) => {
      const targetRepository = relation.target.split('/')[0];
      if (!roster.repositories.includes(targetRepository)) return undefined;
      return `- **${relation.kind}** [${displayNames[targetRepository] ?? targetRepository}](/ecosystem/${targetRepository}/)${relation.label ? ` — ${relation.label}` : ''}`;
    })
    .filter(Boolean);
  const sections = surface.sections
    .filter((section) => section.label !== 'Unified documentation')
    .map((section) => `- [${section.label}](${source ? canonicalSectionUrl(repository, section.url) : section.url})`);
  const repositoryDocs = path.join(docs, repository);
  await mkdir(repositoryDocs, {recursive: true});
  const indexFile = path.join(repositoryDocs, 'index.md');
  let hasCollectedIndex = false;
  for (const candidate of [indexFile, path.join(repositoryDocs, 'index.mdx')]) {
    try {
      await readFile(candidate);
      hasCollectedIndex = true;
      break;
    } catch {}
  }
  if (!hasCollectedIndex) {
    await writeFile(
      indexFile,
      `${projectDocument({surface, repository, revision, sourceUrl, relationships, sections})}\n`,
    );
  }
  if (!profiledRepositories.has(repository)) {
    await writeFile(
      path.join(ecosystem, `${repository}.mdx`),
      `${profileDocument({surface, repository, revision})}\n`,
    );
    profiledRepositories.add(repository);
  }
}

const currentSourceLockSha256 = createHash('sha256')
  .update(await readFile(sourceLockPath))
  .digest('hex');
if (currentSourceLockSha256 !== preparedSourceLockSha256) {
  throw new Error('sources.lock.json changed during site preparation; generated inputs are incomplete');
}
const completion = {
  schema: 'b10x-website-generated-completion/v1',
  sourceLockSha256: preparedSourceLockSha256,
};
const completionPath = path.join(generated, '.complete.json');
const temporaryCompletionPath = `${completionPath}.${process.pid}.tmp`;
await writeFile(temporaryCompletionPath, `${JSON.stringify(completion, null, 2)}\n`, {flag: 'wx'});
await rename(temporaryCompletionPath, completionPath);

async function materializeCollection({manifests: sourceManifests, indexes: sourceIndexes, collectionRoot: collectedRoot}) {
  const manifestByRepository = new Map(sourceManifests.map((manifest) => [manifest.repository.id, manifest]));
  const surfaceByKey = new Map(
    sourceManifests.flatMap((manifest) => manifest.surfaces.map((surface) => [`${manifest.repository.id}/${surface.id}`, surface])),
  );
  const documents = sourceIndexes.flatMap((index) => index.files.filter((file) => file.kind === 'document'));
  const routeBySource = sourceMap(documents, (file) => documentRoute(file, surfaceByKey));
  const blogFiles = sourceIndexes.flatMap((index) => index.files.filter((file) => file.kind === 'blog'));
  const blogRouteBySource = new Map();
  for (const file of blogFiles) {
    const raw = await readFile(path.join(collectedRoot, ...file.outputPath.split('/')), 'utf8');
    const {frontmatter} = splitFrontmatter(raw);
    blogRouteBySource.set(sourceKey(file.repository, file.sourcePath), blogRoute(file, frontmatter.slug));
  }
  const assetBySource = sourceMap(
    sourceIndexes.flatMap((index) => index.files.filter((file) => file.kind === 'asset')),
    (file) => `/source-assets/${file.outputPath}`,
  );
  const destinations = new Set();
  const apiSpecifications = [];
  const documentRecords = [];

  for (const index of sourceIndexes) {
    const manifest = manifestByRepository.get(index.repository.id);
    const lockSource = lockByRepository.get(index.repository.id);
    for (const file of index.files) {
      const sourceFile = path.join(collectedRoot, ...file.outputPath.split('/'));
      if (file.kind === 'document') {
        const route = routeBySource.get(sourceKey(file.repository, file.sourcePath));
        const destination = docDestination(route, file.sourcePath);
        assertUniqueDestination(destinations, destination);
        await mkdir(path.dirname(destination), {recursive: true});
        const raw = await readFile(sourceFile, 'utf8');
        const metadata = await documentMetadata({
          raw,
          file,
          route,
          manifest,
          surface: surfaceByKey.get(`${file.repository}/${file.surface}`),
        });
        documentRecords.push(metadata);
        await writeFile(
          destination,
          renderImportedMarkdown({
            raw,
            file,
            route,
            commit: lockSource.commit,
            repositoryUrl: manifest.repository.url,
            routeBySource,
            blogRouteBySource,
            assetBySource,
            metadata,
          }),
        );
      } else if (file.kind === 'blog') {
        const destination = path.join(blog, `${file.repository}-${file.sourcePath.replace(/[^a-zA-Z0-9.-]+/g, '-')}`);
        assertUniqueDestination(destinations, destination);
        await writeFile(destination, await renderBlog({
          raw: await readFile(sourceFile, 'utf8'), file, commit: lockSource.commit, manifest,
          route: blogRouteBySource.get(sourceKey(file.repository, file.sourcePath)),
          repositoryUrl: manifest.repository.url, routeBySource, blogRouteBySource, assetBySource,
          projectName: manifest.repository.displayName ?? file.repository,
        }));
      } else if (file.kind === 'asset') {
        const destination = path.join(generatedStatic, 'source-assets', ...file.outputPath.split('/'));
        assertUniqueDestination(destinations, destination);
        await mkdir(path.dirname(destination), {recursive: true});
        await copyFile(sourceFile, destination);
        if (file.repository === 'ess' && file.sourcePath.endsWith('billing_web_realized.wasm')) {
          const legacyArtifact = path.join(generatedStatic, 'artifacts', 'ess', 'lab', 'billing_web_realized.wasm');
          await mkdir(path.dirname(legacyArtifact), {recursive: true});
          await copyFile(sourceFile, legacyArtifact);
        }
      } else if (file.kind === 'data') {
        await materializeData({file, sourceFile, manifest, commit: lockSource.commit});
      } else if (file.kind === 'openapi' || file.kind === 'json-schema') {
        apiSpecifications.push(await materializeSpecification({file, sourceFile, manifest, commit: lockSource.commit}));
      }
    }
  }
  await synthesizeDirectoryLandings({documents, routeBySource, destinations, manifestByRepository, documentRecords});
  await synthesizeApiLandings(sourceIndexes, manifestByRepository);
  documentRecords.sort((left, right) => compareUtf8(left.route, right.route));
  return {
    apiCatalog: buildApiCatalog(apiSpecifications),
    documentIndex: {schema: 'b10x-document-index/v1', documents: documentRecords},
  };
}

function documentRoute(file, surfaceByKey) {
  const surface = surfaceByKey.get(`${file.repository}/${file.surface}`);
  if (!surface) throw new Error(`missing surface for ${file.outputPath}`);
  if (!surface.routeBase.startsWith('/docs/')) throw new Error(`${file.repository}/${file.surface} routeBase must begin /docs/`);
  const relative = file.outputPath.split('/').slice(3).join('/');
  const normalized = normalizeDocumentRelative(relative);
  const base = surface.routeBase.replace(/^\/docs\//, '').replace(/^\/+|\/+$/g, '');
  const leaf = normalized.replace(/\.(?:md|mdx)$/i, '').replace(/(?:^|\/)index$/i, '');
  return `/docs/${[base, leaf].filter(Boolean).join('/')}/`.replace(/\/+/g, '/');
}

function normalizeDocumentRelative(relative) {
  let value = relative.replace(/^website\/docs\//, '').replace(/^docs\//, '');
  value = value.replace(/(^|\/)(?:README|index|intro)\.(?:md|mdx)$/i, '$1index.md');
  return value;
}

function docDestination(route, sourcePath) {
  const relative = route.replace(/^\/docs\//, '').replace(/\/$/, '');
  const extension = path.extname(sourcePath).toLowerCase() === '.mdx' ? '.mdx' : '.md';
  return path.join(docs, ...relative.split('/'), `index${extension}`);
}

function renderImportedMarkdown({raw, file, route, commit, repositoryUrl, routeBySource, blogRouteBySource, assetBySource, metadata}) {
  const {frontmatter, body} = splitFrontmatter(raw);
  const title = metadata.title;
  const sidebar = sourceSidebarMetadata(frontmatter, title);
  const rewritten = rewriteLinks(normalizePassiveMarkdown(body), {file, commit, repositoryUrl, routeBySource, blogRouteBySource, assetBySource});
  return [
    '---',
    `title: ${JSON.stringify(metadata.qualifiedTitle)}`,
    `sidebar_label: ${JSON.stringify(sidebar.label)}`,
    ...(sidebar.position === undefined ? [] : [`sidebar_position: ${JSON.stringify(sidebar.position)}`]),
    `description: ${JSON.stringify(metadata.description)}`,
    `slug: ${JSON.stringify(route.replace(/^\/docs/, ''))}`,
    '---',
    '',
    renderSearchAttributes(metadata),
    '',
    renderSourceBanner(`> **${metadata.projectName}** source-owned documentation · [${file.repository}/${file.sourcePath}](${repositoryUrl}/blob/${commit}/${encodeURI(file.sourcePath)}) · revision ${renderRevision(commit)}`),
    '',
    rewritten.trim(),
    '',
  ].join('\n');
}

async function renderBlog({raw, file, route, commit, repositoryUrl, routeBySource, blogRouteBySource, assetBySource, projectName, manifest}) {
  const {frontmatter, body} = splitFrontmatter(raw);
  const title = frontmatter.title ?? firstHeading(body) ?? path.basename(file.sourcePath, path.extname(file.sourcePath));
  const date = normalizeBlogDate(frontmatter.date ?? /^([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(path.basename(file.sourcePath))?.[1] ?? '1970-01-01');
  const rewritten = rewriteLinks(normalizePassiveMarkdown(body), {file, commit, repositoryUrl, routeBySource, blogRouteBySource, assetBySource});
  const resolved = manifest.schema === 'b10x-docs/v4'
    ? await resolveDocumentPageMetadata(manifest, file.surface, raw, `${file.repository}/${file.sourcePath}`)
    : undefined;
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(date)}`,
    `slug: ${JSON.stringify(route.replace(/^\/updates\/field-notes/, ''))}`,
    ...(frontmatter.description ? [`description: ${JSON.stringify(frontmatter.description)}`] : []),
    ...(Array.isArray(frontmatter.tags) ? [`tags: ${JSON.stringify(frontmatter.tags)}`] : []),
    '---',
    '',
    renderSearchAttributes({
      project: file.repository,
      projectName,
      title,
      qualifiedTitle: `${title} | ${projectName}`,
      description: summaryText(frontmatter.description ?? `${title} in the source-owned ${projectName} documentation.`),
      documentType: 'field-note',
      audiences: resolved?.effective.audiences ?? ['researcher'],
      experiences: experienceIdsForSourceDocument({schema: manifest.schema, effective: resolved?.effective}),
      tasks: ['research'],
    }),
    '',
    renderSourceBanner(`> Source-owned field note · [${file.sourcePath}](${repositoryUrl}/blob/${commit}/${encodeURI(file.sourcePath)}) · revision ${renderRevision(commit)}`),
    '',
    rewritten.trim(),
    '',
  ].join('\n');
}

async function materializeSpecification({file, sourceFile, manifest, commit}) {
  const raw = await readFile(sourceFile, 'utf8');
  const parsed = file.sourcePath.endsWith('.json') ? JSON.parse(raw) : parse(raw);
  const route = file.route;
  if (!route?.startsWith('/api/')) throw new Error(`${file.outputPath} specification route must begin /api/`);
  const relative = route.replace(/^\/api\//, '').replace(/\/$/, '');
  const rawDirectory = path.join(generatedStatic, 'api', ...relative.split('/'));
  await mkdir(rawDirectory, {recursive: true});
  const rawName = file.kind === 'openapi' ? 'openapi.json' : 'schema.json';
  await writeFile(path.join(rawDirectory, rawName), `${JSON.stringify(parsed, null, 2)}\n`);
  const page = path.join(api, ...relative.split('/'), 'index.mdx');
  await mkdir(path.dirname(page), {recursive: true});
  const summary = specificationSummary(parsed, file.kind);
  await writeFile(
    page,
    [
      '---',
      `title: ${JSON.stringify(file.specificationId)}`,
      `slug: ${JSON.stringify(`/${relative}/`)}`,
      '---',
      '',
      "import ApiReference from '@site/src/components/ApiReference';",
      '',
      '## Static summary',
      '',
      ...summary,
      '',
      `[Download the canonical ${file.kind === 'openapi' ? 'OpenAPI document' : 'JSON Schema'}](/api/${relative}/${rawName})`,
      '',
      '## Interactive reference',
      '',
      `<ApiReference format=${JSON.stringify(file.kind)} sourceUrl=${JSON.stringify(`/api/${relative}/${rawName}`)} sourceRepository=${JSON.stringify(`${manifest.repository.url}/blob/${commit}/${file.sourcePath}`)} />`,
      '',
    ].join('\n'),
  );
  return describeApiSpecification({document: parsed, file, manifest, commit});
}

async function materializeData({file, sourceFile, manifest, commit}) {
  const raw = await readFile(sourceFile, 'utf8');
  const parsed = file.sourcePath.endsWith('.json') ? JSON.parse(raw) : parse(raw);
  const slug = path.basename(file.sourcePath, path.extname(file.sourcePath)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const sourceDirectory = path.join(generatedStatic, 'data', file.repository);
  await mkdir(sourceDirectory, {recursive: true});
  await writeFile(path.join(sourceDirectory, `${slug}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
  const page = path.join(components, file.repository, `${slug}.mdx`);
  await mkdir(path.dirname(page), {recursive: true});
  const summary = dataSummary(parsed);
  await writeFile(
    page,
    [
      '---',
      `title: ${JSON.stringify(`${manifest.repository.displayName}: ${slug.replaceAll('-', ' ')}`)}`,
      `slug: ${JSON.stringify(`/${file.repository}/${slug}/`)}`,
      '---',
      '',
      "import DataCatalogReference from '@site/src/components/DataCatalogReference';",
      '',
      '## Static summary',
      '',
      ...summary,
      '',
      `[Download the canonical JSON data](/data/${file.repository}/${slug}.json)`,
      '',
      '## Interactive catalog',
      '',
      `<DataCatalogReference sourceUrl=${JSON.stringify(`/data/${file.repository}/${slug}.json`)} sourceRepository=${JSON.stringify(`${manifest.repository.url}/blob/${commit}/${file.sourcePath}`)} title=${JSON.stringify(`${manifest.repository.displayName} data`)} />`,
      '',
    ].join('\n'),
  );
}

function specificationSummary(document, kind) {
  if (kind === 'openapi') {
    const operations = Object.entries(document.paths ?? {}).flatMap(([route, methods]) =>
      Object.entries(methods ?? {})
        .filter(([method]) => ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(method.toLowerCase()))
        .map(([method, operation]) => `- \`${method.toUpperCase()} ${route}\` — ${plainText(operation?.summary ?? operation?.operationId ?? 'Documented operation')}`),
    );
    return [
      `**API:** ${plainText(document.info?.title ?? 'Untitled API')} · **Version:** ${plainText(document.info?.version ?? 'unspecified')} · **Operations:** ${operations.length}`,
      '',
      ...(operations.length ? operations.slice(0, 40) : ['No operations are declared.']),
      ...(operations.length > 40 ? [`- …and ${operations.length - 40} more in the interactive reference and canonical document.`] : []),
    ];
  }
  const properties = Object.keys(document.properties ?? {}).sort(compareUtf8);
  return [
    `**Schema:** ${plainText(document.title ?? document.$id ?? 'Untitled schema')} · **Type:** ${plainText(document.type ?? 'unspecified')} · **Top-level properties:** ${properties.length}`,
    '',
    ...(properties.length ? properties.map((property) => `- \`${plainText(property)}\``) : ['No top-level properties are declared.']),
  ];
}

function dataSummary(document) {
  if (Array.isArray(document)) {
    return [`This catalog contains **${document.length} items**.`, '', ...document.slice(0, 25).map((item, index) => `- ${plainText(item?.name ?? item?.id ?? item?.key ?? `Item ${index + 1}`)}`)];
  }
  const keys = document && typeof document === 'object' ? Object.keys(document).sort(compareUtf8) : [];
  return [`This data document exposes **${keys.length} top-level fields**.`, '', ...keys.slice(0, 50).map((key) => `- \`${plainText(key)}\``)];
}

function plainText(value) {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').replace(/\|/g, '\\|').trim();
}

function summaryText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

async function documentMetadata({raw, file, route, manifest, surface}) {
  const {frontmatter, body} = splitFrontmatter(raw);
  const title = frontmatter.title ?? firstHeading(body) ?? path.basename(file.sourcePath, path.extname(file.sourcePath));
  const projectName = manifest.repository.displayName ?? file.repository;
  const description = summaryText(frontmatter.description ?? `${title} in the source-owned ${projectName} documentation.`);
  const declared = frontmatter.b10x && typeof frontmatter.b10x === 'object' ? frontmatter.b10x : {};
  const documentType = declared.documentType ?? inferDocumentType(file.sourcePath, title);
  const resolved = manifest.schema === 'b10x-docs/v4'
    ? await resolveDocumentPageMetadata(manifest, file.surface, raw, `${file.repository}/${file.sourcePath}`)
    : undefined;
  const audiences = resolved
    ? resolved.effective.audiences
    : stringArray(declared.audiences, surface?.audiences?.length ? surface.audiences : ['developer']);
  const experiences = experienceIdsForSourceDocument({schema: manifest.schema, effective: resolved?.effective});
  const tasks = stringArray(declared.tasks, inferTasks(file.sourcePath, title));
  return {
    route,
    title,
    qualifiedTitle: `${title} | ${projectName}`,
    project: file.repository,
    projectName,
    description,
    documentType,
    audiences,
    experiences,
    support: resolved?.effective.support ?? 'unspecified',
    access: resolved?.effective.access ?? 'unspecified',
    compatibility: resolved?.effective.compatibility ?? true,
    tasks,
    sourcePath: file.sourcePath,
  };
}

function renderSearchAttributes(metadata) {
  assertSearchAudienceVocabulary(metadata.audiences, `${metadata.route ?? metadata.qualifiedTitle ?? 'page'} search metadata`);
  const attributes = [
    ['data-pagefind-meta', 'qualified_title', metadata.qualifiedTitle],
    ['data-pagefind-meta', 'description', metadata.description],
    ['data-pagefind-meta', 'project', metadata.projectName],
    ['data-pagefind-meta', 'document_type', metadata.documentType],
    ['data-pagefind-filter', 'project', metadata.project],
    ['data-pagefind-filter', 'document_type', metadata.documentType],
    ...metadata.audiences.map((audience) => ['data-pagefind-filter', 'audience', audience]),
    ...metadata.experiences.map((experience) => ['data-pagefind-filter', 'experience', experience]),
    ...metadata.tasks.map((task) => ['data-pagefind-filter', 'task', task]),
  ];
  return [
    '<div className="b10x-search-attributes" data-pagefind-ignore>',
    ...attributes.map(([name, key, value]) => `  <span ${name}="${htmlAttribute(key)}">${htmlText(value)}</span>`),
    ...(rankedSearchQueries.get(metadata.route) ?? [])
      .map((query) => `  <span data-pagefind-meta="search_priority" data-pagefind-weight="10">${htmlText(query)}</span>`),
    '</div>',
  ].join('\n');
}

function renderSourceBanner(markdown) {
  return [
    '<div className="b10x-source-banner" data-pagefind-ignore>',
    '',
    markdown,
    '',
    '</div>',
  ].join('\n');
}

function renderRevision(revision) {
  const value = String(revision);
  const label = /^[0-9a-f]{40}$/.test(value) ? value.slice(0, 12) : value;
  return `<code className="b10x-revision" title="${htmlAttribute(value)}">${htmlText(label)}</code>`;
}

function inferDocumentType(sourcePath, title) {
  const value = `${sourcePath} ${title}`.toLowerCase();
  if (/tutorial|golden-path/.test(value)) return 'tutorial';
  if (/troubleshoot|failure|debug/.test(value)) return 'troubleshooting';
  if (/(^|\/)guides?\//.test(sourcePath.toLowerCase()) || /getting-started|install|quickstart/.test(value)) return 'how-to';
  if (/(^|\/)concepts?\//.test(sourcePath.toLowerCase()) || /overview/.test(value)) return 'explanation';
  if (/(^|\/)status\//.test(sourcePath.toLowerCase()) || /roadmap|limitations|where-this-stands/.test(value)) return 'status';
  return 'reference';
}

function inferTasks(sourcePath, title) {
  const value = `${sourcePath} ${title}`.toLowerCase();
  const tasks = [];
  for (const [task, pattern] of [
    ['install', /install|getting-started|quickstart/],
    ['specify', /spec|schema|contract|conformance/],
    ['govern-work', /aep|govern|plan|evidence/],
    ['run-agents', /harness|agent-loop|session|workflow/],
    ['deploy', /deploy|helm|kubernetes|infrastructure/],
    ['operate', /operate|operations|reliability|configuration|security/],
    ['troubleshoot', /troubleshoot|failure|debug|limitation/],
    ['research', /research|principle|study|observation/],
  ]) {
    if (pattern.test(value)) tasks.push(task);
  }
  return tasks.length ? tasks : ['reference'];
}

function stringArray(value, fallback) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...new Set(value)] : [...new Set(fallback)];
}

function htmlAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function htmlText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function rewriteLinks(body, context) {
  const markdown = body.replace(/(!?\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, destination) => {
    const resolved = resolveLink(destination, context, {image: label.startsWith('!')});
    return resolved === destination ? match : `${label}(${resolved})`;
  });
  return markdown.replace(/(<[A-Za-z][A-Za-z0-9.-]*\b[^>]*?\s(?:href|src)=["'])([^"']+)(["'])/g, (match, prefix, destination, quote) => {
    const resolved = resolveLink(destination, context, {image: /\ssrc=["']$/i.test(prefix)});
    return `${prefix}${resolved}${quote}`;
  });
}

function resolveLink(destination, context, {image}) {
  if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(destination)) return destination;
  const suffixIndex = destination.search(/[?#]/);
  const target = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : destination.slice(suffixIndex);
  let decoded;
  try { decoded = decodeURI(target); } catch { return destination; }
  const base = decoded.startsWith('/')
    ? decoded.replace(/^\/+/, '')
    : path.posix.normalize(path.posix.join(path.posix.dirname(context.file.sourcePath), decoded));
  const roots = [base];
  const repositoryPrefix = `${context.file.repository}/`;
  if (decoded.startsWith('/') && base.startsWith(repositoryPrefix)) roots.push(base.slice(repositoryPrefix.length));
  for (const rootCandidate of roots) {
    for (const candidate of sourceCandidates(rootCandidate, {rootRelative: decoded.startsWith('/')})) {
      const document = context.routeBySource.get(sourceKey(context.file.repository, candidate));
      if (document) return `${document}${suffix}`;
      const fieldNote = context.blogRouteBySource.get(sourceKey(context.file.repository, candidate));
      if (fieldNote) return `${fieldNote}${suffix}`;
      const asset = context.assetBySource.get(sourceKey(context.file.repository, candidate));
      if (asset) return `${asset}${suffix}`;
    }
  }
  if (decoded.startsWith('/')) return `${canonicalSectionUrl(context.file.repository, decoded)}${suffix}`;
  if (image) return `https://raw.githubusercontent.com/beyond10x/${context.file.repository}/${context.commit}/${encodeURI(base)}${suffix}`;
  return `${context.repositoryUrl}/blob/${context.commit}/${encodeURI(base)}${suffix}`;
}

function sourceCandidates(target, {rootRelative}) {
  const cleaned = target.replace(/^\.\//, '').replace(/\/$/, '');
  const roots = rootRelative ? [cleaned, `static/${cleaned}`, `website/static/${cleaned}`, `docs/${cleaned}`, `website/docs/${cleaned}`] : [cleaned];
  return [...new Set(roots.flatMap((candidate) => /\.(?:md|mdx)$/i.test(candidate)
    ? [candidate]
    : [candidate, `${candidate}.md`, `${candidate}.mdx`, `${candidate}/README.md`, `${candidate}/README.mdx`, `${candidate}/index.md`, `${candidate}/index.mdx`]))];
}

function blogRoute(file, declaredSlug) {
  const originalSlug = String(declaredSlug ?? path.basename(file.sourcePath, path.extname(file.sourcePath)).replace(/^\d{4}-\d{2}-\d{2}-/, ''));
  return `/updates/field-notes/${file.repository}/${originalSlug.replace(/^\/+|\/+$/g, '')}/`;
}

function normalizeBlogDate(value) {
  const input = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid source blog date ${input}`);
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

async function synthesizeDirectoryLandings({documents, routeBySource, destinations, manifestByRepository, documentRecords}) {
  const realRoutes = new Set(routeBySource.values());
  const children = new Map();
  for (const file of documents) {
    const route = routeBySource.get(sourceKey(file.repository, file.sourcePath));
    const segments = route.replace(/^\/+|\/+$/g, '').split('/');
    for (let length = 2; length < segments.length; length += 1) {
      const directory = `/${segments.slice(0, length).join('/')}/`;
      if (!children.has(directory)) children.set(directory, new Set());
      children.get(directory).add(route);
    }
  }
  for (const [route, routeChildren] of [...children.entries()].sort(([left], [right]) => compareUtf8(left, right))) {
    if (realRoutes.has(route)) continue;
    const [, , repository, ...remainder] = route.split('/');
    const destination = docDestination(route, 'index.md');
    assertUniqueDestination(destinations, destination);
    await mkdir(path.dirname(destination), {recursive: true});
    const manifest = manifestByRepository.get(repository);
    const title = remainder.filter(Boolean).at(-1)?.replace(/[-_]/g, ' ') ?? manifest?.repository.displayName ?? repository;
    const projectName = manifest?.repository.displayName ?? repository;
    const metadata = {
      route,
      title,
      qualifiedTitle: `${title} | ${projectName}`,
      project: repository,
      projectName,
      description: `Browse the ${title} section of the source-owned ${projectName} documentation.`,
      documentType: 'reference',
      audiences: ['developer'],
      experiences: [],
      tasks: ['reference'],
      sourcePath: null,
    };
    documentRecords.push(metadata);
    const links = [...routeChildren].sort(compareUtf8).map((child) => `- [${child.replace(route, '').replace(/\/$/, '').replace(/[-_/]/g, ' ')}](${child})`);
    await writeFile(destination, ['---', `title: ${JSON.stringify(metadata.qualifiedTitle)}`, `sidebar_label: ${JSON.stringify(title)}`, `slug: ${JSON.stringify(route.replace(/^\/docs/, ''))}`, '---', '', renderSearchAttributes(metadata), '', `# ${title}`, '', 'Collected documentation in this section:', '', ...links, ''].join('\n'));
    realRoutes.add(route);
  }
}

function splitFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return {frontmatter: {}, body: source};
  return {frontmatter: parse(match[1]) ?? {}, body: source.slice(match[0].length)};
}

function firstHeading(source) {
  return /^#\s+(.+)$/m.exec(source)?.[1]?.replace(/[*_`]/g, '').trim();
}

function fixtureRegistry(repositories, legacyRegistry) {
  const byRepository = new Map(legacyRegistry.surfaces.map((surface) => [surface.repository.id, surface]));
  const names = {
    aep: 'AEP', 'aep-service': 'AEP Service', 'agent-platform': 'Agent Platform',
    'agentic-principles': 'Agentic Principles', agentide: 'AgentIDE', agentplugins: 'Agent Plugins', connectors: 'Connectors',
    devcenter: 'Devcenter', 'docs-system': 'Docs System', 'entity-runtime': 'Entity Runtime', ess: 'ESS',
    eventlog: 'Eventlog', harness: 'Harness', identity: 'Identity', mcp: 'MCP', metaharness: 'Metaharness',
    research: 'Agent Interaction Research', secrets: 'Secrets', substrate: 'Substrate', workflow: 'Workflow', worktree: 'Worktree',
    workspace: 'Workspace',
  };
  return {
    schema: 'b10x-docs-registry/v2',
    surfaces: repositories.map((repository) => {
      const existing = byRepository.get(repository);
      if (existing) return structuredClone(existing);
      return {
        id: 'docs', key: `${repository}/docs`, name: names[repository],
        summary: `Public documentation for ${names[repository]}.`, kind: 'service-docs', maturity: 'development',
        availability: 'published', discoverability: 'public', audiences: ['developer'],
        journeys: ['operate-services'], capabilities: [repository], sections: [], relationships: [],
        repository: {id: repository, url: `https://github.com/beyond10x/${repository}`},
        adoption: {label: `Explore ${names[repository]}`, url: `https://github.com/beyond10x/${repository}#readme`, mode: 'browser', estimatedMinutes: 5, outcome: `Understand the public ${names[repository]} boundary.`},
      };
    }),
  };
}

function projectDocument({surface, repository, revision, sourceUrl, relationships, sections}) {
  const metadata = {
    qualifiedTitle: `${surface.name} | beyond10x`,
    projectName: surface.name,
    project: repository,
    description: surface.summary,
    documentType: 'reference',
    audiences: surface.audiences ?? ['developer'],
    experiences: [],
    tasks: ['reference'],
  };
  return [
    '---', `title: ${JSON.stringify(metadata.qualifiedTitle)}`, `sidebar_label: ${JSON.stringify(surface.name)}`, `description: ${JSON.stringify(surface.summary)}`,
    `slug: /${repository}/`, '---', '', renderSearchAttributes(metadata), '',
    `# ${surface.name}`, '', surface.summary, '',
    renderSourceBanner(`> Source-owned documentation · [${repository}](${sourceUrl}) · revision ${renderRevision(revision)}`), '',
    `**Status:** ${surface.maturity} · **Journeys:** ${surface.journeys.join(', ')}`, '', '## Start', '',
    `[${surface.adoption?.label ?? 'Open the source'}](${surface.adoption?.url ?? surface.repository.url})`, '',
    surface.adoption?.outcome ?? '', '',
    ...(relationships.length ? ['## Relationships', '', ...relationships, ''] : []),
    ...(sections.length ? ['## Repository-owned references', '', ...sections, ''] : []),
  ].join('\n');
}

function profileDocument({surface, repository, revision}) {
  return [
    '---', `title: ${JSON.stringify(`${surface.name} | beyond10x`)}`, `description: ${JSON.stringify(surface.summary)}`,
    `slug: /${repository}/`, 'pagination_next: null', 'pagination_prev: null', '---', '',
    "import ProjectProfile from '@site/src/components/ProjectProfile';", '',
    `# ${surface.name}`, '',
    `<ProjectProfile repository=${JSON.stringify(repository)} revision=${JSON.stringify(revision)} />`,
  ].join('\n');
}

function canonicalSectionUrl(repository, url) {
  if (url.startsWith(`https://beyond10x.github.io/${repository}/docs/`)) return url.replace(`https://beyond10x.github.io/${repository}/docs/`, `/docs/${repository}/`);
  if (url === `https://beyond10x.github.io/${repository}/` || url === `/${repository}/`) return `/docs/${repository}/`;
  if (url.startsWith(`/${repository}/docs/`)) return url.replace(`/${repository}/docs/`, `/docs/${repository}/`);
  if (url === `/${repository}/api` || url === `/${repository}/api/`) return `/api/${repository}/`;
  if (url.startsWith('/docs/') && !url.startsWith(`/docs/${repository}/`)) return `/docs/${repository}/${url.slice('/docs/'.length)}`;
  return url;
}

async function synthesizeApiLandings(sourceIndexes, manifestByRepository) {
  const byRepository = new Map();
  for (const file of sourceIndexes.flatMap((index) => index.files).filter((file) => file.kind === 'openapi' || file.kind === 'json-schema')) {
    if (!byRepository.has(file.repository)) byRepository.set(file.repository, []);
    byRepository.get(file.repository).push({route: file.route, label: file.specificationId});
  }
  for (const [repository, specifications] of [...byRepository].sort(([left], [right]) => compareUtf8(left, right))) {
    const displayName = manifestByRepository.get(repository)?.repository.displayName ?? repository;
    const destination = path.join(api, repository, 'index.md');
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, [
      '---', `title: ${JSON.stringify(`${displayName} APIs`)}`, `slug: ${JSON.stringify(`/${repository}/`)}`, '---', '',
      `# ${displayName} APIs`, '',
      'Repository-owned machine contracts, rendered from the exact source revision in the Website source lock.', '',
      ...specifications.sort((left, right) => compareUtf8(left.route, right.route)).map((specification) => `- [${specification.label}](${specification.route})`), '',
    ].join('\n'));
  }
}

function assertUniqueDestination(destinations, destination) {
  if (destinations.has(destination)) throw new Error(`collected sources map to duplicate website output ${destination}`);
  destinations.add(destination);
}

function buildDependencyGraph(registrySurfaces) {
  const nodes = [...new Map(registrySurfaces.map((surface) => [surface.repository.id, {id: surface.repository.id, label: surface.name}])).values()]
    .sort((left, right) => compareUtf8(left.id, right.id));
  const known = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seen = new Set();
  for (const surface of registrySurfaces) {
    for (const relationship of surface.relationships ?? []) {
      if (!isPresentedRelationship(relationship)) continue;
      const target = relationship.target.split('/')[0];
      const key = `${surface.repository.id}\0${target}\0${relationship.kind}`;
      if (!known.has(target) || seen.has(key)) continue;
      seen.add(key);
      edges.push({from: surface.repository.id, to: target, label: relationship.kind});
    }
  }
  edges.sort((left, right) => compareUtf8(left.from, right.from) || compareUtf8(left.to, right.to) || compareUtf8(left.label, right.label));
  return {schema: 'b10x-public-dependency-graph/v1', nodes, edges};
}

function isPresentedRelationship(relationship) {
  return relationship.kind !== 'documentation-source'
    && !(relationship.kind === 'supports' && relationship.target === 'website/docs');
}

function displayNameForRelease(repository) {
  return repository === 'aep' ? 'AEP' : repository === 'ess' ? 'ESS' : repository;
}

function renderAtom(entries, title, selfUrl) {
  const updated = entries[0]?.publishedAt ?? '1970-01-01T00:00:00Z';
  const body = entries.map((entry) => [
    '  <entry>',
    `    <id>${xml(entry.key)}</id>`,
    `    <title>${xml(entry.title)}</title>`,
    `    <updated>${xml(entry.publishedAt)}</updated>`,
    `    <link href="${xml(entry.source.url)}"/>`,
    `    <summary>${xml(entry.summary)}</summary>`,
    '  </entry>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <id>${xml(selfUrl)}</id>\n  <title>${xml(title)}</title>\n  <updated>${xml(updated)}</updated>\n  <link rel="self" href="${xml(selfUrl)}"/>\n${body}\n</feed>\n`;
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
});
