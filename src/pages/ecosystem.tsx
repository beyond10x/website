import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {useLocation} from '@docusaurus/router';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import {deriveEcosystemNavigation, surfaceNavigation} from '@beyond10x/docs-system/navigation';
import type {EcosystemRegistry, Journey} from '@beyond10x/docs-system/types';
import EcosystemProjectCard from '../components/EcosystemProjectCard';
import registryDocument from '../../.generated/data/ecosystem.json';
import familyTaxonomy from '../../data/ecosystem-families.json';
import styles from './ecosystem.module.css';

const registry = registryDocument as EcosystemRegistry;
const familyOrder = familyTaxonomy.families.map((family) => family.id);
const families = deriveEcosystemNavigation(registry, {familyOrder}).families.map((family) => family.name);
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
  const [family, setFamily] = useState<string | 'all'>('all');
  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const requestedJourney = search.get('journey');
    setJourney(journeys.some((item) => item.id === requestedJourney) ? requestedJourney as Journey | 'all' : 'all');
    const requestedFamily = search.get('family');
    setFamily(requestedFamily && families.includes(requestedFamily) ? requestedFamily : 'all');
  }, [location.search]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return registry.surfaces.filter((surface) => {
      const inJourney = journey === 'all' || surface.journeys.includes(journey);
      const inFamily = family === 'all' || surfaceNavigation(surface)?.group === family;
      const searchable = [surface.name, surface.summary, surface.kind, surface.maturity, ...surface.capabilities, ...surface.sections.map((section) => section.label)].join(' ').toLocaleLowerCase();
      return inJourney && inFamily && (!needle || searchable.includes(needle));
    });
  }, [family, journey, query]);

  return <Layout title="Public ecosystem" description="Find the public beyond10x project, guide, API, or research surface for the question you have."><main className="container"><header className={styles.hero}><p className="b10x-eyebrow">PUBLIC ECOSYSTEM</p><Heading as="h1">Find the public surface that owns your next question.</Heading><p>Search capabilities and documentation sections, choose an ecosystem family, or filter by the outcome you need. This index is generated from manifests owned by the projects themselves; planned and private systems are not presented as public destinations.</p><div className={styles.search}><label htmlFor="ecosystem-search">Find a project, capability, or section</label><input id="ecosystem-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="confinement, OpenAPI, evidence, agent loop…" /></div><div className={styles.filterGroups}><span>Family</span><div className={styles.journeys} aria-label="Filter by ecosystem family"><button type="button" data-active={family === 'all'} aria-pressed={family === 'all'} onClick={() => setFamily('all')}>All families</button>{families.map((item) => <button key={item} type="button" data-active={family === item} aria-pressed={family === item} onClick={() => setFamily(item)}>{item}</button>)}</div><span>Outcome</span><div className={styles.journeys} aria-label="Filter by journey">{journeys.map((item) => <button key={item.id} type="button" data-active={journey === item.id} aria-pressed={journey === item.id} onClick={() => setJourney(item.id)}>{item.label}</button>)}</div></div></header>{visible.length ? <section className={styles.grid} aria-label={`${visible.length} matching public surfaces`}>{visible.map((surface) => <EcosystemProjectCard key={surface.key} surface={surface} />)}</section> : <p className={styles.empty}>No public surface matches those family, journey, and search filters.</p>}</main></Layout>;
}
