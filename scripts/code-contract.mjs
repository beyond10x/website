import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PRISM_LANGUAGES, normalizeMarkdownFenceLanguage} from '@beyond10x/docs-system/code';
import {parse as parseHtml} from 'parse5';
import {parse as parseYaml} from 'yaml';
import {compareUtf8} from './order-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const acceptedLanguages = new Set([...PRISM_LANGUAGES, 'mermaid']);
export const CODE_FENCE_INVENTORY_SCHEMA = 'b10x-code-fence-inventory/v1';
const sourceInventoryPath = path.join(root, '.generated', 'data', 'code-fence-inventory.json');
const renderedInventoryPath = path.join(root, 'build', '._b10x', 'code-fence-inventory.json');

export function inventoryMarkdownFences(source, context = {}) {
  const origin = typeof context === 'string' ? {sourcePath: context} : context;
  const diagnostics = [];
  const fences = [];
  let openFence;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const candidate = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!candidate) continue;
    const marker = candidate[2];
    if (openFence) {
      if (marker[0] === openFence.marker && marker.length >= openFence.length && !candidate[3].trim()) openFence = undefined;
      continue;
    }
    const info = candidate[3].trim();
    const declaredLanguage = info.match(/^[^\s{]+/)?.[0] ?? '';
    const normalizedLanguage = normalizeMarkdownFenceLanguage(declaredLanguage);
    const record = {
      repository: origin.repository ?? null,
      sourcePath: origin.sourcePath ?? '<markdown>',
      sourceRevision: origin.sourceRevision ?? null,
      sourceKind: origin.sourceKind ?? 'markdown',
      publicRoute: origin.publicRoute ?? null,
      line: index + 1,
      declaredLanguage,
      normalizedLanguage,
      semanticClass: semanticClass(normalizedLanguage),
      expectedRendering: normalizedLanguage === 'mermaid' ? 'diagram' : normalizedLanguage === 'text' ? 'plain' : 'prism',
    };
    fences.push(record);
    if (!declaredLanguage) {
      diagnostics.push(`${fenceLocation(record)}: fenced code block has no language; use text for plain output`);
    } else if (declaredLanguage.toLowerCase() === 'console') {
      diagnostics.push(`${fenceLocation(record)}: console is ambiguous; use bash, shell-session, or text`);
    } else if (!acceptedLanguages.has(normalizedLanguage)) {
      diagnostics.push(`${fenceLocation(record)}: unsupported fenced-code language ${JSON.stringify(declaredLanguage)}`);
    }
    openFence = {marker: marker[0], length: marker.length, record};
  }
  if (openFence) diagnostics.push(`${fenceLocation(openFence.record)}: fenced code block is not closed`);
  return {fences, diagnostics};
}

export function inspectMarkdownFences(source, file = '<markdown>') {
  return inventoryMarkdownFences(source, {sourcePath: file}).diagnostics;
}

export function inspectRenderedCode(html, file = '<html>', statistics = new Map()) {
  const result = inspectRenderedDocument(html, file);
  for (const block of result.blocks) {
    const current = statistics.get(block.language) ?? {blocks: 0, tokenized: 0};
    current.blocks += 1;
    if (block.meaningfulTokens) current.tokenized += 1;
    statistics.set(block.language, current);
  }
  return result.diagnostics;
}

