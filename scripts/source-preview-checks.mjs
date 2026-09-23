//! Every refusal the portal makes on one source's own bytes, run at staging time.
//!
//! A source preview exits 1 when the source under preview is invalid and 2 only when the preview
//! cannot be built or served. For that split to hold, each check that `prepare-site.mjs` and the
//! portal's MDX compiler apply to a source's documents — and that depends on nothing but those bytes
//! — must be asked here first. Each check below names the step it mirrors; a new per-document refusal
//! there needs its counterpart here.
//!
//! | portal step                                          | mirrored by                        |
//! |------------------------------------------------------|------------------------------------|
//! | `splitFrontmatter` YAML parse (prepare-site.mjs:868) | `frontmatterOf`                    |
//! | `normalizePassiveMarkdown` managed ranges (:404,:478)| `normalizePassiveMarkdown` itself  |
//! | `sourceSidebarMetadata` (:403)                       | `sourceSidebarMetadata` itself     |
//! | `resolveDocumentPageMetadata`, v4 and v5 (:638, :480)| `resolveDocumentPageMetadata`      |
//! | `assertSearchAudienceVocabulary` (:681)              | `assertSearchAudienceVocabulary`   |
//! | `normalizeBlogDate` (:768)                           | `blogDateRefusal`                  |
//! | `assertUniqueDestination` (:959)                     | `destinationOf`                    |
//! | `declaredNavigationRefusals` (materializeCollection) | `declaredNavigationRefusals` itself |
//! | data/specification JSON or YAML parse (:511, :550)   | `structuredRefusal`                |
//! | specification route under /api/ (:514)              | `structuredRefusal`                |
//! | Docusaurus MDX compile of the generated page         | `compileRefusal`                   |
//!
//! Compilation only: the compiled program is discarded and never evaluated.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse as parseYaml} from 'yaml';
import {resolveDocumentPageMetadata} from '@beyond10x/docs-system/documents';
import {normalizePassiveMarkdown} from './passive-markdown.mjs';
import {assertSearchAudienceVocabulary} from './search-metadata-contract.mjs';
import {declaredDocumentRoute, declaredNavigationRefusals, documentPagePath, documentSourceRelative, isMenuWithheld, sourceSidebarMetadata} from './sidebar-contract.mjs';

const require = createRequire(import.meta.url);

/**
 * The compile Docusaurus applies to a generated page in this Website. `docusaurus.config.ts` sets
 * no `markdown.format`, so every page — `.md` included — is MDX; `future.v4: true` turns every
 * `mdx1Compat` option off, so the preprocessor only unwraps MDX code blocks. Of the remark plugins
 * Docusaurus installs, `remark-directive` and `remark-gfm` extend the syntax; the others transform
 * a tree that already parsed. `tests/source-preview.test.mjs` fails when the config stops matching.
 */
export const portalMarkdownConfig = Object.freeze({
  format: 'mdx',
  mdx1Compat: Object.freeze({comments: false, admonitions: false, headingIds: false}),
});

let compiler;
async function portalCompiler() {
  compiler ??= (async () => {
    const [{compile}, {default: remarkDirective}, {default: remarkGfm}] = await Promise.all([
      import('@mdx-js/mdx'),
      import('remark-directive'),
      import('remark-gfm'),
    ]);
    const preprocess = require('@docusaurus/mdx-loader/lib/preprocessor.js').default;
    return async (content, filePath) => {
      const fileContent = preprocess({fileContent: content, filePath, markdownConfig: portalMarkdownConfig, admonitions: true});
      await compile({value: fileContent, path: filePath}, {
        format: portalMarkdownConfig.format,
        remarkPlugins: [remarkDirective, remarkGfm],
        providerImportSource: '@mdx-js/react',
      });
    };
  })();
  return compiler;
}

