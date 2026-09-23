import {essText, parseEssDocument} from '@beyond10x/docs-system/ess-document';

/** Select only ESS's explicit format; never guess a contract from a catalog's shape. */
export function essContractReference({document, sourceUrl, sourceRepository, slug, title}) {
  if (typeof document?.format !== 'string' || !document.format.startsWith('ess-docs/')) return undefined;
  const index = parseEssDocument(document);
  const prop = value => `{${JSON.stringify(value)}}`;
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `slug: ${JSON.stringify(slug)}`,
    '---',
    '',
    "import EssContractReference from '@site/src/components/EssContractReference';",
    '',
    `${markdownText(document.system)} · Specification ${markdownText(document.version)} · ${index.pages.size} reference pages`,
    '',
    'Explore the declared model, then follow its entities, commands, events, and lifecycle transitions. Contract declarations do not establish runtime enforcement.',
    '',
    `<EssContractReference sourceUrl=${prop(sourceUrl)} sourceRepository=${prop(sourceRepository)} title=${prop(title)} />`,
    '',
    '## Reference contents',
    '',
    ...document.pages.map(page => `- **${markdownText(essText(page.title))}** — ${index.sections.get(page.id).length} sections`),
    '',
    `[Download the ESS documentation projection](pathname://${sourceUrl})`,
    '',
  ].join('\n');
}

export function markdownText(value) {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/[&<>{}\\`[\]*_!|]/g, character => `&#${character.codePointAt(0)};`);
}
