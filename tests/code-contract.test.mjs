import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectComponentSource, inspectMarkdownFences, inspectRenderedCode} from '../scripts/code-contract.mjs';
import {normalizeFence} from '../scripts/passive-markdown.mjs';

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

test('render and component contracts prevent plain preformatted-code escape hatches', () => {
  const statistics = new Map();
  assert.deepEqual(inspectRenderedCode('<pre class="prism-code language-toml"><code><span class="token key">name</span></code></pre>', '<html>', statistics), []);
  assert.deepEqual(statistics.get('toml'), {blocks: 1, tokenized: 1});
  assert.match(inspectRenderedCode('<pre><code>value</code></pre>')[0], /bypasses the shared Prism renderer/);
  assert.match(inspectComponentSource('return <pre><code>{value}</code></pre>;', 'page.tsx')[0], /raw <pre>/);
  assert.deepEqual(inspectComponentSource('return <CodeExample language="yaml">{value}</CodeExample>;'), []);
});
