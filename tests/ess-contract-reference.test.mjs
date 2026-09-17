import assert from 'node:assert/strict';
import test from 'node:test';
import {essContractReference} from '../scripts/ess-contract-reference.mjs';

const options = () => ({
  document: {format: 'ess-docs/1', system: 'example', version: 'v1', pages: [{
    id: 'index', title: [{inline: 'text', text: 'Example contracts'}],
    provenance: {provenance: {system: 'example', specification_version: 'v1', source_digest: 'a'.repeat(64), contract_digest: 'b'.repeat(64)}, slice: {kind: 'whole_model'}}, blocks: [],
  }]},
  sourceUrl: '/data/example/document.json', sourceRepository: 'https://github.com/beyond10x/example/blob/abc/document.json',
  slug: '/example/document/', title: 'Example contracts',
});

test('explicit ESS format selects shared presentation with source and searchable static contents', () => {
  const input = options(); const before = structuredClone(input.document);
  const result = essContractReference(input);
  assert.match(result, /import EssContractReference/);
  assert.match(result, /1 reference pages/);
  assert.match(result, /\*\*Example contracts\*\* — 0 sections/);
  assert.match(result, /sourceUrl=\{"\/data\/example\/document.json"\}/);
  assert.match(result, /Contract declarations do not establish runtime enforcement/);
  assert.deepEqual(input.document, before);
});

test('ordinary catalogs keep their existing renderer while unsupported ESS revisions fail', () => {
  for (const document of [{pages: []}, [], null, {format: 'another-format/v1'}]) assert.equal(essContractReference({...options(), document}), undefined);
  assert.throws(() => essContractReference({...options(), document: {...options().document, format: 'ess-docs/2'}}), /ess-docs\/1/);
  const input = options(); input.document.pages[0].blocks = [{block: 'html', text: 'active MDX'}];
  assert.throws(() => essContractReference(input), /Unsupported ESS block/);
});

test('source-owned labels remain inert text in generated MDX', () => {
  const input = options(); input.document.pages[0].title[0].text = '<script>{globalThis.bad()}</script> [link](evil)';
  const result = essContractReference(input);
  assert.doesNotMatch(result, /<script>|\{globalThis|\[link\]/);
  assert.match(result, /&#60;script&#62;&#123;globalThis.bad\(\)&#125;/);
});
