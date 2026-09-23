export function prioritizeSearchResults(results, preferred, limit = 40) {
  const available = new Set(results.map(resultKey));
  const seen = new Set();
  const ordered = [];
  for (const result of [...preferred, ...results]) {
    const key = resultKey(result);
    if (!available.has(key) || seen.has(key)) continue;
    seen.add(key);
    ordered.push(result);
    if (ordered.length === limit) break;
  }
  return ordered;
}

export function preferredExperienceFilters(query, filters) {
  const hasContext = Object.values(filters).some(Boolean);
  if (String(query ?? '').trim().length >= 2 || !hasContext || filters.document_type) return undefined;
  return {...filters, document_type: 'experience'};
}

export function significantQueryTokens(query) {
  return String(query ?? '')
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((chunk) => chunk.split(/(?<=[a-zA-Z])(?=[0-9])|(?<=[0-9])(?=[a-zA-Z])/))
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3);
}

export function isRelevantSearchResult(query, result) {
  const tokens = significantQueryTokens(query);
  if (tokens.length === 0) return true;
  const highlighted = [...String(result?.excerpt ?? '').matchAll(/<mark>([^<]*)<\/mark>/gi)]
    .map((match) => decodeHtmlEntities(match[1]).toLocaleLowerCase())
    .filter(Boolean);
  const haystack = [result?.meta?.qualified_title, result?.meta?.title, result?.meta?.description]
    .filter(Boolean)
    .map((value) => decodeHtmlEntities(String(value)).toLocaleLowerCase());
  return tokens.some((token) =>
    highlighted.some((term) => sharesSignificantOverlap(token, term))
    || haystack.some((text) => text.includes(token)));
}

function sharesSignificantOverlap(token, term) {
  if (!term) return false;
  const shorter = Math.min(token.length, term.length);
  const longer = Math.max(token.length, term.length);
  if (shorter < 3 || shorter / longer < 0.6) return false;
  let sharedPrefix = 0;
  while (sharedPrefix < shorter && token[sharedPrefix] === term[sharedPrefix]) sharedPrefix += 1;
  return sharedPrefix >= Math.max(3, Math.ceil(shorter * 0.6));
}

export function resultCountDescription(displayed, total) {
  return `Showing ${displayed} of ${total} matching ${total === 1 ? 'page' : 'pages'}.`;
}

export function resultSummary(result, {preferDescription = false} = {}) {
  const description = normalizeSummary(result?.meta?.description);
  const excerpt = normalizeSummary(result?.excerpt)
    .replace(/^(?:(?:Skip to main content|On this page)\.\s*)+/i, '');
  if (preferDescription && description) return description;
  return excerpt || description;
}

function normalizeSummary(value) {
  return decodeHtmlEntities(String(value ?? '')
    .replace(/<\/?mark>/gi, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  const named = {amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"'};
  return value.replace(/&(?:#([0-9]+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, decimal, hexadecimal, name) => {
    if (name) return named[name.toLowerCase()] ?? entity;
    const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return entity;
    }
    return String.fromCodePoint(codePoint);
  });
}

function resultKey(result) {
  if (!result || typeof result.id !== 'string' || !result.id) {
    throw new Error('Pagefind result must expose a stable id');
  }
  return result.id;
}
