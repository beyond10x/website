import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {prioritizeSearchResults, resultSummary} from '../src/search-result-contract.mjs';

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
  if (filters.project.bench || documentIndex.documents.some((document) => document.project === 'bench' || document.route.startsWith('/docs/bench/'))) {
    throw new Error('private Bench material must not enter the public document index or Pagefind project filters');
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

  for (const query of ['agent plugins', 'approval']) {
    const typedResponse = await pagefind.search(query);
    const typedCandidates = await Promise.all(typedResponse.results.slice(0, 10).map((result) => result.data()));
    if (typedCandidates.length === 0) throw new Error(`typed search ${JSON.stringify(query)} must return indexed documentation`);
    for (const candidate of typedCandidates) {
      const summary = resultSummary(candidate);
      if (/source-owned (?:documentation|field note)|\b[0-9a-f]{40}\b/i.test(summary.slice(0, 240))) {
        throw new Error(`typed search ${JSON.stringify(query)} result ${candidate.url} leads with source provenance: ${summary}`);
      }
    }
  }

  const entityResponse = await pagefind.search('shared capability layer', {filters: {project: 'agentplugins'}});
  const entityCandidate = entityResponse.results[0] ? await entityResponse.results[0].data() : undefined;
  const entitySummary = resultSummary(entityCandidate);
  if (!entitySummary.includes('skills/<name>/SKILL.md') || entitySummary.includes('&lt;name')) {
    throw new Error(`typed search summaries must decode code placeholders as plain text: ${entitySummary || 'no result'}`);
  }

  const operatorResponse = await pagefind.search(null, {filters: {audience: 'operator'}});
  const operatorCandidates = await Promise.all(operatorResponse.results.map((result) => result.data()));
  if (operatorCandidates.length === 0) throw new Error('operator search must return indexed documentation');
  for (const candidate of operatorCandidates) {
    if (!candidate.meta.description || !resultSummary(candidate, {preferDescription: true})) {
      throw new Error(`operator search result ${candidate.url} must expose an explicit human description`);
    }
    if (/Skip to main content|On this page|(?:experience|reference){2,}|[a-z-]+(?:experience|reference)(?:adopter|developer|evaluator|operator|researcher)/i.test(candidate.excerpt)) {
      throw new Error(`operator search result ${candidate.url} excerpt contains navigation chrome or concatenated filter payload`);
    }
  }
  const operate = operatorCandidates.find((candidate) => candidate.url === '/operate/');
  const expectedOperateSummary = 'Find service operations material without pushing cluster and chart detail into the practitioner onboarding path.';
  if (resultSummary(operate, {preferDescription: true}) !== expectedOperateSummary) {
    throw new Error(`operator experience summary is not the canonical human description: ${resultSummary(operate, {preferDescription: true}) || 'missing'}`);
  }
} finally {
  globalThis.fetch = nativeFetch;
}

process.stdout.write(`verified ${golden.queries.length} golden searches and typed-query summaries across ${indexedPages} indexed pages\n`);
