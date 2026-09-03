import {readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'parse5';
import {compareUtf8} from './order-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const htmlFiles = await findHtmlFiles(build);

if (htmlFiles.length === 0) throw new Error('Pagefind input contains no HTML files');

let searchAttributePages = 0;
let sourceProvenanceCount = 0;
const prepared = [];
for (const file of htmlFiles) {
  const source = await readFile(file, 'utf8');
  const document = parse(source, {sourceCodeLocationInfo: true});
  const mainElements = findElements(document, (element) => element.tagName === 'main');
  if (mainElements.length !== 1) {
    throw new Error(`${path.relative(build, file)} must expose exactly one main element for Pagefind, found ${mainElements.length}`);
  }

  const searchAttributes = findElements(document, (element) => attribute(element, 'class')?.split(/\s+/).includes('b10x-search-attributes'));
  if (searchAttributes.length > 0) searchAttributePages += 1;
  for (const element of searchAttributes) {
    if (attribute(element, 'data-pagefind-ignore') === undefined) {
      throw new Error(`${path.relative(build, file)} search metadata must be excluded from Pagefind body excerpts`);
    }
  }

  const sourceProvenance = findElements(document, (element) => (
    attribute(element, 'class')?.split(/\s+/).includes('b10x-source-banner')
    || attribute(element, 'data-b10x-source-provenance') !== undefined
  ));
  sourceProvenanceCount += sourceProvenance.length;
  for (const element of sourceProvenance) {
    if (attribute(element, 'data-pagefind-ignore') === undefined) {
      throw new Error(`${path.relative(build, file)} source provenance must be excluded from Pagefind body excerpts`);
    }
  }

  const main = mainElements[0];
  if (attribute(main, 'data-pagefind-body') === undefined) {
    const offset = main.sourceCodeLocation?.startTag?.startOffset;
    if (!Number.isInteger(offset) || source.slice(offset, offset + 5).toLowerCase() !== '<main') {
      throw new Error(`${path.relative(build, file)} main element has no stable source location`);
    }
    prepared.push([file, `${source.slice(0, offset + 5)} data-pagefind-body${source.slice(offset + 5)}`]);
  }
}

if (searchAttributePages === 0) throw new Error('Pagefind input contains no typed search metadata');
if (sourceProvenanceCount === 0) throw new Error('Pagefind input contains no source provenance');
await Promise.all(prepared.map(([file, source]) => writeFile(file, source)));
process.stdout.write(`verified and marked ${htmlFiles.length} Pagefind main inputs with ignored filter payloads on ${searchAttributePages} pages and ${sourceProvenanceCount} ignored source provenance blocks\n`);

async function findHtmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (entry.name === 'pagefind') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findHtmlFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(target);
  }
  return files.sort((left, right) => compareUtf8(path.relative(build, left), path.relative(build, right)));
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
