import {useEffect, useMemo, useState, type ReactNode} from 'react';
import Layout from '@theme/Layout';
import {
  CardGrid,
  ContentCard,
  PageHeader,
  SearchField,
  SectionHeader,
} from '@beyond10x/docs-system/components';
import type {EcosystemRegistry} from '@beyond10x/docs-system/types';
import registryDocument from '../../.generated/data/ecosystem.json';
import {
  preferredExperienceFilters,
  prioritizeSearchResults,
  resultCountDescription,
  resultSummary,
} from '../search-result-contract.mjs';
import styles from './ecosystem.module.css';

const registry = registryDocument as EcosystemRegistry;
type FilterKey = 'experience' | 'audience' | 'project' | 'document_type';
type ActiveFilters = Partial<Record<FilterKey, string>>;
type AvailableFilters = Partial<Record<FilterKey, Record<string, number>>>;

interface PagefindResultData {
  url: string;
  meta: Record<string, string | undefined>;
  excerpt: string;
}

interface PagefindResult {id: string; data(): Promise<PagefindResultData>}

interface PagefindSearchResponse {
  results: PagefindResult[];
  unfilteredResultCount?: number;
}

interface PagefindModule {
  options(options: {ranking: {metaWeights: Record<string, number>}}): Promise<void>;
  search(query: string | null, options?: {filters?: ActiveFilters}): Promise<PagefindSearchResponse>;
  filters(): Promise<AvailableFilters>;
}

const filterKeys: FilterKey[] = ['experience', 'audience', 'project', 'document_type'];
const filterLabels: Record<FilterKey, string> = {
  experience: 'Path',
  audience: 'Audience',
  project: 'Project',
  document_type: 'Document type',
};

