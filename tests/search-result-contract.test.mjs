import assert from 'node:assert/strict';
import test from 'node:test';
import {prioritizeSearchResults, resultCountDescription} from '../src/search-result-contract.mjs';

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
