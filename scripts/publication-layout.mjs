import {access, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {artifactFacts, canonicalJson} from './artifact-contract.mjs';
import {validateBootstrapSnapshots} from './bootstrap-contract.mjs';
import {compareUtf8} from './order-contract.mjs';
import {loadPublicationInputs, SOURCE_SET_ENVIRONMENT} from './publication-inputs.mjs';

export const PUBLICATION_LAYOUT_SCHEMA = 'b10x-publication-layout/v2';
export const PUBLICATION_LAYOUT_FILE = 'publication.json';

const layoutDocument = Object.freeze({
  schema: PUBLICATION_LAYOUT_SCHEMA,
  site: 'site',
  sourceSet: 'inputs/source-set.json',
});

export async function resolvePublicationLayout(publicationRoot) {
  const root = await realDirectory(publicationRoot, 'publication root');
  const marker = path.join(root, PUBLICATION_LAYOUT_FILE);
  let bytes;
  try {
    bytes = await readFile(marker);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (!bytes) {
    await regularFile(path.join(root, 'PROVENANCE.json'), 'legacy publication provenance');
    return {
      schema: 'b10x-publication-layout/v1',
      root,
      siteRoot: root,
      siteRelative: '.',
      sourceSetPath: undefined,
      inputsRoot: undefined,
    };
  }

  await regularFile(marker, 'publication layout marker');
  const document = JSON.parse(bytes);
  if (bytes.toString('utf8') !== canonicalJson(document)
    || canonicalJson(document) !== canonicalJson(layoutDocument)) {
    throw new Error(`${PUBLICATION_LAYOUT_FILE} is not the exact canonical ${PUBLICATION_LAYOUT_SCHEMA} contract`);
  }
  try {
    await access(path.join(root, 'PROVENANCE.json'));
    throw new Error('publication mixes legacy flat provenance with layout v2');
  } catch (error) {
    if (error?.message?.includes('mixes legacy')) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  const siteRoot = await realDirectory(path.join(root, document.site), 'layout v2 site');
  const inputsRoot = await realDirectory(path.join(root, 'inputs'), 'layout v2 inputs');
  const sourceSetPath = await regularFile(path.join(root, document.sourceSet), 'layout v2 source set');
  if (siteRoot !== path.join(root, 'site')
    || inputsRoot !== path.join(root, 'inputs')
    || sourceSetPath !== path.join(root, 'inputs', 'source-set.json')) {
    throw new Error('layout v2 paths must not resolve outside their fixed publication directories');
  }
  await regularFile(path.join(siteRoot, 'PROVENANCE.json'), 'layout v2 site provenance');
  const topLevel = (await readdir(root, {withFileTypes: true}))
    .map((entry) => entry.name)
    .filter((name) => name !== '.git')
    .sort(compareUtf8);
  const expected = ['inputs', PUBLICATION_LAYOUT_FILE, 'site'].sort(compareUtf8);
  if (topLevel.join('\n') !== expected.join('\n')) {
    throw new Error('layout v2 publication root contains entries outside publication.json, site, and inputs');
  }
  return {
    schema: PUBLICATION_LAYOUT_SCHEMA,
    root,
    siteRoot,
    siteRelative: 'site',
    sourceSetPath,
    inputsRoot,
  };
}

export async function writePublicationLayout({websiteRoot, siteRoot, inputsRoot, outputRoot}) {
  const website = await realDirectory(websiteRoot, 'Website root');
  const site = await realDirectory(siteRoot, 'built site');
  const inputs = await realDirectory(inputsRoot, 'publication inputs');
  const sourceSet = path.join(inputs, 'source-set.json');
  const environment = {...process.env, [SOURCE_SET_ENVIRONMENT]: sourceSet};
  delete environment.B10X_BOOTSTRAP_FIXTURE;
  delete environment.B10X_SOURCE_WORKSPACE;
  const publicationInputs = await loadPublicationInputs({
    root: website,
    environment,
  });
  await validateBootstrapSnapshots(website, publicationInputs.roster.repositories, {
    directory: publicationInputs.bootstrapRoot,
    sourceSetSha256: publicationInputs.sourceSetSha256,
    websiteRevision: publicationInputs.sourceSet.websiteRuntimeCommit,
    sourceRevision: publicationInputs.sourceSet.atlasControlCommit,
  });
  const provenanceBytes = await readFile(path.join(site, 'PROVENANCE.json'));
  const provenance = JSON.parse(provenanceBytes);
  const facts = await artifactFacts(site);
  if (provenanceBytes.toString('utf8') !== canonicalJson(provenance)) {
    throw new Error('built site provenance is not canonical JSON');
  }
  if (provenance.schema !== 'b10x-website-provenance/v2'
    || provenance.websiteCommit !== publicationInputs.sourceSet.websiteRuntimeCommit
    || provenance.atlasControlCommit !== publicationInputs.sourceSet.atlasControlCommit
    || provenance.sourceSetSha256 !== publicationInputs.sourceSetSha256
    || provenance.artifactSha256 !== facts.artifactSha256
    || provenance.routesSha256 !== facts.routesSha256
    || canonicalJson(provenance.routes) !== canonicalJson(facts.routes)
    || canonicalJson(provenance.files) !== canonicalJson(facts.files)) {
    throw new Error('built site provenance does not match the exact source-set publication inputs');
  }
  const output = path.resolve(outputRoot);
  try {
    await access(output);
    throw new Error(`publication output already exists: ${output}`);
  } catch (error) {
    if (error?.message?.startsWith('publication output already exists')) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(output), {recursive: true});
  const temporary = await mkdtemp(path.join(path.dirname(output), `.${path.basename(output)}.`));
  try {
    await mkdir(path.join(temporary, 'inputs'), {recursive: true});
    await Promise.all([
      cp(site, path.join(temporary, 'site'), {recursive: true, errorOnExist: true}),
      cp(path.join(inputs, 'bootstrap'), path.join(temporary, 'inputs', 'bootstrap'), {recursive: true, errorOnExist: true}),
      cp(path.join(inputs, 'sources'), path.join(temporary, 'inputs', 'sources'), {recursive: true, errorOnExist: true}),
      cp(sourceSet, path.join(temporary, 'inputs', 'source-set.json'), {errorOnExist: true}),
      writeFile(path.join(temporary, PUBLICATION_LAYOUT_FILE), canonicalJson(layoutDocument), {flag: 'wx'}),
    ]);
    await resolvePublicationLayout(temporary);
    await rename(temporary, output);
  } catch (error) {
    await rm(temporary, {recursive: true, force: true});
    throw error;
  }
  return resolvePublicationLayout(output);
}

async function realDirectory(value, label) {
  const absolute = path.resolve(value);
  const inputDetails = await lstat(absolute).catch(() => undefined);
  if (!inputDetails) throw new Error(`${label} does not exist`);
  if (inputDetails.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  const resolved = await realpath(absolute).catch(() => undefined);
  if (!resolved) throw new Error(`${label} does not exist`);
  const details = await lstat(resolved);
  if (!details.isDirectory()) throw new Error(`${label} must be a real directory`);
  return resolved;
}

async function regularFile(value, label) {
  const absolute = path.resolve(value);
  const inputDetails = await lstat(absolute).catch(() => undefined);
  if (!inputDetails) throw new Error(`${label} does not exist`);
  if (inputDetails.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  const resolved = await realpath(absolute).catch(() => undefined);
  if (!resolved) throw new Error(`${label} does not exist`);
  const details = await lstat(resolved);
  if (!details.isFile()) throw new Error(`${label} must be a regular file`);
  return resolved;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseArgs(args);
  if (command === 'resolve' && options.publication && Object.keys(options).length === 1) {
    const layout = await resolvePublicationLayout(options.publication);
    process.stdout.write(canonicalJson({
      schema: layout.schema,
      site: layout.siteRelative,
      ...(layout.sourceSetPath ? {sourceSet: path.relative(layout.root, layout.sourceSetPath).split(path.sep).join('/')} : {}),
    }));
    return;
  }
  if (command === 'write'
    && options.site
    && options.inputs
    && options.out
    && Object.keys(options).every((key) => ['site', 'inputs', 'out', 'websiteRoot'].includes(key))) {
    const root = options.websiteRoot
      ? path.resolve(options.websiteRoot)
      : path.resolve(import.meta.dirname, '..');
    const layout = await writePublicationLayout({
      websiteRoot: root,
      siteRoot: options.site,
      inputsRoot: options.inputs,
      outputRoot: options.out,
    });
    process.stdout.write(`wrote ${layout.schema} to ${layout.root}\n`);
    return;
  }
  throw new Error('usage: publication-layout.mjs resolve --publication <dir> | write --site <dir> --inputs <dir> --out <dir> [--website-root <dir>]');
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error('publication layout options require --name value pairs');
    const key = name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(result, key)) throw new Error(`duplicate publication layout option ${name}`);
    result[key] = value;
  }
  return result;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`[publication layout] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
