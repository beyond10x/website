import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {prioritizeSearchResults} from '../src/search-result-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const pagefindRoot = path.join(root, 'build', 'pagefind');
const pagefindBase = pathToFileURL(`${pagefindRoot}${path.sep}`);
const golden = JSON.parse(await readFile(path.join(root, 'data', 'search-golden.json'), 'utf8'));
const entry = JSON.parse(await readFile(path.join(pagefindRoot, 'pagefind-entry.json'), 'utf8'));
const documentIndex = JSON.parse(await readFile(path.join(root, 'build', 'document-index.json'), 'utf8'));
const audienceVocabulary = new Set(['adopter', 'developer', 'evaluator', 'operator', 'researcher']);

if (golden.schema !== 'b10x-search-golden/v1' || !Array.isArray(golden.queries) || golden.queries.length === 0) {
  throw new Error('search golden contract must use b10x-search-golden/v1 and contain queries');
}
if (documentIndex.schema !== 'b10x-document-index/v1' || !Array.isArray(documentIndex.documents)) {
  throw new Error('built document index must use b10x-document-index/v1');
}
const indexedPages = Object.values(entry.languages ?? {}).reduce((sum, language) => sum + (language.page_count ?? 0), 0);
if (indexedPages < documentIndex.documents.length + 6) {
  throw new Error(`Pagefind indexed ${indexedPages} pages, fewer than the source corpus and six experience pages`);
}

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
  if (!url.startsWith('file:')) return nativeFetch(input, init);
  const bytes = await readFile(fileURLToPath(url));
  return new Response(bytes, {
    status: 200,
    headers: {'content-type': url.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'},
  });
};

try {
  const pagefind = await import(new URL('pagefind.js', pagefindBase).href);
  await pagefind.options({
    basePath: pagefindBase.href,
    baseUrl: '/',
    ranking: {metaWeights: {title: 5, qualified_title: 5, search_priority: 10}},
  });
  const filters = await pagefind.filters();
  for (const key of ['experience', 'audience', 'project', 'document_type']) {
    if (!filters[key] || Object.keys(filters[key]).length === 0) {
      throw new Error(`Pagefind did not emit the required ${key} filter`);
    }
  }
  const undeclaredAudiences = Object.keys(filters.audience).filter((audience) => !audienceVocabulary.has(audience));
  if (undeclaredAudiences.length > 0) {
    throw new Error(`Pagefind emitted undeclared audience filters: ${undeclaredAudiences.join(', ')}`);
  }

  for (const goldenQuery of golden.queries) {
    const response = await pagefind.search(goldenQuery.query);
    const candidates = await Promise.all(response.results.slice(0, 5).map((result) => result.data()));
    if (candidates[0]?.url !== goldenQuery.expectedFirst) {
      throw new Error(
        `search ${JSON.stringify(goldenQuery.query)} ranked ${candidates[0]?.url ?? 'no result'} first; `
        + `expected ${goldenQuery.expectedFirst}; top results: ${candidates.map((candidate) => candidate.url).join(', ')}`,
      );
    }
  }

  const experienceFilters = {experience: 'try-spec-driven-development'};
  const experienceResponse = await pagefind.search(null, {filters: experienceFilters});
  const landingResponse = await pagefind.search(null, {filters: {...experienceFilters, document_type: 'experience'}});
  const experienceCandidates = prioritizeSearchResults(experienceResponse.results, landingResponse.results, 40);
  const firstExperience = experienceCandidates[0] ? await experienceCandidates[0].data() : undefined;
  if (firstExperience?.url !== '/start/spec-driven-development/') {
    throw new Error(`filter-only practitioner search must surface the canonical experience first, received ${firstExperience?.url ?? 'no result'}`);
  }
} finally {
  globalThis.fetch = nativeFetch;
}

process.stdout.write(`verified ${golden.queries.length} golden searches across ${indexedPages} indexed pages\n`);
