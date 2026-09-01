import type {ReactNode} from 'react';

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
    return <aside className="b10x-boundary">
      <p className="b10x-eyebrow">NO DECLARED CONTRACTS</p>
      <p>API references appear here as soon as a locked public repository declares an OpenAPI document or JSON Schema.</p>
    </aside>;
  }
  return <section className="b10x-api-catalog" aria-label="Public API catalog">
    <p className="b10x-api-catalog__summary">
      <strong>{catalog.repositories.length}</strong> owning repositories · <strong>{contractCount}</strong> machine contracts
    </p>
    <div className="b10x-api-catalog__grid">
      {catalog.repositories.map((repository) => <article key={repository.id}>
        <header>
          <span>{repository.specifications.length} {repository.specifications.length === 1 ? 'contract' : 'contracts'}</span>
          <code>{formatKinds(repository.specifications)}</code>
        </header>
        <h2><a href={repository.route}>{repository.displayName}</a></h2>
        <p>Rendered from the repository-owned machine contracts at a locked revision.</p>
        <ul>
          {repository.specifications.map((specification) => <li key={specification.route}>
            <a href={specification.route}>
              <strong>{specification.title}</strong>
              <span>{specificationFacts(specification)}</span>
            </a>
          </li>)}
        </ul>
        <footer>
          <a href={repository.route}>Browse collection</a>
          <a href={repository.sourceUrl}>View locked source</a>
        </footer>
      </article>)}
    </div>
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
