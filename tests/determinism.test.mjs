import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

test('site preparation is byte deterministic for one source lock', async () => {
  const env = {...process.env, B10X_BOOTSTRAP_FIXTURE: '1'};
  delete env.B10X_DOCS_SOURCE_SET;
  delete env.B10X_SOURCE_WORKSPACE;
  await exec('node', ['scripts/prepare-site.mjs'], {cwd: root, env});
  const first = await treeDigest(path.join(root, '.generated'));
  await exec('node', ['scripts/prepare-site.mjs'], {cwd: root, env});
  const second = await treeDigest(path.join(root, '.generated'));
  assert.equal(first, second);
});

async function treeDigest(directory) {
  const files = await walk(directory);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(directory, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(candidate)));
    else if (entry.isFile()) files.push(candidate);
  }
  return files.sort();
}
