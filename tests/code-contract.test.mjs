import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  CODE_FENCE_INVENTORY_SCHEMA,
  inspectComponentSource,
  inspectMarkdownFences,
  inspectRenderedCode,
  inventoryMarkdownFences,
  reconcileRenderedInventory,
} from '../scripts/code-contract.mjs';
import {normalizeFence} from '../scripts/passive-markdown.mjs';

const fixtures = path.join(import.meta.dirname, 'fixtures');

test('fence normalization changes only a known language token', () => {
  assert.equal(normalizeFence('  ```sh title="verify" {2}'), '  ```bash title="verify" {2}');
  assert.equal(normalizeFence('~~~yml'), '~~~yaml');
  assert.equal(normalizeFence('```console'), '```console');
  assert.equal(normalizeFence('```'), '```');
  assert.equal(normalizeFence('cargo test'), 'cargo test');
});

test('source contract rejects ambiguous, unlabelled, and unknown fences', () => {
  const source = [
    '```console', '$ cargo test', '```',
    '```', 'plain output', '```',
    '```made-up', 'value', '```',
    '```toml title="Cargo.toml"', '[package]', '```',
  ].join('\n');
  const diagnostics = inspectMarkdownFences(source, 'README.md');
  assert.equal(diagnostics.length, 3);
  assert.match(diagnostics[0], /console is ambiguous/);
  assert.match(diagnostics[1], /has no language/);
  assert.match(diagnostics[2], /unsupported fenced-code language/);
});

test('inventory deterministically retains source, route, language, and semantic intent', async () => {
  const source = await readFile(path.join(fixtures, 'code-fence-corpus.md'), 'utf8');
  const context = {
    repository: 'fixture-repository',
    sourcePath: 'docs/code-fence-corpus.md',
    sourceRevision: '0123456789abcdef',
    sourceKind: 'documentation',
    publicRoute: '/docs/fixture/code-fence-corpus/',
  };
  const first = inventoryMarkdownFences(source, context);
  const second = inventoryMarkdownFences(source, context);
  assert.deepEqual(first, second);
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(
    first.fences.map(({declaredLanguage, normalizedLanguage, semanticClass, expectedRendering}) => ({
      declaredLanguage,
      normalizedLanguage,
      semanticClass,
      expectedRendering,
    })),
    [
      {declaredLanguage: 'sh', normalizedLanguage: 'bash', semanticClass: 'command', expectedRendering: 'prism'},
      {declaredLanguage: 'shell-session', normalizedLanguage: 'shell-session', semanticClass: 'terminal-transcript', expectedRendering: 'prism'},
      {declaredLanguage: 'text', normalizedLanguage: 'text', semanticClass: 'plain-output', expectedRendering: 'plain'},
      {declaredLanguage: 'yaml', normalizedLanguage: 'yaml', semanticClass: 'configuration', expectedRendering: 'prism'},
      {declaredLanguage: 'rust', normalizedLanguage: 'rust', semanticClass: 'source-code', expectedRendering: 'prism'},
      {declaredLanguage: 'diff', normalizedLanguage: 'diff', semanticClass: 'diff', expectedRendering: 'prism'},
      {declaredLanguage: 'mermaid', normalizedLanguage: 'mermaid', semanticClass: 'diagram', expectedRendering: 'diagram'},
    ],
  );
  assert.deepEqual(first.fences[0], {
    ...context,
    line: 3,
    declaredLanguage: 'sh',
    normalizedLanguage: 'bash',
    semanticClass: 'command',
    expectedRendering: 'prism',
  });
});

test('source diagnostics identify the repository, source line, and public route', () => {
  const result = inventoryMarkdownFences('```made-up\nvalue', {
    repository: 'aep',
    sourcePath: 'website/docs/example.md',
    publicRoute: '/docs/aep/example/',
  });
  assert.equal(result.diagnostics.length, 2);
  assert.match(result.diagnostics[0], /^aep\/website\/docs\/example\.md:1 \[\/docs\/aep\/example\/\]: unsupported/);
  assert.match(result.diagnostics[1], /^aep\/website\/docs\/example\.md:1 \[\/docs\/aep\/example\/\]: fenced code block is not closed/);
});

test('render and component contracts prevent plain preformatted-code escape hatches', () => {
  const statistics = new Map();
  assert.deepEqual(inspectRenderedCode('<pre class="prism-code language-toml"><code><span class="token key">name</span></code></pre>', '<html>', statistics), []);
  assert.deepEqual(statistics.get('toml'), {blocks: 1, tokenized: 1});
  assert.match(inspectRenderedCode('<pre><code>value</code></pre>')[0], /bypasses the shared Prism renderer/);
  assert.match(inspectRenderedCode('<pre class="prism-code"><code>value</code></pre>')[0], /has no language class/);
  assert.match(inspectRenderedCode('<pre class="prism-code language-made-up"><code>value</code></pre>')[0], /unsupported language/);
  assert.match(inspectComponentSource('return <pre><code>{value}</code></pre>;', 'page.tsx')[0], /raw <pre>/);
  assert.deepEqual(inspectComponentSource('return <CodeExample language="yaml">{value}</CodeExample>;'), []);
});

