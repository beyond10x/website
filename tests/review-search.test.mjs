import assert from 'node:assert/strict';
import test from 'node:test';
import {isRelevantSearchResult, significantQueryTokens} from '../src/search-result-contract.mjs';

test('significant query tokens drop trivial fragments and split letter/digit runs', () => {
  assert.deepEqual(significantQueryTokens('zzzznomatchqqq11'), ['zzzznomatchqqq']);
  assert.deepEqual(significantQueryTokens('asdfghjkl12345'), ['asdfghjkl', '12345']);
  assert.deepEqual(significantQueryTokens('spec driven development claude'), ['spec', 'driven', 'development', 'claude']);
  assert.deepEqual(significantQueryTokens('es'), []);
  assert.deepEqual(significantQueryTokens(''), []);
  assert.deepEqual(significantQueryTokens(undefined), []);
});

test('a nonsense query that only fuzzy-matches an unrelated short word is not relevant', () => {
  const result = {
    excerpt: 'entities <mark>as</mark> MCP tools. Use the local stdio server',
    meta: {qualified_title: 'Mount entities as MCP tools | Entity Runtime', description: 'Mount entities as MCP tools.'},
  };
  assert.equal(isRelevantSearchResult('asdfghjkl12345', result), false);
  assert.equal(isRelevantSearchResult('zzzznomatchqqq11', result), false);
});

test('a real query whose highlighted term closely matches a significant token is relevant', () => {
  const result = {
    excerpt: '<mark>Worktree.</mark> worktree gives humans, agents and embedded Rust consumers',
    meta: {qualified_title: 'Worktree | beyond10x', description: 'A reusable Rust library and CLI.'},
  };
  assert.equal(isRelevantSearchResult('worktree', result), true);
});

test('a stemmed or lightly-typo\'d match against a real word is still relevant', () => {
  const result = {
    excerpt: 'recovery <mark>quarantine</mark> and general lifecycle handling',
    meta: {qualified_title: 'Connectors v2', description: 'Independent adapter services.'},
  };
  assert.equal(isRelevantSearchResult('quarantined', result), true);
});

test('a meta-only match without any real token overlap is not relevant', () => {
  const result = {
    excerpt: 'Check what an agent run did. An agent harness records everything',
    meta: {qualified_title: 'Check what an agent run did | AEP', description: 'Normalize a harness transcript.'},
  };
  assert.equal(isRelevantSearchResult('wroktree', result), false);
});

test('short or empty queries are never second-guessed, matching the existing filter-only search path', () => {
  const result = {excerpt: 'anything at all', meta: {qualified_title: 'Any page'}};
  assert.equal(isRelevantSearchResult('', result), true);
  assert.equal(isRelevantSearchResult('es', result), true);
});
