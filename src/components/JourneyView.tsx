import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import {AdoptionCard} from '@beyond10x/docs-system/components';
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
    <header className={styles.hero}>
      <p className="b10x-eyebrow">ADOPTION JOURNEY · {definition.label}</p>
      <Heading as="h1">{definition.title}</Heading>
      <p>{definition.description}</p>
      <div className={styles.counts}><span>{primary.length} primary {primary.length === 1 ? 'destination' : 'destinations'}</span><span>{related.length} related {related.length === 1 ? 'surface' : 'surfaces'}</span></div>
    </header>

    <section className={styles.section} aria-labelledby={`${journey}-primary`}>
      <header><p className="b10x-eyebrow">Start here</p><Heading as="h2" id={`${journey}-primary`}>Choose a surface that owns this outcome.</Heading><p>Primary destinations explicitly declare this as their <code>primaryJourney</code>. Their outcome, prerequisites, and estimated time come from the repository-owned adoption contract.</p></header>
      <div className={styles.primaryGrid}>{primary.map((surface) => <div className={styles.primaryItem} key={surface.key}>
        <AdoptionCard surface={surface} journey={journey} />
        <p className={styles.cardMeta}><span><strong>Audience:</strong> {(surface.audiences ?? []).map(label).join(', ') || 'not declared'}</span><Link to={`/ecosystem/${surface.repository.id}/`}>Project profile</Link></p>
      </div>)}</div>
    </section>

    <section className={styles.verification} aria-labelledby={`${journey}-verification`}>
      <p className="b10x-eyebrow">Verification expectation</p>
      <Heading as="h2" id={`${journey}-verification`}>Know what “done” should make inspectable.</Heading>
      <p>{definition.verification}</p>
    </section>

    {related.length ? <section className={styles.section} aria-labelledby={`${journey}-related`}>
      <header><p className="b10x-eyebrow">Related, not primary</p><Heading as="h2" id={`${journey}-related`}>Bring these surfaces in when the work crosses their boundary.</Heading><p>These repositories mention this journey, but own a different primary outcome. They are context and follow-on options, not required steps.</p></header>
      <ul className={styles.related}>{related.map((surface) => <li key={surface.key}><Link to={`/ecosystem/${surface.repository.id}/`}>{surface.name}</Link><p>{surface.summary}</p><small>Primary: {primaryJourneyOf(surface) ? label(primaryJourneyOf(surface) ?? '') : 'not declared'}</small></li>)}</ul>
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
