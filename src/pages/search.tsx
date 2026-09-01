import {useEffect, useMemo, useState, type ReactNode} from 'react';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
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
        <header className={styles.hero}>
          <p className="b10x-eyebrow">SEARCH</p>
          <Heading as="h1">Find the boundary or capability you need.</Heading>
          <div className={styles.search}>
            <label htmlFor="site-search">Search every project and technical page</label>
            <input id="site-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          </div>
        </header>
        {fullTextResults.length > 0 && (
          <section className={styles.updates} aria-label={`${fullTextResults.length} documentation results`}>
            <Heading as="h2">Documentation</Heading>
            {fullTextResults.map((result) => (
              <article key={result.url}>
                <Heading as="h3"><a href={result.url}>{result.meta.title ?? result.url}</a></Heading>
                <p dangerouslySetInnerHTML={{__html: safeExcerpt(result.excerpt)}} />
              </article>
            ))}
          </section>
        )}
        <section className={styles.updates} aria-label={`${projectResults.length} project results`}>
          <Heading as="h2">Projects</Heading>
          {projectResults.map((surface) => (
            <article key={surface.key}>
              <Heading as="h3"><a href={`/docs/${surface.repository.id}/`}>{surface.name}</a></Heading>
              <p>{surface.summary}</p>
              <small>{surface.capabilities.join(' · ')}</small>
            </article>
          ))}
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
