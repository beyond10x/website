// Preloaded with `node --import` by tests/source-preview-adversary-2.test.mjs. It stands in for a
// network on which the publication origin accepts the request and then never finishes answering:
// every request to https://beyond10x.github.io is sent, unchanged otherwise, to the local server
// named by B10X_ADVERSARY_ORIGIN. Nothing in scripts/ is modified.
const target = process.env.B10X_ADVERSARY_ORIGIN;
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  if (target && url.startsWith('https://beyond10x.github.io/')) {
    return realFetch(`${target}/${url.slice('https://beyond10x.github.io/'.length)}`, init);
  }
  return realFetch(input, init);
};
