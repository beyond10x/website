import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  assertSearchAudienceVocabulary,
  experienceIdsForSourceDocument,
  qualifiedDocumentTitle,
  SEARCH_AUDIENCE_VOCABULARY,
} from '../scripts/search-metadata-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('document titles qualify distinct pages without repeating a project landing name', () => {
  assert.equal(qualifiedDocumentTitle('Connectors', 'Connectors'), 'Connectors');
  assert.equal(qualifiedDocumentTitle(' ESS ', 'Ess'), 'ESS');
  assert.equal(qualifiedDocumentTitle('Connect Slack', 'Connectors'), 'Connect Slack | Connectors');
  assert.equal(qualifiedDocumentTitle('Connectors architecture', 'Connectors'), 'Connectors architecture | Connectors');
});

test('legacy source documents remain compatibility references without inferred experience membership', () => {
  for (const schema of ['b10x-docs/v1', 'b10x-docs/v2', 'b10x-docs/v3']) {
    assert.deepEqual(experienceIdsForSourceDocument({
      schema,
      effective: {experienceIds: ['try-spec-driven-development']},
    }), []);
  }
  assert.deepEqual(experienceIdsForSourceDocument({
    schema: 'b10x-docs/v4',
    effective: {experienceIds: ['try-spec-driven-development', 'try-spec-driven-development']},
  }), ['try-spec-driven-development']);
  assert.throws(
    () => experienceIdsForSourceDocument({schema: 'b10x-docs/v4'}),
    /must be resolved/,
  );
});

test('authored and catalog audience filters use only the Docs System vocabulary', async () => {
  const allowed = new Set(SEARCH_AUDIENCE_VOCABULARY);
  assert.deepEqual(SEARCH_AUDIENCE_VOCABULARY, ['adopter', 'developer', 'evaluator', 'operator', 'researcher']);
  assert.throws(() => assertSearchAudienceVocabulary(['practitioner'], 'test page'), /undeclared audience/);

  const files = (await readdir(path.join(root, 'src'), {recursive: true}))
    .filter((file) => /\.(?:tsx|mdx)$/.test(file));
  for (const file of files) {
    const source = await readFile(path.join(root, 'src', file), 'utf8');
    for (const match of source.matchAll(/data-pagefind-filter=["']audience["'][^>]*>([^<>{]+)</g)) {
      assert.ok(allowed.has(match[1].trim()), `${file} uses undeclared audience ${match[1].trim()}`);
    }
  }

  const catalog = JSON.parse(await readFile(path.join(root, 'data', 'experiences.json'), 'utf8'));
  for (const experience of catalog.experiences) {
    assertSearchAudienceVocabulary(experience.audiences, `experience ${experience.id}`);
  }
});
