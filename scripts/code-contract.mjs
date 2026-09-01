import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PRISM_LANGUAGES, normalizeMarkdownFenceLanguage} from '@beyond10x/docs-system/code';

const root = path.resolve(import.meta.dirname, '..');
const acceptedLanguages = new Set([...PRISM_LANGUAGES, 'mermaid']);

export function inspectMarkdownFences(source, file = '<markdown>') {
  const diagnostics = [];
  let fence;
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const candidate = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (!candidate) continue;
    const marker = candidate[2];
    if (fence) {
      if (marker[0] === fence.marker && marker.length >= fence.length && !candidate[3].trim()) fence = undefined;
      continue;
    }
    const info = candidate[3].trim();
    if (!info) {
      diagnostics.push(`${file}:${index + 1}: fenced code block has no language; use text for plain output`);
      fence = {marker: marker[0], length: marker.length};
      continue;
    }
    const language = info.match(/^[^\s{]+/)?.[0] ?? '';
    const normalized = normalizeMarkdownFenceLanguage(language);
    if (language.toLowerCase() === 'console') {
      diagnostics.push(`${file}:${index + 1}: console is ambiguous; use bash, shell-session, or text`);
    } else if (!acceptedLanguages.has(normalized)) {
      diagnostics.push(`${file}:${index + 1}: unsupported fenced-code language ${JSON.stringify(language)}`);
    }
    fence = {marker: marker[0], length: marker.length};
  }
  return diagnostics;
}

export function inspectRenderedCode(html, file = '<html>', statistics = new Map()) {
  const diagnostics = [];
  for (const match of html.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)) {
    const block = match[0];
    if (!/class="[^"]*\bprism-code\b/.test(block)) {
      diagnostics.push(`${file}: rendered <pre> bypasses the shared Prism renderer`);
      continue;
    }
    const language = /\blanguage-([a-z0-9-]+)/.exec(block)?.[1];
    if (!language) {
      diagnostics.push(`${file}: Prism block has no language class`);
      continue;
    }
    if (!acceptedLanguages.has(language)) {
      diagnostics.push(`${file}: rendered Prism block uses unsupported language ${JSON.stringify(language)}`);
      continue;
    }
    const current = statistics.get(language) ?? {blocks: 0, tokenized: 0};
    current.blocks += 1;
    if (/class="token (?!plain\b)[^"]+"/.test(block)) current.tokenized += 1;
    statistics.set(language, current);
  }
  return diagnostics;
}

export function inspectComponentSource(source, file = '<source>') {
  return /<pre\b/i.test(source)
    ? [`${file}: raw <pre> bypasses the shared code component`]
    : [];
}

async function inspectSourceTree() {
  const diagnostics = [];
  for (const directory of ['.generated/docs', '.generated/blog']) {
    for (const file of await filesBelow(path.join(root, directory), /\.mdx?$/)) {
      diagnostics.push(...inspectMarkdownFences(await readFile(file, 'utf8'), relative(file)));
    }
  }
  for (const file of await filesBelow(path.join(root, 'src'), /\.[jt]sx$/)) {
    diagnostics.push(...inspectComponentSource(await readFile(file, 'utf8'), relative(file)));
  }
  return diagnostics;
}

async function inspectBuild() {
  const diagnostics = [];
  const statistics = new Map();
  for (const file of await filesBelow(path.join(root, 'build'), /\.html$/)) {
    diagnostics.push(...inspectRenderedCode(await readFile(file, 'utf8'), relative(file), statistics));
  }
  for (const [language, counts] of statistics) {
    if (language !== 'text' && counts.blocks > 0 && counts.tokenized === 0) {
      diagnostics.push(`build: every ${language} block rendered as plain tokens; load its Prism grammar`);
    }
  }
  return diagnostics;
}

async function filesBelow(directory, pattern) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, {withFileTypes: true});
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(target, pattern));
    else if (pattern.test(entry.name)) files.push(target);
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function main() {
  const mode = process.argv[2];
  if (!['source', 'build'].includes(mode)) throw new Error('usage: node scripts/code-contract.mjs <source|build>');
  const diagnostics = mode === 'source' ? await inspectSourceTree() : await inspectBuild();
  if (diagnostics.length) {
    console.error(diagnostics.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`code contract (${mode}): ok`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
