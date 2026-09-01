import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'yaml';
import {compareUtf8} from './order-contract.mjs';

const hex40 = /^[0-9a-f]{40}$/;
const hex64 = /^[0-9a-f]{64}$/;

export async function validateSourceLock(root, {allowBootstrap = false} = {}) {
  const roster = parse(await readFile(path.join(root, 'sources.yaml'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'sources.lock.json'), 'utf8'));
  if (roster?.schema !== 'b10x-website-sources/v1' || !Array.isArray(roster.repositories)) {
    throw new Error('sources.yaml is not a b10x-website-sources/v1 roster');
  }
  if (lock?.schema !== 'b10x-sources/v1' || !Array.isArray(lock.sources)) {
    throw new Error('sources.lock.json is not a b10x-sources/v1 lock');
  }
  const expected = roster.repositories;
  if (expected.length !== 19 || new Set(expected).size !== 19 || expected.join('\n') !== [...expected].sort(compareUtf8).join('\n')) {
    throw new Error('sources.yaml must contain exactly 19 unique sorted source repositories');
  }
  if (JSON.stringify(roster.compatibilityRepositories) !== JSON.stringify(['getting-started']) || expected.includes('getting-started')) {
    throw new Error('sources.yaml must declare getting-started exactly once as compatibility-only, outside the source roster');
  }
  if (allowBootstrap && lock.sources.length === 0) return {roster, lock, bootstrap: true};
  const actual = lock.sources.map((source) => source.repository);
  if (actual.length !== 19 || actual.join('\n') !== expected.join('\n')) {
    throw new Error('production sources.lock.json must contain the exact sorted 19-repository roster');
  }
  for (const source of lock.sources) {
    if (source.url !== `https://github.com/beyond10x/${source.repository}`) throw new Error(`${source.repository} has an invalid source URL`);
    if (source.manifestPath !== 'b10x.docs.yaml') throw new Error(`${source.repository} has unexpected manifest path ${source.manifestPath}`);
    if (!hex40.test(source.commit) || /^0+$/.test(source.commit)) throw new Error(`${source.repository} has an invalid or zero source commit`);
    if (!hex64.test(source.manifestSha256) || /^0+$/.test(source.manifestSha256)) throw new Error(`${source.repository} has an invalid manifest digest`);
    if (!hex64.test(source.contentSha256) || /^0+$/.test(source.contentSha256)) throw new Error(`${source.repository} has an invalid content digest`);
  }
  return {roster, lock, bootstrap: false};
}

export function bootstrapEnabled(environment = process.env) {
  return environment.B10X_BOOTSTRAP_FIXTURE === '1';
}
