import {compareUtf8} from './order-contract.mjs';

export function describeApiSpecification({document, file, manifest, commit}) {
  const common = {
    repository: file.repository,
    repositoryDisplayName: manifest.repository.displayName ?? file.repository,
    repositoryUrl: manifest.repository.url,
    commit,
    sourcePath: file.sourcePath,
    id: file.specificationId,
    kind: file.kind,
    route: file.route,
  };
  if (file.kind === 'openapi') {
    return {
      ...common,
      title: String(document.info?.title ?? file.specificationId),
      version: String(document.info?.version ?? 'unspecified'),
      operationCount: Object.values(document.paths ?? {}).reduce(
        (total, methods) => total + Object.keys(methods ?? {}).filter(isHttpMethod).length,
        0,
      ),
    };
  }
  return {
    ...common,
    title: String(document.title ?? document.$id ?? file.specificationId),
    propertyCount: Object.keys(document.properties ?? {}).length,
  };
}

export function buildApiCatalog(specifications) {
  const repositories = new Map();
  for (const specification of specifications) {
    let repository = repositories.get(specification.repository);
    if (!repository) {
      repository = {
        id: specification.repository,
        displayName: specification.repositoryDisplayName,
        route: `/api/${specification.repository}/`,
        sourceUrl: `${specification.repositoryUrl}/tree/${specification.commit}`,
        revision: specification.commit,
        specifications: [],
      };
      repositories.set(specification.repository, repository);
    }
    repository.specifications.push({
      id: specification.id,
      kind: specification.kind,
      route: specification.route,
      sourceUrl: `${specification.repositoryUrl}/blob/${specification.commit}/${encodeURI(specification.sourcePath)}`,
      title: specification.title,
      ...(specification.version === undefined ? {} : {version: specification.version}),
      ...(specification.operationCount === undefined ? {} : {operationCount: specification.operationCount}),
      ...(specification.propertyCount === undefined ? {} : {propertyCount: specification.propertyCount}),
    });
  }
  const ordered = [...repositories.values()].sort((left, right) => compareUtf8(left.id, right.id));
  for (const repository of ordered) {
    repository.specifications.sort((left, right) => compareUtf8(left.route, right.route));
  }
  return {schema: 'b10x-public-api-catalog/v1', repositories: ordered};
}

export function renderApiCatalogLanding() {
  return [
    '---',
    'title: Public APIs',
    'slug: /',
    'description: Repository-owned OpenAPI and JSON Schema contracts at locked source revisions.',
    '---',
    '',
    "import ApiCatalog from '@site/src/components/ApiCatalog';",
    "import catalog from '@site/.generated/data/api-catalog.json';",
    '',
    '# Public APIs',
    '',
    'Explore the machine contracts that public beyond10x repositories declare. Every reference and fact below is generated from the exact repository revision in the Website source lock.',
    '',
    '<ApiCatalog catalog={catalog} />',
    '',
    '[Download the deterministic API catalog](/api-catalog.json).',
    '',
  ].join('\n');
}

const httpMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function isHttpMethod(value) {
  return httpMethods.has(value.toLowerCase());
}