test('rendered inventory reconciles Prism, plain-text, and Mermaid blocks in document order', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [
    fence('yaml', 'configuration', 'prism', 4),
    fence('text', 'plain-output', 'plain', 10),
    fence('mermaid', 'diagram', 'diagram', 16),
  ]);
  const renderedByRoute = new Map([[route, {
    blocks: [
      {language: 'yaml', meaningfulTokens: true},
      {language: 'text', meaningfulTokens: false},
    ],
    diagramCount: 1,
    renderings: [
      {kind: 'prism', language: 'yaml', meaningfulTokens: true},
      {kind: 'prism', language: 'text', meaningfulTokens: false},
      {kind: 'diagram', language: 'mermaid', meaningfulTokens: false},
    ],
  }]]);
  const result = reconcileRenderedInventory(sourceInventory, renderedByRoute);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.inventory.phase, 'rendered');
  assert.equal(result.inventory.summary.renderedCount, 3);
  assert.ok(result.inventory.fences.every((entry) => entry.rendered.matchesExpected));
});

test('static HTML records Docusaurus client-only Mermaid blocks as deferred', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [fence('mermaid', 'diagram', 'diagram', 4)]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([[route, {renderings: []}]]));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.inventory.fences[0].rendered, {
    kind: 'diagram',
    found: false,
    language: 'mermaid',
    meaningfulTokens: false,
    matchesExpected: true,
    verification: 'client-runtime',
  });
  assert.equal(result.inventory.summary.clientDeferredCount, 1);
});

test('rendered inventory accounts for component blocks without treating them as Markdown fences', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [fence('yaml', 'configuration', 'prism', 4)]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([
    [route, {renderings: [
      {kind: 'prism', language: 'text', meaningfulTokens: false},
      {kind: 'prism', language: 'yaml', meaningfulTokens: false},
    ]}],
    ['/untracked/', {renderings: [{kind: 'prism', language: 'bash', meaningfulTokens: true}]}],
  ]));
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0], /every rendered yaml block collapsed to plain tokens/);
  assert.equal(result.inventory.summary.renderedBlockCount, 3);
  assert.equal(result.inventory.summary.unattributedRenderedCount, 2);
  assert.equal(result.inventory.renderedDocuments[0].renderings[0].sourceFence, null);
  assert.deepEqual(result.inventory.renderedDocuments[0].renderings[1].sourceFence, {
    repository: 'fixture-repository',
    sourcePath: 'docs/example.md',
    line: 4,
  });
  assert.equal(result.inventory.renderedDocuments[1].renderings[0].sourceFence, null);
});

test('rendered inventory rejects reordered Markdown fences with source-aware diagnostics', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [
    fence('yaml', 'configuration', 'prism', 4),
    fence('text', 'plain-output', 'plain', 10),
  ]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([[route, {renderings: [
    {kind: 'prism', language: 'text', meaningfulTokens: false},
    {kind: 'prism', language: 'yaml', meaningfulTokens: true},
  ]}]]));
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0], /fixture-repository\/docs\/example\.md:10 \[\/docs\/fixture\/example\/\]: rendered route has no matching text code block/);
});

function fence(language, semanticClass, expectedRendering, line) {
  return {
    repository: 'fixture-repository',
    sourcePath: 'docs/example.md',
    sourceRevision: '0123456789abcdef',
    sourceKind: 'documentation',
    publicRoute: '/docs/fixture/example/',
    line,
    declaredLanguage: language,
    normalizedLanguage: language,
    semanticClass,
    expectedRendering,
    rendered: null,
  };
}

function inventoryDocument(route, fences) {
  return {
    schema: CODE_FENCE_INVENTORY_SCHEMA,
    phase: 'source',
    sourceLockSha256: 'fixture',
    lockedSources: [{repository: 'fixture-repository', sourceRevision: '0123456789abcdef'}],
    markdownSources: [{
      repository: 'fixture-repository',
      sourcePath: 'docs/example.md',
      sourceRevision: '0123456789abcdef',
      sourceKind: 'documentation',
      publicRoute: route,
      fenceCount: fences.length,
    }],
    fences: fences.map((entry) => ({...entry, publicRoute: route})),
    summary: {lockedRepositoryCount: 1, markdownSourceCount: 1},
  };
}
