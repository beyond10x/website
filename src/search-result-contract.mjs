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
