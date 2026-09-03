import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {crawlArtifact, cssReferences, parseMarkup, srcsetReferences} from '../scripts/artifact-crawler.mjs';

const origin = 'https://beyond10x.github.io';
const emptyRedirects = {schema: 'b10x-redirects/v1', origin, redirects: []};

test('the parsed artifact crawler follows HTML, SVG, srcset, fragments, refreshes, and CSS URLs', async (context) => {
  const build = await mkdtemp(path.join(os.tmpdir(), 'b10x-crawler-'));
  context.after(() => rm(build, {recursive: true, force: true}));
  await mkdir(path.join(build, 'docs'), {recursive: true});
  await mkdir(path.join(build, 'assets'), {recursive: true});
  await writeFile(path.join(build, 'index.html'), [
    '<!doctype html><html><head>',
    '<meta http-equiv="refresh" content="120; url=/docs/#answer">',
    '<link rel="stylesheet" href="/assets/site.css">',
    '<style>.hero{background:url(\'/assets/pixel.svg#mark\')}</style>',
    '</head><body>',
    '<a href="/docs/#answer">Answer</a>',
    '<img src="/assets/pixel.svg" srcset="/assets/pixel.svg 1x, /assets/pixel-2.svg 2x">',
    '</body></html>',
  ].join(''));
  await writeFile(path.join(build, 'docs', 'index.html'), '<!doctype html><html><body><h1 id="answer">Answer</h1></body></html>');
  await writeFile(path.join(build, 'assets', 'site.css'), '.icon{mask-image:url("./pixel.svg#mark")}');
  await writeFile(path.join(build, 'assets', 'pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><g id="mark"><a href="/docs/#answer"><path d="M0 0"/></a></g></svg>');
  await writeFile(path.join(build, 'assets', 'pixel-2.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><g id="mark"/></svg>');
  const {report} = await crawlArtifact({build, origin, redirects: emptyRedirects});
  assert.equal(report.status, 'passed', JSON.stringify(report.diagnostics));
  assert.equal(report.diagnostics.length, 0);
  assert.ok(report.referencesChecked >= 8);
  assert.equal(report.svgDocuments, 2);
  assert.equal(report.cssDocuments, 1);
});

test('the crawler reports missing internal fragments and assets with stable diagnostic codes', async (context) => {
  const build = await mkdtemp(path.join(os.tmpdir(), 'b10x-crawler-broken-'));
  context.after(() => rm(build, {recursive: true, force: true}));
  await mkdir(path.join(build, 'docs'), {recursive: true});
  await writeFile(path.join(build, 'index.html'), '<!doctype html><a href="/docs/#missing">Broken fragment</a><img src="/missing.svg">');
  await writeFile(path.join(build, 'docs', 'index.html'), '<!doctype html><h1 id="present">Present</h1>');
  const {report} = await crawlArtifact({build, origin, redirects: emptyRedirects});
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.diagnostics.map((item) => item.code), ['missing-fragment', 'missing-internal-target']);
});

test('crawler tokenizers preserve the supported URL-bearing forms', () => {
  const markup = parseMarkup('<svg><a xlink:href="/next"><image href="/image.svg" /></a></svg>');
  assert.deepEqual(markup.references.map((item) => item.value), ['/next', '/image.svg']);
  assert.deepEqual(cssReferences('@import "theme.css"; a{background:url(\'image.png\')}'), ['image.png', 'theme.css']);
  assert.deepEqual(srcsetReferences('small.png 1x, large.png 2x'), ['small.png', 'large.png']);
});
