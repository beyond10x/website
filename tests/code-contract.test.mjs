import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  CODE_FENCE_INVENTORY_SCHEMA,
  inspectComponentSource,
  inspectMarkdownFences,
  inspectRenderedCode,
  inspectRenderedDocument,
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
      {declaredLanguage: 'shell-session', normalizedLanguage: 'shell-session', semanticClass: 'transcript', expectedRendering: 'prism'},
      {declaredLanguage: 'text', normalizedLanguage: 'text', semanticClass: 'output', expectedRendering: 'plain'},
      {declaredLanguage: 'yaml', normalizedLanguage: 'yaml', semanticClass: 'source', expectedRendering: 'prism'},
      {declaredLanguage: 'rust', normalizedLanguage: 'rust', semanticClass: 'source', expectedRendering: 'prism'},
      {declaredLanguage: 'diff', normalizedLanguage: 'diff', semanticClass: 'source', expectedRendering: 'prism'},
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
    bodySha256: bodyHash('npm run build'),
  });
});

test('inventory includes fenced blocks nested in blockquotes and lists', () => {
  const source = [
    '> ```powershell',
    '> Get-ChildItem',
    '> ```',
    '',
    '- verify',
    '',
    '  ~~~yaml',
    '  enabled: true',
    '  ~~~',
  ].join('\n');
  const result = inventoryMarkdownFences(source, 'nested.md');
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.fences.map(({line, normalizedLanguage, semanticClass, bodySha256}) => ({
    line,
    normalizedLanguage,
    semanticClass,
    bodySha256,
  })), [
    {line: 1, normalizedLanguage: 'powershell', semanticClass: 'command', bodySha256: bodyHash('Get-ChildItem')},
    {line: 7, normalizedLanguage: 'yaml', semanticClass: 'source', bodySha256: bodyHash('enabled: true')},
  ]);
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
  assert.match(inspectRenderedCode('<pre class="prism-code language-mermaid"><code>flowchart LR</code></pre>')[0], /instead of a diagram/);
  assert.deepEqual(inspectRenderedCode('<span hidden data-b10x-mermaid-source="flowchart LR"></span>'), []);
  assert.match(inspectComponentSource('return <pre><code>{value}</code></pre>;', 'page.tsx')[0], /raw <pre>/);
  assert.deepEqual(inspectComponentSource('return <CodeExample language="yaml">{value}</CodeExample>;'), []);
});

test('render inspection reconstructs exact Prism bodies across tokens and blank lines', () => {
  const html = [
    '<pre class="prism-code language-yaml"><code>',
    '<div class="token-line"><span class="token key">enabled</span><span class="token punctuation">:</span><span class="token plain"> true</span><br></div>',
    '<div class="token-line"><span class="token plain"></span><br></div>',
    '<div class="token-line"><span class="token key">label</span><span class="token punctuation">:</span><span class="token plain"> &quot;A &amp; B&quot;</span><br></div>',
    '</code></pre>',
  ].join('');
  const inspected = inspectRenderedDocument(html, 'fixture.html', '/fixture/');
  assert.deepEqual(inspected.diagnostics, []);
  assert.equal(inspected.renderings[0].bodySha256, bodyHash('enabled: true\n\nlabel: "A & B"'));
});

test('rendered inventory reconciles Prism, plain-text, and Mermaid blocks in document order', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [
    fence('yaml', 'source', 'prism', 4, 'enabled: true'),
    fence('text', 'output', 'plain', 10, 'build complete'),
    fence('mermaid', 'diagram', 'diagram', 16, 'flowchart LR\n  source --> site'),
  ]);
  const renderedByRoute = new Map([[route, {
    blocks: [
      {language: 'yaml', meaningfulTokens: true},
      {language: 'text', meaningfulTokens: false},
    ],
    diagramCount: 1,
    renderings: [
      rendering('prism', 'yaml', true, 'enabled: true'),
      rendering('prism', 'text', false, 'build complete'),
      rendering('mermaid-payload', 'mermaid', false, 'flowchart LR\n  source --> site'),
    ],
  }]]);
  const result = reconcileRenderedInventory(sourceInventory, renderedByRoute);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.inventory.phase, 'rendered');
  assert.equal(result.inventory.summary.renderedCount, 3);
  assert.ok(result.inventory.fences.every((entry) => entry.rendered.matchesExpected));
});

test('static HTML verifies the exact payload for client-rendered Mermaid blocks', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [fence('mermaid', 'diagram', 'diagram', 4, 'flowchart LR\n  a --> b')]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([[route, {
    renderings: [rendering('mermaid-payload', 'mermaid', false, 'flowchart LR\n  a --> b')],
  }]]));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.inventory.fences[0].rendered, {
    kind: 'diagram',
    found: false,
    payloadFound: true,
    language: 'mermaid',
    bodySha256: bodyHash('flowchart LR\n  a --> b'),
    meaningfulTokens: false,
    matchesExpected: true,
    position: 1,
    verification: 'client-runtime',
  });
  assert.equal(result.inventory.summary.clientDeferredCount, 1);
});

