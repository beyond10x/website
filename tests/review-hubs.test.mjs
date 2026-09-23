import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {journeys, journeyById} from '../data/journeys.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('journeys.mjs is the single canonical source for the six outcome routes', () => {
  assert.deepEqual(journeys.map((journey) => journey.id), ['start', 'learn', 'build', 'products', 'operate', 'contribute']);
  for (const journey of journeys) {
    assert.match(journey.hubRoute, /^\/[a-z-]+\/$/);
    assert.match(journey.experienceRoute, /^\/[a-z-/]+\/$/);
    assert.ok(journey.footerLabel.length > 0);
  }
  assert.equal(journeyById('build').experienceRoute, '/build/agent-systems/');
  assert.throws(() => journeyById('nonexistent'), /unknown journey id/);
});

test('docusaurus.config.ts derives the footer Start and Adopt columns from journeys.mjs, not hand-typed routes', async () => {
  const config = await readFile(path.join(root, 'docusaurus.config.ts'), 'utf8');
  assert.match(config, /import \{journeyById\} from '\.\/data\/journeys\.mjs';/);
  const footerConfig = config.slice(config.indexOf('footer:'), config.indexOf('prism:'));
  for (const id of ['start', 'learn', 'build', 'products', 'operate']) {
    assert.match(footerConfig, new RegExp(`journeyById\\('${id}'\\)`), `footer must derive the ${id} journey from journeys.mjs`);
  }
  assert.doesNotMatch(footerConfig, /href: '\/start\/spec-driven-development\/'/);
  assert.doesNotMatch(footerConfig, /href: '\/learn\/safe-agentic-coding\/'/);
  assert.doesNotMatch(footerConfig, /href: '\/build\/agent-systems\/'/);
});

test('the homepage gateway cards source their destination from journeys.mjs', async () => {
  const home = await readFile(path.join(root, 'src/pages/index.tsx'), 'utf8');
  assert.match(home, /import \{journeyById\} from '\.\.\/\.\.\/data\/journeys\.mjs';/);
  for (const id of ['build', 'products', 'operate', 'contribute']) {
    assert.match(home, new RegExp(`journeyById\\('${id}'\\)\\.experienceRoute`), `homepage gateway must derive the ${id} route from journeys.mjs`);
  }
  // R8: one primary CTA to the Start hub, and the four gateway cards stay the only card-style
  // secondary CTAs (the existing accent-order assertion in ux-contract.test.mjs pins the count).
  assert.match(home, /to=\{journeyById\('start'\)\.hubRoute\}/);
  assert.doesNotMatch(home, /Follow the complete learn/);
  assert.doesNotMatch(home, /styles\.referenceActions/);
});

test('learn, build, and products hubs point their recommended action at the same journeys.mjs route the footer and homepage use', async () => {
  const [learn, build, products] = await Promise.all([
    'src/pages/learn/index.tsx',
    'src/pages/build/index.tsx',
    'src/pages/products/index.tsx',
  ].map((file) => readFile(path.join(root, file), 'utf8')));
  assert.match(learn, /journeyById\('learn'\)\.experienceRoute/);
  assert.match(build, /journeyById\('build'\)\.experienceRoute/);
  assert.match(products, /journeyById\('products'\)\.experienceRoute/);
});

test('R2: the build, learn, products, and api hub indexes are reachable from the footer and from /start/', async () => {
  const config = await readFile(path.join(root, 'docusaurus.config.ts'), 'utf8');
  const footerConfig = config.slice(config.indexOf('footer:'), config.indexOf('prism:'));
  assert.match(footerConfig, /journeyById\('learn'\)\.hubRoute/);
  assert.match(footerConfig, /journeyById\('build'\)\.hubRoute/);
  assert.match(footerConfig, /journeyById\('products'\)\.hubRoute/);
  assert.match(footerConfig, /\{label: 'API reference', to: '\/api\/'\}/);
  assert.equal(journeyById('learn').hubRoute, '/learn/');
  assert.equal(journeyById('build').hubRoute, '/build/');
  assert.equal(journeyById('products').hubRoute, '/products/');

  const start = await readFile(path.join(root, 'src/pages/start/index.tsx'), 'utf8');
  assert.match(start, /journeyById\('learn'\)\.hubRoute/);
  assert.match(start, /journeyById\('build'\)\.hubRoute/);
  assert.match(start, /journeyById\('products'\)\.hubRoute/);
});

test('R6: "Evaluate products" resolves to one hub, and /products/ carries a distinct title', async () => {
  const config = await readFile(path.join(root, 'docusaurus.config.ts'), 'utf8');
  const footerConfig = config.slice(config.indexOf('footer:'), config.indexOf('prism:'));
  assert.match(footerConfig, /journeyById\('products'\)\.footerLabel, href: journeyById\('products'\)\.hubRoute/);
  assert.equal(journeyById('products').footerLabel, 'Evaluate products');
  assert.equal(journeyById('products').hubRoute, '/products/');

  const products = await readFile(path.join(root, 'src/pages/products/index.tsx'), 'utf8');
  assert.match(products, /<Layout title="Evaluate products"/);
  assert.doesNotMatch(products, /<Layout title="Products"/);
});

test('R15: "Operate services" stays sentence case everywhere this repository authors the label', async () => {
  const files = await Promise.all([
    'docusaurus.config.ts',
    'data/journeys.mjs',
    'src/pages/index.tsx',
    'src/pages/operate.tsx',
    'src/pages/learn/from-principle-to-action.tsx',
  ].map((file) => readFile(path.join(root, file), 'utf8')));
  for (const source of files) {
    assert.doesNotMatch(source, /Operate Services/);
  }
  assert.equal(journeyById('operate').footerLabel, 'Operate services');
});

test('R4: /engineering-transformation/ is linked from an appropriate hub and links back out', async () => {
  const [config, vision, essay] = await Promise.all([
    'docusaurus.config.ts',
    'src/pages/vision.mdx',
    'src/pages/engineering-transformation.mdx',
  ].map((file) => readFile(path.join(root, file), 'utf8')));
  const footerConfig = config.slice(config.indexOf('footer:'), config.indexOf('prism:'));
  assert.match(footerConfig, /\{label: 'Engineering transformation', to: '\/engineering-transformation\/'\}/);
  assert.match(vision, /\(\/engineering-transformation\/\)/);
  assert.match(essay, /\(\/vision\/\)/);
  assert.match(essay, /\(\/start\/\)/);
});