export function reconcileRenderedInventory(sourceInventory, renderedByRoute) {
  if (sourceInventory?.schema !== CODE_FENCE_INVENTORY_SCHEMA || !Array.isArray(sourceInventory.fences)) {
    throw new Error(`source code-fence inventory must use ${CODE_FENCE_INVENTORY_SCHEMA}`);
  }
  const diagnostics = [];
  const renderedFences = sourceInventory.fences.map((fence) => ({...fence, rendered: null}));
  const renderedDocuments = [...renderedByRoute]
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([publicRoute, rendered]) => ({
      publicRoute,
      outputPath: rendered.outputPath ?? null,
      renderings: documentRenderings(rendered).map((block, index) => ({
        position: index + 1,
        ...block,
        sourceFence: null,
      })),
    }));
  const renderedDocumentByRoute = new Map(renderedDocuments.map((document) => [document.publicRoute, document]));
  const byRoute = new Map();
  for (const fence of renderedFences) {
    const entries = byRoute.get(fence.publicRoute) ?? [];
    entries.push(fence);
    byRoute.set(fence.publicRoute, entries);
  }
  for (const [route, fences] of [...byRoute].sort(([left], [right]) => compareUtf8(left ?? '', right ?? ''))) {
    if (!route) continue;
    const rendered = renderedDocumentByRoute.get(route);
    if (!rendered) {
      diagnostics.push(`${fenceLocation(fences[0])}: public route has no rendered HTML`);
      for (const fence of fences) fence.rendered = missingRendering(fence);
      continue;
    }
    let cursor = 0;
    for (const fence of fences) {
      const expectedKind = fence.expectedRendering === 'diagram' ? 'diagram' : 'prism';
      const matchIndex = rendered.renderings.findIndex((block, index) => (
        index >= cursor && block.kind === expectedKind && block.language === fence.normalizedLanguage
      ));
      if (matchIndex < 0) {
        if (expectedKind === 'diagram') {
          fence.rendered = deferredMermaidRendering();
          continue;
        }
        const actual = rendered.renderings[cursor];
        diagnostics.push(actual
          ? `${fenceLocation(fence)}: expected rendered ${expectedKind} language ${JSON.stringify(fence.normalizedLanguage)}, found ${actual.kind} language ${JSON.stringify(actual.language)}`
          : `${fenceLocation(fence)}: rendered route has no matching ${fence.normalizedLanguage} code block`);
        fence.rendered = missingRendering(fence);
        continue;
      }
      const block = rendered.renderings[matchIndex];
      cursor = matchIndex + 1;
      block.sourceFence = {
        repository: fence.repository,
        sourcePath: fence.sourcePath,
        line: fence.line,
      };
      fence.rendered = {
        kind: block.kind,
        found: true,
        language: block.language,
        meaningfulTokens: block.meaningfulTokens,
        matchesExpected: true,
        position: block.position,
      };
      if (fence.normalizedLanguage === 'text' && block.meaningfulTokens) {
        diagnostics.push(`${fenceLocation(fence)}: text fallback unexpectedly contains syntax tokens`);
      }
    }
  }
  const byLanguage = new Map();
  for (const fence of renderedFences) {
    if (fence.normalizedLanguage === 'text' || fence.normalizedLanguage === 'mermaid') continue;
    const entries = byLanguage.get(fence.normalizedLanguage) ?? [];
    entries.push(fence);
    byLanguage.set(fence.normalizedLanguage, entries);
  }
  for (const [language, fences] of [...byLanguage].sort(([left], [right]) => compareUtf8(left, right))) {
    if (fences.some((fence) => fence.rendered?.matchesExpected && fence.rendered.meaningfulTokens)) continue;
    diagnostics.push(`${fenceLocation(fences[0])}: every rendered ${language} block collapsed to plain tokens; load or repair its Prism grammar`);
  }
  return {
    diagnostics,
    inventory: {
      ...sourceInventory,
      phase: 'rendered',
      fences: renderedFences,
      renderedDocuments,
      summary: {
        ...sourceInventory.summary,
        ...summarizeFences(renderedFences),
        renderedRouteCount: renderedDocuments.length,
        renderedBlockCount: renderedDocuments.reduce((count, document) => count + document.renderings.length, 0),
        unattributedRenderedCount: renderedDocuments.reduce(
          (count, document) => count + document.renderings.filter((block) => !block.sourceFence).length,
          0,
        ),
        clientDeferredCount: renderedFences.filter((fence) => fence.rendered?.verification === 'client-runtime').length,
      },
    },
  };
}

