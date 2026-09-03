import assert from 'node:assert/strict';
import test from 'node:test';
import {prioritizeSearchResults, resultCountDescription, resultSummary} from '../src/search-result-contract.mjs';

test('filter-only experience searches put the canonical experience before source references', () => {
  const references = Array.from({length: 56}, (_, index) => ({id: `reference-${index}`}));
  const experience = {id: 'experience-landing'};
  const all = [...references, experience];
  const selected = prioritizeSearchResults(all, [experience], 40);
  assert.equal(selected.length, 40);
  assert.equal(selected[0], experience);
  assert.equal(new Set(selected).size, selected.length);
  assert.equal(resultCountDescription(selected.length, all.length), 'Showing 40 of 57 matching pages.');
  assert.equal(resultCountDescription(1, 1), 'Showing 1 of 1 matching page.');
});

test('search cards prefer human descriptions and strip chrome from legacy excerpt fallbacks', () => {
  assert.equal(
    resultSummary({
      meta: {description: 'Find service operations material without mixing audiences.'},
      excerpt: 'Skip to main content. deploy-operate-productsexperienceoperator',
    }, {preferDescription: true}),
    'Find service operations material without mixing audiences.',
  );
  assert.equal(
    resultSummary({
      meta: {description: 'Generic approval documentation.'},
      excerpt: 'Skip to main content. On this page. <mark>Approval</mark> checkpoints remain explicit.',
    }),
    'Approval checkpoints remain explicit.',
  );
  assert.equal(
    resultSummary({excerpt: 'Install <mark>Agent Plugins</mark> from skills/&lt;name&gt;/SKILL.md &amp; verify &#x2713;.'}),
    'Install Agent Plugins from skills/<name>/SKILL.md & verify ✓.',
  );
});
