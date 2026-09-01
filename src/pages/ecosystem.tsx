import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {useLocation} from '@docusaurus/router';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import type {EcosystemRegistry, Journey} from '@beyond10x/docs-system/types';
import EcosystemProjectCard from '../components/EcosystemProjectCard';
import registryDocument from '../../.generated/data/ecosystem.json';
import styles from './ecosystem.module.css';

const registry = registryDocument as EcosystemRegistry;
const journeys: Array<{id: Journey | 'all'; label: string}> = [
  {id: 'all', label: 'Everything public'},
  {id: 'understand', label: 'Understand'},
  {id: 'plan-work', label: 'Plan work'},
  {id: 'specify', label: 'Specify'},
  {id: 'build-agents', label: 'Build agents'},
  {id: 'operate-services', label: 'Operate services'},
];

export default function Ecosystem(): ReactNode {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [journey, setJourney] = useState<Journey | 'all'>('all');
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('journey');
    if (journeys.some((item) => item.id === requested)) setJourney(requested as Journey | 'all');
  }, [location.search]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return registry.surfaces.filter((surface) => {
      const inJourney = journey === 'all' || surface.journeys.includes(journey);
      const searchable = [surface.name, surface.summary, surface.kind, surface.maturity, ...surface.capabilities, ...surface.sections.map((section) => section.label)].join(' ').toLocaleLowerCase();
      return inJourney && (!needle || searchable.includes(needle));
    });
  }, [journey, query]);

  return <Layout title="Public ecosystem" description="Find the public beyond10x project, guide, API, or research surface for the question you have."><main className="container"><header className={styles.hero}><p className="b10x-eyebrow">PUBLIC ECOSYSTEM</p><Heading as="h1">Begin where your ambiguity lives.</Heading><p>Search capabilities and documentation sections, or choose a journey. This index is generated from manifests owned by the projects themselves; planned and private systems are not presented as public destinations.</p><div className={styles.search}><label htmlFor="ecosystem-search">Find a project, capability, or section</label><input id="ecosystem-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="confinement, OpenAPI, evidence, agent loop…" /></div><div className={styles.journeys} aria-label="Filter by journey">{journeys.map((item) => <button key={item.id} type="button" data-active={journey === item.id} aria-pressed={journey === item.id} onClick={() => setJourney(item.id)}>{item.label}</button>)}</div></header>{visible.length ? <section className={styles.grid} aria-label={`${visible.length} matching public surfaces`}>{visible.map((surface) => <EcosystemProjectCard key={surface.key} surface={surface} />)}</section> : <p className={styles.empty}>No public surface matches that search and journey.</p>}</main></Layout>;
}
