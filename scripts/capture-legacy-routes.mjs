import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {compareUtf8} from './order-contract.mjs';
import {ROOT_OWNED_REDIRECTS} from './root-redirect-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const repositories = [
  'aep',
  'aep-service',
  'agentic-principles',
  'agentplugins',
  'entity-runtime',
  'ess',
  'getting-started',
  'harness',
  'metaharness',
  'substrate',
];
const redirects = [];

for (const repository of repositories) {
  const sitemapUrl = `https://beyond10x.github.io/${repository}/sitemap.xml`;
  const response = await fetch(sitemapUrl, {headers: {'user-agent': 'b10x-website-route-capture/1'}});
  if (!response.ok) throw new Error(`${sitemapUrl} returned ${response.status}`);
  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1]));
  if (locations.length === 0) throw new Error(`${sitemapUrl} contains no routes`);
  for (const location of locations) {
    const url = new URL(location);
    redirects.push({from: url.pathname, to: canonicalTarget(repository, url.pathname), type: 'html'});
  }
}

redirects.push(
  {from: '/aep/releases/atom.xml', source: 'releases/aep/atom.xml', type: 'alias', mediaType: 'application/atom+xml'},
  {from: '/aep/releases/rss.xml', source: 'releases/aep/rss.xml', type: 'alias', mediaType: 'application/rss+xml'},
  {from: '/aep-service/openapi.json', source: 'api/aep-service/openapi.json', type: 'alias', mediaType: 'application/json'},
  {from: '/agentic-principles/blog/atom.xml', source: 'updates/field-notes/atom.xml', type: 'alias', mediaType: 'application/atom+xml'},
  {from: '/agentic-principles/blog/feed.json', source: 'updates/field-notes/feed.json', type: 'alias', mediaType: 'application/feed+json'},
  {from: '/agentic-principles/blog/rss.xml', source: 'updates/field-notes/rss.xml', type: 'alias', mediaType: 'application/rss+xml'},
  {from: '/ess/releases/atom.xml', source: 'releases/ess/atom.xml', type: 'alias', mediaType: 'application/atom+xml'},
  {from: '/ess/releases/rss.xml', source: 'releases/ess/rss.xml', type: 'alias', mediaType: 'application/rss+xml'},
  {from: '/ess/lab/billing_web_realized.wasm', source: 'artifacts/ess/lab/billing_web_realized.wasm', type: 'alias', mediaType: 'application/wasm'},
  {from: '/getting-started/changes/feed.json', source: 'changes/feed.json', type: 'alias', mediaType: 'application/feed+json'},
  {from: '/getting-started/changes.json', source: 'changes.json', type: 'alias', mediaType: 'application/json'},
  {from: '/getting-started/changes/rss.xml', source: 'changes/rss.xml', type: 'alias', mediaType: 'application/rss+xml'},
  {from: '/getting-started/ecosystem.json', source: 'ecosystem.json', type: 'alias', mediaType: 'application/json'},
  {from: '/getting-started/release-facts.json', source: 'release-facts.json', type: 'alias', mediaType: 'application/json'},
  ...ROOT_OWNED_REDIRECTS,
);

redirects.sort((left, right) => compareUtf8(left.from, right.from) || compareUtf8(left.type, right.type));
const seen = new Set();
for (const redirect of redirects) {
  if (seen.has(redirect.from)) throw new Error(`duplicate legacy route ${redirect.from}`);
  seen.add(redirect.from);
}
const htmlCount = redirects.filter((redirect) => redirect.type === 'html').length;
if (htmlCount !== 220) throw new Error(`expected 220 legacy HTML routes, captured ${htmlCount}`);
await writeFile(
  path.join(root, 'legacy-routes.json'),
  `${JSON.stringify({schema: 'b10x-redirects/v1', origin: 'https://beyond10x.github.io', redirects}, null, 2)}\n`,
);
process.stdout.write(`captured ${htmlCount} HTML routes and ${redirects.length - htmlCount} machine aliases\n`);

function canonicalTarget(repository, pathname) {
  const prefix = `/${repository}`;
  const relative = pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '');
  if (repository === 'getting-started') {
    if (!relative) return '/';
    if (relative === 'ecosystem') return '/ecosystem/';
    if (relative === 'changes' || relative === 'updates') return '/changes/';
    return `/${relative}/`;
  }
  if (!relative) return `/ecosystem/${repository}/`;
  if (relative === 'docs') return `/docs/${repository}/`;
  if (relative.startsWith('docs/')) return `/docs/${repository}/${relative.slice(5)}/`;
  if (relative === 'api' || relative.startsWith('api/')) {
    const suffix = relative === 'api' ? '' : `${relative.slice(4)}/`;
    return `/api/${repository}/${suffix}`;
  }
  if (relative === 'releases' || relative.startsWith('releases/')) return '/releases/';
  if (repository === 'agentic-principles' && (relative === 'blog' || relative.startsWith('blog/'))) {
    const suffix = relative === 'blog' ? '' : `${relative.slice(5)}/`;
    return `/updates/field-notes/${suffix}`;
  }
  return `/docs/${repository}/${relative}/`;
}

function decodeXml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
}
