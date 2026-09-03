import {useMemo, useState, type ReactNode} from 'react';
import Layout from '@theme/Layout';
import {Callout, ChangeTimelineEntry, FilterChipGroup, PageHeader, SearchField} from '@beyond10x/docs-system/components';
import type {
  ChangeImpact,
  ChangeLedger,
  AnyDocumentationSurface,
  EcosystemRegistry,
  Journey,
} from '@beyond10x/docs-system/types';
import ledgerDocument from '../../.generated/data/changes.json';
import registryDocument from '../../.generated/data/ecosystem.json';
import {localizeWebsiteHref} from '../lib/links';
import styles from './ecosystem.module.css';

const ledger = ledgerDocument as ChangeLedger;
const registry = registryDocument as EcosystemRegistry;
const surfaces = new Map<string, AnyDocumentationSurface>(
  registry.surfaces.map((surface) => [surface.key, {
    ...surface,
    canonicalUrl: localizeWebsiteHref(surface.canonicalUrl),
  }]),
);
const journeys: Array<{id: Journey | 'all'; label: string}> = [
  {id: 'all', label: 'All journeys'},
  {id: 'understand', label: 'Understand'},
  {id: 'plan-work', label: 'Plan work'},
  {id: 'specify', label: 'Specify'},
  {id: 'build-agents', label: 'Build agents'},
  {id: 'operate-services', label: 'Operate services'},
];
const impacts: Array<{id: ChangeImpact | 'all'; label: string}> = [
  {id: 'all', label: 'All impact'},
  {id: 'significant', label: 'Significant'},
  {id: 'action-required', label: 'Action required'},
];

export default function Changes(): ReactNode {
  const [query, setQuery] = useState('');
  const [journey, setJourney] = useState<Journey | 'all'>('all');
  const [impact, setImpact] = useState<ChangeImpact | 'all'>('all');
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return ledger.changes.filter((change) => {
      if (change.channel === 'releases' || change.automatic) return false;
      const inJourney = journey === 'all' || change.journeys.includes(journey);
      const inImpact = impact === 'all' || change.impact === impact;
      const searchable = [
        change.repository,
        change.title,
        change.summary,
        change.kind,
        change.source.version ?? '',
      ].join(' ').toLocaleLowerCase();
      return inJourney && inImpact && (!needle || searchable.includes(needle));
    });
  }, [impact, journey, query]);

  return (
    <Layout
      title="Ecosystem changes"
      description="Important releases, capabilities, migrations, and adopter actions across beyond10x.">
      <main className="container">
        <div className={styles.hero}>
          <PageHeader
            eyebrow="Ecosystem changes"
            title="One impact trail across the repositories."
            description={<>Maintainers publish changes that alter an adopter journey, migration, or relationship; the owning repository remains the authority and links to its evidence. The complete, mechanical stream remains available under <a href="/releases/">releases</a>.</>}
            actions={<><a href="/changes/impact.rss.xml">RSS</a><a href="/changes/impact.feed.json">JSON Feed</a></>}
          />
          <div className={styles.discoveryControls}>
            <SearchField
              label="Find a repository, version, or capability"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="AEP, worktree, migration, 0.2.0…"
            />
            <FilterChipGroup
              label="Adoption journey"
              selected={[journey]}
              options={journeys.map((item) => ({value: item.id, label: item.label}))}
              onToggle={(value) => setJourney(value as Journey | 'all')}
            />
            <FilterChipGroup
              label="Impact"
              selected={[impact]}
              options={impacts.map((item) => ({value: item.id, label: item.label}))}
              onToggle={(value) => setImpact(value as ChangeImpact | 'all')}
            />
          </div>
        </div>
        <section className={styles.timeline} aria-label={`${visible.length} ecosystem changes`}>
          {visible.map((change) => (
            <ChangeTimelineEntry key={change.key} change={localizeChangeLinks(change)} surfaces={surfaces} />
          ))}
        </section>
        {!visible.length && <Callout title="No matching changes">Try a broader search or reset one of the filters.</Callout>}
      </main>
    </Layout>
  );
}

function localizeChangeLinks(change: ChangeLedger['changes'][number]): ChangeLedger['changes'][number] {
  return {
    ...change,
    source: {...change.source, url: localizeWebsiteHref(change.source.url)},
    ...(change.action ? {action: {...change.action, url: localizeWebsiteHref(change.action.url)}} : {}),
  };
}
