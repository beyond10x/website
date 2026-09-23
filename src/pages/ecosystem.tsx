import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {useLocation} from '@docusaurus/router';
import Layout from '@theme/Layout';
import {CardGrid, FilterChipGroup, PageHeader, ProjectCard, SearchField} from '@beyond10x/docs-system/components';
import {deriveEcosystemNavigation, surfaceNavigation} from '@beyond10x/docs-system/navigation';
import type {EcosystemRegistry, Journey} from '@beyond10x/docs-system/types';
import registryDocument from '../../.generated/data/ecosystem.json';
import familyTaxonomy from '../../data/ecosystem-families.json';
import {localizedAdoptionHref} from '@site/src/lib/published';
import styles from './ecosystem.module.css';

const registry = registryDocument as EcosystemRegistry;
const familyOrder = familyTaxonomy.families.map((family) => family.id);
const families = deriveEcosystemNavigation(registry, {familyOrder}).families.map((family) => family.name);
// `satisfies Record<Journey, string>` makes this exhaustive: adding or renaming a member of
// docs-system's `Journey` union without updating this map fails `npm run typecheck`.
const journeyLabels = {
  understand: 'Understand',
  'plan-work': 'Plan work',
  specify: 'Specify',
  'build-agents': 'Build agents',
  'operate-services': 'Operate services',
} satisfies Record<Journey, string>;
const journeys: Array<{id: Journey | 'all'; label: string}> = [
  {id: 'all', label: 'Everything public'},
  ...(Object.keys(journeyLabels) as Journey[]).map((id) => ({id, label: journeyLabels[id]})),
];

export default function Ecosystem(): ReactNode {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [journey, setJourney] = useState<Journey | 'all'>('all');
  const [family, setFamily] = useState<string | 'all'>('all');
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const requestedJourney = search.get('journey');
    setJourney(journeys.some((item) => item.id === requestedJourney) ? requestedJourney as Journey | 'all' : 'all');
    const requestedFamily = search.get('family');
    setFamily(requestedFamily && families.includes(requestedFamily) ? requestedFamily : 'all');
    setQuery(search.get('q') ?? '');
    setUrlReady(true);
  }, [location.search]);
  useEffect(() => {
    if (!urlReady || typeof window === 'undefined') return;
    const search = new URLSearchParams();
    if (query.trim()) search.set('q', query.trim());
    if (journey !== 'all') search.set('journey', journey);
    if (family !== 'all') search.set('family', family);
    const serialized = search.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${serialized ? `?${serialized}` : ''}`);
  }, [family, journey, query, urlReady]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return registry.surfaces.filter((surface) => {
      const inJourney = journey === 'all' || surface.journeys.includes(journey);
      const inFamily = family === 'all' || surfaceNavigation(surface)?.group === family;
      const searchable = [surface.name, surface.summary, surface.kind, surface.maturity, ...surface.capabilities, ...surface.sections.map((section) => section.label)].join(' ').toLocaleLowerCase();
      return inJourney && inFamily && (!needle || searchable.includes(needle));
    });
  }, [family, journey, query]);

  return <Layout title="Public ecosystem" description="Find the public beyond10x project, guide, API, or research surface for the question you have.">
    <main className={`container ${styles.page}`}>
      <div className={styles.hero}>
        <PageHeader
          eyebrow="Public ecosystem"
          title="Find the public surface that owns your next question."
          description="Search capabilities and documentation sections, choose an ecosystem family, or filter by the outcome you need. This index is generated from manifests owned by the projects themselves; planned and private systems are not presented as public destinations."
        />
        <div className={styles.discoveryControls}>
          <SearchField
            label="Find a project, capability, or section"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="confinement, OpenAPI, evidence, agent loop…"
          />
          <FilterChipGroup
            label="Ecosystem family"
            selected={[family]}
            options={[{value: 'all', label: 'All families'}, ...families.map((item) => ({value: item, label: item}))]}
            onToggle={(value) => setFamily(value)}
          />
          <FilterChipGroup
            label="Adoption outcome"
            selected={[journey]}
            options={journeys.map((item) => ({value: item.id, label: item.label}))}
            onToggle={(value) => setJourney(value as Journey | 'all')}
          />
        </div>
      </div>
      {visible.length ? <section aria-label={`${visible.length} matching public surfaces`}>
        <CardGrid>
          {visible.map((surface) => <ProjectCard
            key={surface.key}
            surface={surface}
            headingLevel={2}
            titleUrl={`/ecosystem/${surface.repository.id}/`}
            actionUrl={localizedAdoptionHref(surface)}
          />)}
        </CardGrid>
      </section> : <p className={styles.empty}>No public surface matches those family, journey, and search filters.</p>}
    </main>
  </Layout>;
}