export default function Search(): ReactNode {
  const [query, setQuery] = useState('');
  const [pagefind, setPagefind] = useState<PagefindModule>();
  const [availableFilters, setAvailableFilters] = useState<AvailableFilters>({});
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [fullTextResults, setFullTextResults] = useState<PagefindResultData[]>([]);
  const [fullTextTotal, setFullTextTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [urlReady, setUrlReady] = useState(false);

  const hasContext = Object.values(activeFilters).some(Boolean);
  const projectResults = useMemo(() => {
    if (hasContext) return [];
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return registry.surfaces.filter((surface) => surface.repository.id !== 'website');
    return registry.surfaces.filter((surface) =>
      [surface.name, surface.summary, ...surface.capabilities, ...surface.journeys]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [hasContext, query]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parameters = new URLSearchParams(window.location.search);
    setQuery(parameters.get('q') ?? '');
    setActiveFilters(Object.fromEntries(
      filterKeys.map((key) => [key, parameters.get(key)]).filter((entry): entry is [FilterKey, string] => Boolean(entry[1])),
    ));
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const load = new Function('url', 'return import(url)') as (url: string) => Promise<PagefindModule>;
    load('/pagefind/pagefind.js').then(async (module) => {
      await module.options({ranking: {metaWeights: {title: 5, qualified_title: 5, search_priority: 10}}});
      setPagefind(module);
      setAvailableFilters(await module.filters());
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!urlReady || typeof window === 'undefined') return;
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set('q', query.trim());
    for (const key of filterKeys) {
      if (activeFilters[key]) parameters.set(key, activeFilters[key]);
    }
    const search = parameters.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  }, [activeFilters, query, urlReady]);

  useEffect(() => {
    let current = true;
    const needle = query.trim();
    if (!pagefind || (needle.length < 2 && !hasContext)) {
      setFullTextResults([]);
      setFullTextTotal(0);
      setSearching(false);
      return;
    }
    setSearching(true);
    pagefind.search(needle.length >= 2 ? needle : null, {filters: activeFilters}).then(async ({results}) => {
      const preferredFilters = preferredExperienceFilters(needle, activeFilters);
      const preferred = preferredFilters
        ? (await pagefind.search(null, {filters: preferredFilters})).results
        : [];
      const selected = prioritizeSearchResults(results, preferred, 40);
      const resolved = await Promise.all(selected.map((result) => result.data()));
      if (current) {
        setFullTextResults(resolved);
        setFullTextTotal(results.length);
        setSearching(false);
      }
    }).catch(() => {
      if (current) {
        setFullTextResults([]);
        setFullTextTotal(0);
        setSearching(false);
      }
    });
    return () => { current = false; };
  }, [activeFilters, hasContext, pagefind, query]);

  const clearFiltersUrl = query.trim() ? `/search/?q=${encodeURIComponent(query.trim())}` : '/search/';

  return (
    <Layout title="Search" description="Search the public beyond10x documentation by path, audience, project, and document type.">
      <main className={`container ${styles.page}`}>
        <div className={styles.hero}>
          <PageHeader
            eyebrow="Search"
            title="Find the next answer without browsing every project."
            description="Search the source-locked corpus, then narrow it by the path you are following, your audience, the owning project, or the kind of document you need."
          />
          <div className={styles.discoveryControls}>
            <SearchField
              label="Search all documentation"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="safe autonomous coding, install Agent Plugins, Harness approvals…"
              autoFocus
            />
            <div className={styles.searchFilters}>
              {filterKeys.map((key) => (
                <label key={key}>
                  <span>{filterLabels[key]}</span>
                  <select
                    value={activeFilters[key] ?? ''}
                    onChange={(event) => setActiveFilters((current) => ({
                      ...current,
                      [key]: event.target.value || undefined,
                    }))}>
                    <option value="">All {filterLabels[key].toLocaleLowerCase()}</option>
                    {Object.entries(availableFilters[key] ?? {})
                      .sort(([left], [right]) => left.localeCompare(right, 'en'))
                      .map(([value, count]) => <option key={value} value={value}>{humanize(value)} ({count})</option>)}
                  </select>
                </label>
              ))}
            </div>
            {hasContext ? (
              <div className={styles.activeFilters} aria-label="Active search context">
                <span>Searching within:</span>
                {filterKeys.filter((key) => activeFilters[key]).map((key) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setActiveFilters((current) => ({...current, [key]: undefined}))}
                    aria-label={`Remove ${filterLabels[key]} filter ${activeFilters[key]}`}>
                    {filterLabels[key]}: {humanize(activeFilters[key] ?? '')} <span aria-hidden="true">×</span>
                  </button>
                ))}
                <a href={clearFiltersUrl}>Search all documentation</a>
              </div>
            ) : null}
          </div>
        </div>

        {(searching || fullTextResults.length > 0 || (hasContext && pagefind)) && (
          <section className={styles.updates} aria-live="polite" aria-label="Documentation search results">
            <SectionHeader
              title="Documentation"
              description={searching ? 'Searching the locked public corpus…' : resultCountDescription(fullTextResults.length, fullTextTotal)}
            />
            {!searching && fullTextResults.length === 0 ? <p className={styles.empty}>No page matches this query and context. Remove a filter or search all documentation.</p> : null}
            <CardGrid>{fullTextResults.map((result) => (
              <ContentCard
                key={result.url}
                eyebrow={result.meta.project ?? result.meta.document_type}
                title={qualifiedTitle(result)}
                titleUrl={result.url}
                description={resultSummary(result, {preferDescription: !query.trim()})}
                meta={[result.meta.document_type, result.meta.experience]
                  .filter((value): value is string => Boolean(value))
                  .map(humanize)
                  .join(' · ')}
                actionUrl={result.url}
                actionLabel="Open documentation"
              />
            ))}</CardGrid>
          </section>
        )}

        {!hasContext ? (
          <section className={styles.updates} aria-label={`${projectResults.length} project results`}>
            <SectionHeader title="Projects" description={`${projectResults.length} matching public ${projectResults.length === 1 ? 'surface' : 'surfaces'}. Project profiles are reference; start from a documentation path if you are new.`} />
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
        ) : null}
      </main>
    </Layout>
  );
}

function qualifiedTitle(result: PagefindResultData): string {
  if (result.meta.qualified_title) return result.meta.qualified_title;
  const title = result.meta.title ?? result.url;
  return result.meta.project && !title.includes(result.meta.project) ? `${title} | ${result.meta.project}` : title;
}

function humanize(value: string): string {
  return value.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