export async function portalRefusals({manifest, index, treeRoot}) {
  const refusals = [];
  const destinations = new Map();
  const surfaces = new Map(manifest.surfaces.map((surface) => [surface.id, surface]));
  const compile = await portalCompiler();
  refusals.push(...declaredNavigationRefusals(manifest, index.files.filter((file) => file.kind === 'document')));
  for (const file of index.files) {
    const where = file.sourcePath;
    const absolute = path.join(treeRoot, ...file.sourcePath.split('/'));
    if (file.kind === 'data' || file.kind === 'openapi' || file.kind === 'json-schema') {
      const refusal = structuredRefusal(file, await readFile(absolute, 'utf8'));
      if (refusal) refusals.push(`${where}: ${refusal}`);
      continue;
    }
    if (file.kind !== 'document' && file.kind !== 'blog') continue;
    const raw = await readFile(absolute, 'utf8');
    let split;
    try {
      split = frontmatterOf(raw);
    } catch (error) {
      refusals.push(`${where}: frontmatter is not valid YAML: ${firstLine(error)}`);
      continue;
    }
    const {frontmatter, body} = split;
    const title = frontmatter.title ?? firstHeading(body) ?? path.basename(file.sourcePath, path.extname(file.sourcePath));
    const attempt = async (label, check) => {
      try {
        return await check();
      } catch (error) {
        refusals.push(`${where}: ${label}: ${firstLine(error)}`);
        return undefined;
      }
    };
    const normalized = await attempt('managed documentation range', () => normalizePassiveMarkdown(body));
    const resolved = manifest.schema === 'b10x-docs/v4' || manifest.schema === 'b10x-docs/v5'
      ? await attempt('page metadata', () => resolveDocumentPageMetadata(manifest, file.surface, raw, `${file.repository}/${file.sourcePath}`))
      : undefined;
    if (file.kind === 'document') {
      await attempt('sidebar metadata', () => sourceSidebarMetadata(frontmatter, title));
      const declared = frontmatter.b10x && typeof frontmatter.b10x === 'object' ? frontmatter.b10x : {};
      const surface = surfaces.get(file.surface);
      const audiences = resolved
        ? resolved.effective.audiences
        : stringArray(declared.audiences, surface?.audiences?.length ? surface.audiences : ['developer']);
      await attempt('search metadata', () => assertSearchAudienceVocabulary(audiences, `${where} search metadata`));
      const destination = destinationOf(file, surface);
      if (destination) {
        const previous = destinations.get(destination);
        if (previous) refusals.push(`${where}: duplicate portal page ${destination}, also produced by ${previous}`);
        else destinations.set(destination, where);
      }
    } else {
      const dateRefusal = blogDateRefusal(frontmatter, file.sourcePath);
      if (dateRefusal) refusals.push(`${where}: ${dateRefusal}`);
      await attempt('search metadata', () => assertSearchAudienceVocabulary(resolved?.effective.audiences ?? ['researcher'], `${where} search metadata`));
    }
    if (normalized !== undefined) {
      await attempt('the portal MDX compiler refuses it', () => compile(normalized, absolute));
    }
  }
  return refusals;
}

/** prepare-site.mjs:868 `splitFrontmatter`: the same block, parsed by the same YAML parser. */
function frontmatterOf(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return {frontmatter: {}, body: source};
  const parsed = parseYaml(match[1]) ?? {};
  return {frontmatter: parsed && typeof parsed === 'object' ? parsed : {}, body: source.slice(match[0].length)};
}

function firstHeading(source) {
  return /^#\s+(.+)$/m.exec(source)?.[1]?.replace(/[*_`]/g, '').trim();
}

function stringArray(value, fallback) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...new Set(value)] : [...new Set(fallback)];
}

/** prepare-site.mjs:768 `normalizeBlogDate`, applied to the same value :477 derives. */
function blogDateRefusal(frontmatter, sourcePath) {
  const input = String(frontmatter.date ?? /^([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(path.basename(sourcePath))?.[1] ?? '1970-01-01');
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return undefined;
  return Number.isFinite(new Date(input).getTime()) ? undefined : `invalid source blog date ${input}`;
}

/** prepare-site.mjs `documentRoute` and `documentPagePath`: the page a document becomes, through the same functions. */
function destinationOf(file, surface) {
  if (!surface?.routeBase?.startsWith('/docs/')) return undefined;
  const relative = documentSourceRelative(file);
  return documentPagePath(declaredDocumentRoute(surface, relative), file.sourcePath, {withheld: isMenuWithheld(surface, relative)});
}

function structuredRefusal(file, raw) {
  try {
    if (file.sourcePath.endsWith('.json')) JSON.parse(raw);
    else parseYaml(raw);
  } catch (error) {
    return `not valid ${file.sourcePath.endsWith('.json') ? 'JSON' : 'YAML'}: ${firstLine(error)}`;
  }
  if ((file.kind === 'openapi' || file.kind === 'json-schema') && !file.route?.startsWith('/api/')) {
    return 'specification route must begin /api/';
  }
  return undefined;
}

function firstLine(error) {
  return String(error instanceof Error ? error.message : error).split('\n')[0];
}