test('Mermaid cannot silently disappear or fall back to a Prism block', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [fence('mermaid', 'diagram', 'diagram', 4, 'flowchart LR\n  a --> b')]);
  const missing = reconcileRenderedInventory(sourceInventory, new Map([[route, {renderings: []}]]));
  assert.match(missing.diagnostics[0], /no matching mermaid code block/);
  assert.equal(missing.inventory.fences[0].rendered.matchesExpected, false);
  const prism = reconcileRenderedInventory(sourceInventory, new Map([[route, {
    renderings: [rendering('prism', 'mermaid', false, 'flowchart LR\n  a --> b')],
  }]]));
  assert.match(prism.diagnostics[0], /expected rendered mermaid-payload/);
  assert.equal(prism.inventory.summary.clientDeferredCount, 0);
});

test('rendered inventory accounts for component blocks without treating them as Markdown fences', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [fence('yaml', 'source', 'prism', 4, 'enabled: true')]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([
    [route, {renderings: [
      rendering('prism', 'text', false, 'component output'),
      rendering('prism', 'yaml', false, 'enabled: true'),
    ]}],
    ['/untracked/', {renderings: [rendering('prism', 'bash', true, 'npm test')]}],
  ]));
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0], /every rendered yaml block collapsed to plain tokens/);
  assert.equal(result.inventory.summary.renderedBlockCount, 3);
  assert.equal(result.inventory.summary.unattributedRenderedCount, 0);
  assert.equal(result.inventory.summary.componentRenderedCount, 2);
  assert.equal(result.inventory.renderedDocuments[0].renderings[0].classification, 'component');
  assert.equal(result.inventory.renderedDocuments[0].renderings[0].sourceFence, null);
  assert.deepEqual(result.inventory.renderedDocuments[0].renderings[1].sourceFence, {
    repository: 'fixture-repository',
    sourcePath: 'docs/example.md',
    sourceRevision: '0123456789abcdef',
    publicRoute: route,
    line: 4,
  });
  assert.equal(result.inventory.renderedDocuments[0].renderings[1].classification, 'source-fence');
  assert.equal(result.inventory.renderedDocuments[1].renderings[0].sourceFence, null);
});

test('field-note index copies retain source attribution by language and body', () => {
  const noteRoute = '/updates/field-notes/example/';
  const noteFence = {
    ...fence('bash', 'command', 'prism', 8, 'npm test'),
    sourceKind: 'field-note',
  };
  const sourceInventory = inventoryDocument(noteRoute, [noteFence]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([
    [noteRoute, {renderings: [rendering('prism', 'bash', true, 'npm test')]}],
    ['/updates/field-notes/', {renderings: [{
      ...rendering('prism', 'bash', true, 'npm test'),
      projectionOf: noteRoute,
    }]}],
  ]));
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.inventory.summary.fieldNoteProjectionCount, 1);
  const projection = result.inventory.renderedDocuments
    .find((document) => document.publicRoute === '/updates/field-notes/').renderings[0];
  assert.equal(projection.classification, 'field-note-projection');
  assert.equal(projection.sourceFence.sourcePath, 'docs/example.md');
});

test('rendered reconciliation requires source-body identity', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [fence('yaml', 'source', 'prism', 4, 'enabled: true')]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([[route, {
    renderings: [rendering('prism', 'yaml', true, 'enabled: false')],
  }]]));
  assert.match(result.diagnostics[0], /with source body/);
  assert.equal(result.inventory.fences[0].rendered.matchesExpected, false);
});

test('rendered inventory rejects reordered Markdown fences with source-aware diagnostics', () => {
  const route = '/docs/fixture/example/';
  const sourceInventory = inventoryDocument(route, [
    fence('yaml', 'source', 'prism', 4, 'enabled: true'),
    fence('text', 'output', 'plain', 10, 'build complete'),
  ]);
  const result = reconcileRenderedInventory(sourceInventory, new Map([[route, {renderings: [
    rendering('prism', 'text', false, 'build complete'),
    rendering('prism', 'yaml', true, 'enabled: true'),
  ]}]]));
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0], /fixture-repository\/docs\/example\.md:10 \[\/docs\/fixture\/example\/\]: rendered route has no matching text code block/);
});

function fence(language, semanticClass, expectedRendering, line, body = `${language} example`) {
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
    bodySha256: bodyHash(body),
    rendered: null,
  };
}

function rendering(kind, language, meaningfulTokens, body) {
  return {kind, language, meaningfulTokens, bodySha256: bodyHash(body)};
}

function bodyHash(value) {
  return createHash('sha256').update(value).digest('hex');
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
