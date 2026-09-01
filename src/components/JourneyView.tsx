import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import {AdoptionCard, Callout, CardGrid, ContentCard, PageHeader, SectionHeader} from '@beyond10x/docs-system/components';
import {surfaceNavigation} from '@beyond10x/docs-system/navigation';
import type {Journey, RegistrySurface} from '@beyond10x/docs-system/types';
import registryDocument from '../../.generated/data/ecosystem.json';
import journeyDocument from '../../data/journeys.json';
import styles from './JourneyView.module.css';

interface JourneyDefinition {
  id: Journey;
  label: string;
  title: string;
  description: string;
  verification: string;
  next: Journey;
}

const surfaces = (registryDocument as {surfaces: RegistrySurface[]}).surfaces
  .filter((surface) => surface.repository.id !== 'website');
const definitions = (journeyDocument as {journeys: JourneyDefinition[]}).journeys;
const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export default function JourneyView({journey}: {journey: Journey}): ReactNode {
  const definition = byId.get(journey);
  if (!definition) throw new Error(`unknown adoption journey ${journey}`);
  const primary = sortSurfaces(surfaces.filter((surface) => primaryJourneyOf(surface) === journey));
  const related = sortSurfaces(surfaces.filter((surface) => surface.journeys.includes(journey) && primaryJourneyOf(surface) !== journey));
  const next = byId.get(definition.next);
  if (!next) throw new Error(`${journey} points to unknown next journey ${definition.next}`);

  return <div className={`container ${styles.page}`}>
    <div className={styles.hero}><PageHeader
      eyebrow={`Adoption journey · ${definition.label}`}
      title={definition.title}
      description={definition.description}
    ><div className={styles.counts}><span>{primary.length} primary {primary.length === 1 ? 'destination' : 'destinations'}</span><span>{related.length} related {related.length === 1 ? 'surface' : 'surfaces'}</span></div></PageHeader></div>

    <section className={styles.section} aria-labelledby={`${journey}-primary`}>
      <SectionHeader eyebrow="Start here" title="Choose a surface that owns this outcome." id={`${journey}-primary`} description={<>Primary destinations explicitly declare this as their <code>primaryJourney</code>. Their outcome, prerequisites, and estimated time come from the repository-owned adoption contract.</>} />
      <CardGrid>{primary.map((surface) => <div className={styles.primaryItem} key={surface.key}>
        <AdoptionCard surface={surface} journey={journey} />
        <p className={styles.cardMeta}><span><strong>Audience:</strong> {(surface.audiences ?? []).map(label).join(', ') || 'not declared'}</span><Link to={`/ecosystem/${surface.repository.id}/`}>Project profile</Link></p>
      </div>)}</CardGrid>
    </section>

    <section className={styles.verification} aria-labelledby={`${journey}-verification`}>
      <SectionHeader eyebrow="Verification expectation" title="Know what “done” should make inspectable." id={`${journey}-verification`} />
      <Callout tone="success" title="Inspectable outcome"><p>{definition.verification}</p></Callout>
    </section>

    {related.length ? <section className={styles.section} aria-labelledby={`${journey}-related`}>
      <SectionHeader eyebrow="Related, not primary" title="Bring these surfaces in when the work crosses their boundary." id={`${journey}-related`} description="These repositories mention this journey, but own a different primary outcome. They are context and follow-on options, not required steps." />
      <CardGrid>{related.map((surface) => <ContentCard
        key={surface.key}
        title={surface.name}
        titleUrl={`/ecosystem/${surface.repository.id}/`}
        description={surface.summary}
        meta={`Primary: ${primaryJourneyOf(surface) ? label(primaryJourneyOf(surface) ?? '') : 'not declared'}`}
        actionUrl={`/ecosystem/${surface.repository.id}/`}
        actionLabel="View project profile"
        accent={surface.accent}
      />)}</CardGrid>
    </section> : null}

    <nav className={styles.next} aria-label="Next adoption journey"><p><span className="b10x-eyebrow">Next journey</span><strong>{next.title}</strong></p><Link to={`/journeys/${next.id}/`}>{next.label} <span aria-hidden="true">→</span></Link></nav>
  </div>;
}

function primaryJourneyOf(surface: RegistrySurface): Journey | undefined {
  return 'primaryJourney' in surface ? surface.primaryJourney : undefined;
}

function sortSurfaces(input: RegistrySurface[]): RegistrySurface[] {
  return input.sort((left, right) => (surfaceNavigation(left)?.order ?? 100) - (surfaceNavigation(right)?.order ?? 100)
    || left.name.localeCompare(right.name, 'en'));
}

function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
