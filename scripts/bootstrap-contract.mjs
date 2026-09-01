import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './artifact-contract.mjs';

export async function validateBootstrapSnapshots(root, rosterRepositories) {
  const directory = path.join(root, 'data', 'bootstrap');
  const metadata = JSON.parse(await readFile(path.join(directory, 'metadata.json'), 'utf8'));
  if (metadata.schema !== 'b10x-bootstrap-snapshot/v1' || !/^[0-9a-f]{40}$/.test(metadata.sourceRevision)) {
    throw new Error('bootstrap snapshot metadata is invalid');
  }
  const names = ['changes.json', 'ecosystem.json', 'release-facts.json'];
  const documents = {};
  for (const name of names) {
    const bytes = await readFile(path.join(directory, name));
    if (metadata.files?.[name] !== sha256(bytes)) throw new Error(`bootstrap ${name} does not match its typed snapshot metadata`);
    documents[name] = JSON.parse(bytes);
  }
  const known = new Set(rosterRepositories);
  const ecosystem = documents['ecosystem.json'];
  if (ecosystem.schema !== 'b10x-docs-registry/v2' || !Array.isArray(ecosystem.surfaces)) throw new Error('bootstrap ecosystem registry is invalid');
  const surfaceKeys = new Set();
  for (const surface of ecosystem.surfaces) {
    const repository = surface.repository?.id;
    if (!known.has(repository) && repository !== 'getting-started') throw new Error(`bootstrap ecosystem contains unknown repository ${repository}`);
    const key = `${repository}/${surface.id}`;
    if (surfaceKeys.has(key) || !surface.name || !surface.summary || !surface.repository?.url) throw new Error(`bootstrap ecosystem contains invalid or duplicate surface ${key}`);
    surfaceKeys.add(key);
  }
  const ledger = documents['changes.json'];
  if (ledger.schema !== 'b10x-change-ledger/v1' || !Array.isArray(ledger.changes)) throw new Error('bootstrap change ledger is invalid');
  validateEntries(ledger.changes, known, 'change', (entry) => entry.key ?? entry.id);
  const releases = documents['release-facts.json'];
  if (releases.schema !== 'b10x-release-facts/v1' || !Array.isArray(releases.releases)) throw new Error('bootstrap release facts are invalid');
  validateEntries(releases.releases, known, 'release', (entry) => `${entry.repository}@${entry.version}`);
  return {metadata, ecosystem, ledger, releases};
}

function validateEntries(entries, known, kind, keyFor) {
  const keys = new Set();
  let previous = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    const key = keyFor(entry);
    const timestamp = Date.parse(entry.publishedAt);
    if (!known.has(entry.repository) || !key || keys.has(key) || !Number.isFinite(timestamp) || timestamp > previous || !/^https:\/\/github\.com\/beyond10x\//.test(entry.source?.url ?? entry.url ?? '')) {
      throw new Error(`bootstrap ${kind} entry ${key ?? '<unknown>'} is invalid, duplicated, stale, or out of order`);
    }
    keys.add(key);
    previous = timestamp;
  }
}
