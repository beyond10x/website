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

export function resultCountDescription(displayed, total) {
  return `Showing ${displayed} of ${total} matching ${total === 1 ? 'page' : 'pages'}.`;
}

function resultKey(result) {
  if (!result || typeof result.id !== 'string' || !result.id) {
    throw new Error('Pagefind result must expose a stable id');
  }
  return result.id;
}