export function inspectComponentSource(source, file = '<source>') {
  return /<pre\b/i.test(source)
    ? [`${file}: raw <pre> bypasses the shared code component`]
    : [];
}

async function inspectSourceTree() {
  const diagnostics = [];
  const fences = [];
  const markdownSources = [];
  const {descriptors, lockedSources} = await collectedMarkdownSources();
  for (const descriptor of descriptors) {
    const source = await readFile(descriptor.collectedFile, 'utf8');
    const inspected = inventoryMarkdownFences(source, descriptor);
    diagnostics.push(...inspected.diagnostics);
    fences.push(...inspected.fences);
    markdownSources.push(markdownSourceRecord(descriptor, inspected.fences.length));

    const generated = await readFile(descriptor.generatedFile, 'utf8');
    const generatedFences = inventoryMarkdownFences(generated, descriptor).fences;
    const expected = inspected.fences.map((fence) => fence.normalizedLanguage);
    const actual = generatedFences.map((fence) => fence.normalizedLanguage);
    if (expected.join('\0') !== actual.join('\0')) {
      diagnostics.push(`${sourceLocation(descriptor)}: passive rendering changed the fence sequence; expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
    }
  }
  for (const file of await filesBelow(path.join(root, 'src', 'pages'), /\.mdx?$/)) {
    const source = await readFile(file, 'utf8');
    const descriptor = {
      repository: 'website',
      sourcePath: relative(file),
      sourceRevision: null,
      sourceKind: 'website-page',
      publicRoute: authoredPageRoute(file, source),
    };
    const inspected = inventoryMarkdownFences(source, descriptor);
    diagnostics.push(...inspected.diagnostics);
    fences.push(...inspected.fences);
    markdownSources.push(markdownSourceRecord(descriptor, inspected.fences.length));
  }
  for (const file of await filesBelow(path.join(root, 'src'), /\.[jt]sx$/)) {
    diagnostics.push(...inspectComponentSource(await readFile(file, 'utf8'), relative(file)));
  }
  const sourceLockSha256 = createHash('sha256').update(await readFile(path.join(root, 'sources.lock.json'))).digest('hex');
  const inventory = {
    schema: CODE_FENCE_INVENTORY_SCHEMA,
    phase: 'source',
    sourceLockSha256,
    lockedSources,
    markdownSources: markdownSources.sort(compareMarkdownSources),
    fences: sortFences(fences).map((fence) => ({...fence, rendered: null})),
    summary: {
      ...summarizeFences(fences),
      lockedRepositoryCount: lockedSources.length,
      markdownSourceCount: markdownSources.length,
    },
  };
  await writeJson(sourceInventoryPath, inventory);
  return {diagnostics, inventory};
}

async function inspectBuild() {
  const sourceInventory = JSON.parse(await readFile(sourceInventoryPath, 'utf8'));
  const sourceLockSha256 = createHash('sha256').update(await readFile(path.join(root, 'sources.lock.json'))).digest('hex');
  if (sourceInventory.sourceLockSha256 !== sourceLockSha256) {
    throw new Error('source code-fence inventory does not match sources.lock.json; run the source check again');
  }
  const diagnostics = [];
  const renderedByRoute = new Map();
  for (const file of await filesBelow(path.join(root, 'build'), /\.html$/)) {
    const route = buildRoute(file);
    const rendered = inspectRenderedDocument(await readFile(file, 'utf8'), relative(file), route);
    diagnostics.push(...rendered.diagnostics);
    if (renderedByRoute.has(route)) diagnostics.push(`${relative(file)}: duplicate rendered route ${route}`);
    else renderedByRoute.set(route, rendered);
  }
  const reconciled = reconcileRenderedInventory(sourceInventory, renderedByRoute);
  diagnostics.push(...reconciled.diagnostics);
  await writeJson(renderedInventoryPath, reconciled.inventory);
  return {diagnostics, inventory: reconciled.inventory};
}

async function collectedMarkdownSources() {
  const lock = JSON.parse(await readFile(path.join(root, 'sources.lock.json'), 'utf8'));
  const documentIndex = JSON.parse(await readFile(path.join(root, '.generated', 'data', 'document-index.json'), 'utf8'));
  if (documentIndex?.schema !== 'b10x-document-index/v1' || !Array.isArray(documentIndex.documents)) {
    throw new Error('run npm run prepare:site before the code source contract');
  }
  const routeBySource = new Map();
  for (const document of documentIndex.documents) {
    if (typeof document.sourcePath !== 'string') continue;
    const key = sourceKey(document.project, document.sourcePath);
    if (routeBySource.has(key)) throw new Error(`document index repeats ${document.project}/${document.sourcePath}`);
    routeBySource.set(key, document.route);
  }
  const descriptors = [];
  for (const source of lock.sources ?? []) {
    const indexFile = path.join(root, '.cache', 'sources', 'indexes', `${source.repository}-${source.commit}.json`);
    const index = JSON.parse(await readFile(indexFile, 'utf8'));
    if (index?.schema !== 'b10x-docs-collection/v1' || index.repository?.id !== source.repository || !Array.isArray(index.files)) {
      throw new Error(`${relative(indexFile)} is not the exact collection index for ${source.repository}`);
    }
    for (const file of index.files) {
      if (!['document', 'blog'].includes(file.kind)) continue;
      if (!/\.mdx?$/i.test(file.sourcePath)) throw new Error(`${file.repository}/${file.sourcePath} is collected as ${file.kind} but is not Markdown`);
      const base = {
        repository: file.repository,
        sourcePath: file.sourcePath,
        sourceRevision: source.commit,
        sourceKind: file.kind === 'blog' ? 'field-note' : 'documentation',
        collectedFile: path.join(root, '.generated', 'collection', ...file.outputPath.split('/')),
      };
      if (file.kind === 'document') {
        const publicRoute = routeBySource.get(sourceKey(file.repository, file.sourcePath));
        if (!publicRoute) throw new Error(`${file.repository}/${file.sourcePath} has no public document route`);
        descriptors.push({...base, publicRoute, generatedFile: generatedDocumentFile(publicRoute, file.sourcePath)});
      } else {
        const generatedFile = path.join(root, '.generated', 'blog', `${file.repository}-${file.sourcePath.replace(/[^a-zA-Z0-9.-]+/g, '-')}`);
        const generated = await readFile(generatedFile, 'utf8');
        const slug = markdownFrontmatter(generated).slug;
        if (typeof slug !== 'string') throw new Error(`${relative(generatedFile)} has no field-note slug`);
        descriptors.push({...base, publicRoute: normalizeRoute(`/updates/field-notes/${slug}`), generatedFile});
      }
    }
  }
  return {
    descriptors: descriptors.sort(compareMarkdownSources),
    lockedSources: (lock.sources ?? [])
      .map((source) => ({repository: source.repository, sourceRevision: source.commit}))
      .sort((left, right) => compareUtf8(left.repository, right.repository)),
  };
}

function inspectRenderedDocument(html, file, route) {
  const document = parseHtml(html);
  const diagnostics = [];
  const blocks = [];
  const renderings = [];
  const location = route ? `${file} [${route}]` : file;
  const visit = (element) => {
    if (!element?.tagName) {
      for (const child of element?.childNodes ?? []) visit(child);
      return;
    }
    const names = classNames(element);
    if (names.has('docusaurus-mermaid-container')) {
      renderings.push({kind: 'diagram', language: 'mermaid', meaningfulTokens: false});
      return;
    }
    if (element.tagName !== 'pre') {
      for (const child of element.childNodes ?? []) visit(child);
      return;
    }
    const pre = element;
    const preClasses = classNames(pre);
    if (preClasses.has('mermaid')) {
      renderings.push({kind: 'diagram', language: 'mermaid', meaningfulTokens: false});
      return;
    }
    if (!preClasses.has('prism-code')) {
      diagnostics.push(`${location}: rendered <pre> bypasses the shared Prism renderer`);
      renderings.push({kind: 'raw-pre', language: null, meaningfulTokens: false});
      return;
    }
    const language = languageClass(pre);
    if (!language) {
      diagnostics.push(`${location}: Prism block has no language class`);
      renderings.push({kind: 'prism', language: null, meaningfulTokens: false});
      return;
    }
    if (!acceptedLanguages.has(language)) {
      diagnostics.push(`${location}: rendered Prism block uses unsupported language ${JSON.stringify(language)}`);
      renderings.push({kind: 'prism', language, meaningfulTokens: hasMeaningfulTokens(pre)});
      return;
    }
    const block = {language, meaningfulTokens: hasMeaningfulTokens(pre)};
    blocks.push(block);
    renderings.push({kind: 'prism', ...block});
  };
  visit(document);
  return {
    outputPath: file,
    diagnostics,
    blocks,
    renderings,
    diagramCount: renderings.filter((rendering) => rendering.kind === 'diagram').length,
  };
}

function documentRenderings(rendered) {
  if (Array.isArray(rendered.renderings)) return rendered.renderings;
  return [
    ...(rendered.blocks ?? []).map((block) => ({kind: 'prism', ...block})),
    ...Array.from({length: rendered.diagramCount ?? 0}, () => ({kind: 'diagram', language: 'mermaid', meaningfulTokens: false})),
  ];
}

function semanticClass(language) {
  if (language === 'bash') return 'command';
  if (language === 'shell-session') return 'terminal-transcript';
  if (language === 'text') return 'plain-output';
  if (language === 'mermaid') return 'diagram';
  if (language === 'diff') return 'diff';
  if (['json', 'json5', 'yaml', 'toml', 'ini', 'properties', 'docker'].includes(language)) return 'configuration';
  if (['markup', 'markdown'].includes(language)) return 'markup';
  return 'source-code';
}

function summarizeFences(fences) {
  const languages = countBy(fences, (fence) => fence.normalizedLanguage);
  const semanticClasses = countBy(fences, (fence) => fence.semanticClass);
  const rendered = fences.filter((fence) => fence.rendered?.found);
  return {
    fenceCount: fences.length,
    fencedSourceCount: new Set(fences.map((fence) => sourceKey(fence.repository ?? '', fence.sourcePath))).size,
    routeCount: new Set(fences.map((fence) => fence.publicRoute).filter(Boolean)).size,
    languages,
    semanticClasses,
    renderedCount: rendered.length,
    meaningfullyTokenizedCount: rendered.filter((fence) => fence.rendered.meaningfulTokens).length,
  };
}

function countBy(items, keyFor) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compareUtf8(left, right)));
}

function sortFences(fences) {
  return [...fences].sort((left, right) => {
    const sourceOrder = compareUtf8(sourceKey(left.repository ?? '', left.sourcePath), sourceKey(right.repository ?? '', right.sourcePath));
    if (sourceOrder !== 0) return sourceOrder;
    if (left.line !== right.line) return left.line - right.line;
    return compareUtf8(left.publicRoute ?? '', right.publicRoute ?? '');
  });
}

function generatedDocumentFile(route, sourcePath) {
  const relativeRoute = route.replace(/^\/docs\//, '').replace(/\/$/, '');
  const extension = path.extname(sourcePath).toLowerCase() === '.mdx' ? '.mdx' : '.md';
  return path.join(root, '.generated', 'docs', ...relativeRoute.split('/'), `index${extension}`);
}

function authoredPageRoute(file, source) {
  const slug = markdownFrontmatter(source).slug;
  if (typeof slug === 'string') return normalizeRoute(slug);
  let relativePage = path.relative(path.join(root, 'src', 'pages'), file).split(path.sep).join('/').replace(/\.mdx?$/i, '');
  relativePage = relativePage.replace(/(^|\/)index$/i, '$1');
  return normalizeRoute(`/${relativePage}`);
}

function markdownFrontmatter(source) {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closing < 0) return {};
  const document = parseYaml(lines.slice(1, closing).join('\n'));
  return document && typeof document === 'object' ? document : {};
}

function normalizeRoute(value) {
  const pathname = `/${String(value).replace(/^\/+|\/+$/g, '')}`.replace(/\/+/g, '/');
  return pathname === '/' ? '/' : `${pathname}/`;
}

function buildRoute(file) {
  const relativeFile = path.relative(path.join(root, 'build'), file).split(path.sep).join('/');
  if (relativeFile === 'index.html') return '/';
  if (relativeFile.endsWith('/index.html')) return `/${relativeFile.slice(0, -'index.html'.length)}`;
  return `/${relativeFile}`;
}

function missingRendering(fence) {
  return {
    kind: fence.expectedRendering,
    found: false,
    language: fence.normalizedLanguage,
    meaningfulTokens: false,
    matchesExpected: false,
  };
}

function deferredMermaidRendering() {
  return {
    kind: 'diagram',
    found: false,
    language: 'mermaid',
    meaningfulTokens: false,
    matchesExpected: true,
    verification: 'client-runtime',
  };
}

function markdownSourceRecord(source, fenceCount) {
  return {
    repository: source.repository,
    sourcePath: source.sourcePath,
    sourceRevision: source.sourceRevision,
    sourceKind: source.sourceKind,
    publicRoute: source.publicRoute,
    fenceCount,
  };
}

function compareMarkdownSources(left, right) {
  return compareUtf8(sourceKey(left.repository ?? '', left.sourcePath), sourceKey(right.repository ?? '', right.sourcePath));
}

function fenceLocation(fence) {
  const source = fence.repository ? `${fence.repository}/${fence.sourcePath}` : fence.sourcePath;
  return `${source}:${fence.line}${fence.publicRoute ? ` [${fence.publicRoute}]` : ''}`;
}

function sourceLocation(source) {
  return `${source.repository}/${source.sourcePath} [${source.publicRoute}]`;
}

function sourceKey(repository, sourcePath) {
  return `${repository}\0${sourcePath}`;
}

function findElements(rootNode, predicate) {
  const matches = [];
  const visit = (node) => {
    if (node?.tagName && predicate(node)) matches.push(node);
    for (const child of node?.childNodes ?? []) visit(child);
  };
  visit(rootNode);
  return matches;
}

function attribute(element, name) {
  return element.attrs?.find((candidate) => candidate.name === name)?.value;
}

function classNames(element) {
  return new Set((attribute(element, 'class') ?? '').split(/\s+/).filter(Boolean));
}

function languageClass(element) {
  for (const candidate of [element, ...findElements(element, () => true)]) {
    for (const name of classNames(candidate)) {
      if (name.startsWith('language-')) return name.slice('language-'.length);
    }
  }
  return undefined;
}

function hasMeaningfulTokens(element) {
  return findElements(element, (candidate) => {
    const names = classNames(candidate);
    return names.has('token') && [...names].some((name) => name !== 'token' && name !== 'plain');
  }).length > 0;
}

async function filesBelow(directory, pattern) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, {withFileTypes: true});
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(target, pattern));
    else if (entry.isFile() && pattern.test(entry.name)) files.push(target);
  }
  return files.sort((left, right) => compareUtf8(relative(left), relative(right)));
}

async function writeJson(file, document) {
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`);
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function main() {
  const mode = process.argv[2];
  if (!['source', 'build'].includes(mode)) throw new Error('usage: node scripts/code-contract.mjs <source|build>');
  const result = mode === 'source' ? await inspectSourceTree() : await inspectBuild();
  if (result.diagnostics.length) {
    console.error(result.diagnostics.join('\n'));
    process.exitCode = 1;
    return;
  }
  const report = mode === 'source' ? relative(sourceInventoryPath) : relative(renderedInventoryPath);
  console.log(`code contract (${mode}): ${result.inventory.summary.fenceCount} fences across ${result.inventory.summary.routeCount} routes; report ${report}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
