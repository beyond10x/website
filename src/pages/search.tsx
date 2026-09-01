import {useEffect, useMemo, useState, type ReactNode} from 'react';
import Layout from '@theme/Layout';
import {CardGrid, ContentCard, PageHeader, SearchField, SectionHeader} from '@beyond10x/docs-system/components';
import type {EcosystemRegistry} from '@beyond10x/docs-system/types';
import registryDocument from '../../.generated/data/ecosystem.json';
import styles from './ecosystem.module.css';

const registry = registryDocument as EcosystemRegistry;
interface PagefindResultData {url: string; meta: {title?: string}; excerpt: string}
interface PagefindResult {data(): Promise<PagefindResultData>}
interface PagefindModule {search(query: string): Promise<{results: PagefindResult[]}>}

export default function Search(): ReactNode {
  const [query, setQuery] = useState('');
  const [pagefind, setPagefind] = useState<PagefindModule>();
  const [fullTextResults, setFullTextResults] = useState<PagefindResultData[]>([]);
  const projectResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return registry.surfaces;
    return registry.surfaces.filter((surface) =>
      [surface.name, surface.summary, ...surface.capabilities, ...surface.journeys]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [query]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const load = new Function('url', 'return import(url)') as (url: string) => Promise<PagefindModule>;
    load('/pagefind/pagefind.js').then(setPagefind).catch(() => undefined);
  }, []);

  useEffect(() => {
    let current = true;
    const needle = query.trim();
    if (!pagefind || needle.length < 2) {
      setFullTextResults([]);
      return;
    }
    pagefind.search(needle).then(async ({results}) => {
      const resolved = await Promise.all(results.slice(0, 30).map((result) => result.data()));
      if (current) setFullTextResults(resolved);
    });
    return () => { current = false; };
  }, [pagefind, query]);

  return (
    <Layout title="Search" description="Search the public beyond10x documentation ecosystem.">
      <main className="container">
        <div className={styles.hero}>
          <PageHeader eyebrow="Search" title="Find the boundary or capability you need." description="Search repository-owned guides, references, capabilities, and project profiles from one index." />
          <div className={styles.discoveryControls}>
            <SearchField label="Search every project and technical page" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          </div>
        </div>
        {fullTextResults.length > 0 && (
          <section className={styles.updates} aria-label={`${fullTextResults.length} documentation results`}>
            <SectionHeader title="Documentation" description={`${fullTextResults.length} full-text ${fullTextResults.length === 1 ? 'result' : 'results'} from the locked public source set.`} />
            <CardGrid>{fullTextResults.map((result) => <ContentCard
              key={result.url}
              title={result.meta.title ?? result.url}
              titleUrl={result.url}
              description={<p dangerouslySetInnerHTML={{__html: safeExcerpt(result.excerpt)}} />}
              actionUrl={result.url}
              actionLabel="Open documentation"
            />)}</CardGrid>
          </section>
        )}
        <section className={styles.updates} aria-label={`${projectResults.length} project results`}>
          <SectionHeader title="Projects" description={`${projectResults.length} matching public ${projectResults.length === 1 ? 'surface' : 'surfaces'}.`} />
          <CardGrid>{projectResults.map((surface) => <ContentCard
            key={surface.key}
            title={surface.name}
            titleUrl={`/ecosystem/${surface.repository.id}/`}
            description={surface.summary}
            meta={surface.capabilities.join(' · ')}
            actionUrl={`/ecosystem/${surface.repository.id}/`}
            actionLabel="View project profile"
            accent={surface.accent}
          />)}</CardGrid>
        </section>
      </main>
    </Layout>
  );
}

function safeExcerpt(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('&lt;mark&gt;', '<mark>')
    .replaceAll('&lt;/mark&gt;', '</mark>');
}
