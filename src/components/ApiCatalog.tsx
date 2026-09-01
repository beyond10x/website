import type {ReactNode} from 'react';
import {Callout, CardGrid, ContentCard, FactGrid} from '@beyond10x/docs-system/components';

interface ApiSpecification {
  id: string;
  kind: 'openapi' | 'json-schema';
  route: string;
  sourceUrl: string;
  title: string;
  version?: string;
  operationCount?: number;
  propertyCount?: number;
}

interface ApiRepository {
  id: string;
  displayName: string;
  route: string;
  sourceUrl: string;
  revision: string;
  specifications: ApiSpecification[];
}

interface ApiCatalogDocument {
  schema: 'b10x-public-api-catalog/v1';
  repositories: ApiRepository[];
}

export default function ApiCatalog({catalog}: {catalog: ApiCatalogDocument}): ReactNode {
  const contractCount = catalog.repositories.reduce(
    (total, repository) => total + repository.specifications.length,
    0,
  );
  if (!catalog.repositories.length) {
    return <Callout title="No declared contracts">
      <p>API references appear here as soon as a locked public repository declares an OpenAPI document or JSON Schema.</p>
    </Callout>;
  }
  return <section className="b10x-api-catalog" aria-label="Public API catalog">
    <FactGrid items={[
      {label: 'Owning repositories', value: catalog.repositories.length},
      {label: 'Machine contracts', value: contractCount},
    ]} />
    <CardGrid>
      {catalog.repositories.map((repository) => <ContentCard
        key={repository.id}
        title={repository.displayName}
        titleUrl={repository.route}
        eyebrow={`${repository.specifications.length} ${repository.specifications.length === 1 ? 'contract' : 'contracts'}`}
        meta={<code>{formatKinds(repository.specifications)}</code>}
        description="Rendered from the repository-owned machine contracts at a locked revision."
        footer={<a href={repository.sourceUrl}>View locked source</a>}
        actionUrl={repository.route}
        actionLabel="Browse collection"
        headingLevel={2}
      >
        <ul>
          {repository.specifications.map((specification) => <li key={specification.route}>
            <a href={specification.route}>
              <strong>{specification.title}</strong>
              <span>{specificationFacts(specification)}</span>
            </a>
          </li>)}
        </ul>
      </ContentCard>)}
    </CardGrid>
  </section>;
}

function formatKinds(specifications: ApiSpecification[]): string {
  const kinds = [...new Set(specifications.map((specification) => specification.kind))];
  return kinds.map((kind) => kind === 'openapi' ? 'OpenAPI' : 'JSON Schema').join(' + ');
}

function specificationFacts(specification: ApiSpecification): string {
  if (specification.kind === 'openapi') {
    return `${specification.operationCount ?? 0} operations · version ${specification.version ?? 'unspecified'}`;
  }
  return `${specification.propertyCount ?? 0} top-level properties · JSON Schema`;
}
