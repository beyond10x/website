import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {outputPathForRoute, renderRedirectHtml, writeRedirectMap} from '@beyond10x/docs-system/redirects';

export const ROOT_OWNED_REDIRECTS = Object.freeze([
  Object.freeze({from: '/engineering-protocols/', to: '/ecosystem/aep/', type: 'html'}),
  Object.freeze({from: '/journeys/', to: '/start/', type: 'html'}),
  Object.freeze({from: '/journeys/build-agents/', to: '/build/agent-systems/', type: 'html'}),
  Object.freeze({from: '/journeys/operate-services/', to: '/operate/', type: 'html'}),
  Object.freeze({from: '/journeys/plan-work/', to: '/start/spec-driven-development/', type: 'html'}),
  Object.freeze({from: '/journeys/specify/', to: '/start/spec-driven-development/', type: 'html'}),
  Object.freeze({from: '/journeys/understand/', to: '/learn/safe-agentic-coding/', type: 'html'}),
  Object.freeze({from: '/website/', to: '/', type: 'html'}),
]);

export function rootOwnedRedirectMap(declared) {
  if (declared?.schema !== 'b10x-redirects/v1' || declared.origin !== 'https://beyond10x.github.io' || !Array.isArray(declared.redirects)) {
    throw new Error('legacy redirect contract is invalid');
  }
  const redirects = ROOT_OWNED_REDIRECTS.map((expected) => {
    const matches = declared.redirects.filter((redirect) => redirect.from === expected.from);
    if (matches.length !== 1 || !sameRedirect(matches[0], expected)) {
      throw new Error(`root-owned redirect ${expected.from} must exactly target ${expected.to}`);
    }
    return expected;
  });
  return {schema: declared.schema, origin: declared.origin, redirects};
}

export async function writeRootOwnedRedirects(outputRoot, declared) {
  const map = rootOwnedRedirectMap(declared);
  for (const redirect of map.redirects) {
    const destination = path.join(outputRoot, ...outputPathForRoute(redirect.from, true).split('/'));
    let current;
    try {
      current = await readFile(destination, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const expected = renderRedirectHtml(map.origin, redirect);
    if (current !== undefined && current !== expected) {
      throw new Error(`root-owned redirect ${redirect.from} collides with generated site output`);
    }
  }
  await writeRedirectMap(outputRoot, map);
  return map;
}

function sameRedirect(actual, expected) {
  return actual
    && Object.keys(actual).length === 3
    && actual.from === expected.from
    && actual.to === expected.to
    && actual.type === expected.type;
}
