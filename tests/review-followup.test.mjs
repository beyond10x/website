import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

// Docusaurus appends the site title to a page's frontmatter title, so a generated project or
// profile title that already ends in "| beyond10x" rendered as "ESS | beyond10x | beyond10x", and
// the website repository, whose catalog name is the site title, as "beyond10x" three times.
test('generated project and profile pages title only their project', async () => {
  const source = await readFile(path.join(root, 'scripts', 'prepare-site.mjs'), 'utf8');
  for (const generator of ['projectDocument', 'profileDocument']) {
    const body = source.slice(source.indexOf(`function ${generator}(`));
    const frontmatter = body.slice(0, body.indexOf('slug:'));
    assert.match(frontmatter, /const name = projectPageName\(surface, repository\);/, generator);
    assert.match(frontmatter, /`title: \$\{JSON\.stringify\(name\)\}`/, generator);
    assert.doesNotMatch(frontmatter, /title: \$\{JSON\.stringify\(`\$\{surface\.name\} \| beyond10x`\)\}/, generator);
  }
  assert.match(source, /function projectPageName\(surface, repository\) \{\n  return repository === 'website' \? 'Website' : surface\.name;\n\}/);
});

test('a family landing presents its next family as the reference tour and points newcomers at Start', async () => {
  const source = await readFile(path.join(root, 'src', 'components', 'EcosystemFamilyLanding.tsx'), 'utf8');
  assert.match(source, /aria-label="Next family in the technical reference"/);
  assert.match(source, /Next in the reference tour/);
  assert.match(source, /<Link to="\/start\/">Start with an outcome<\/Link>/);
  assert.doesNotMatch(source, /Next boundary/);
});
