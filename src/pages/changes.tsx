import {useMemo, useState, type ReactNode} from 'react';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import {ChangeTimelineEntry} from '@beyond10x/docs-system/components';
import type {
  ChangeImpact,
  ChangeLedger,
  AnyDocumentationSurface,
  EcosystemRegistry,
  Journey,
} from '@beyond10x/docs-system/types';
import ledgerDocument from '../../.generated/data/changes.json';
import registryDocument from '../../.generated/data/ecosystem.json';
import styles from './ecosystem.module.css';

const ledger = ledgerDocument as ChangeLedger;
const registry = registryDocument as EcosystemRegistry;
const surfaces = new Map<string, AnyDocumentationSurface>(
  registry.surfaces.map((surface) => [surface.key, surface]),
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
        <header className={styles.hero}>
          <p className="b10x-eyebrow">ECOSYSTEM CHANGES</p>
          <Heading as="h1">One impact trail across the repositories.</Heading>
          <p>
            Maintainers publish changes that alter an adopter journey, migration, or relationship;
            the owning repository remains the authority and links to its evidence. The complete,
            mechanical stream remains available under <a href="/releases/">releases</a>.
          </p>
          <div className={styles.feedLinks}>
            <a href="/changes/impact.rss.xml">RSS</a>
            <a href="/changes/impact.feed.json">JSON Feed</a>
          </div>
          <div className={styles.search}>
            <label htmlFor="change-search">Find a repository, version, or capability</label>
            <input
              id="change-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="AEP, worktree, migration, 0.2.0…"
            />
          </div>
          <div className={styles.filterGroups}>
            <div className={styles.journeys} aria-label="Filter changes by journey">
              {journeys.map((item) => (
                <button key={item.id} type="button" data-active={journey === item.id}
                  aria-pressed={journey === item.id} onClick={() => setJourney(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className={styles.journeys} aria-label="Filter changes by impact">
              {impacts.map((item) => (
                <button key={item.id} type="button" data-active={impact === item.id}
                  aria-pressed={impact === item.id} onClick={() => setImpact(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </header>
        <section className={styles.timeline} aria-label={`${visible.length} ecosystem changes`}>
          {visible.map((change) => (
            <ChangeTimelineEntry key={change.key} change={change} surfaces={surfaces} />
          ))}
        </section>
        {!visible.length && <p className={styles.empty}>No ecosystem change matches those filters.</p>}
      </main>
    </Layout>
  );
}
