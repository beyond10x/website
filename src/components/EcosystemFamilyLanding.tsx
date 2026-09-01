import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import {AdoptionCard, StatusBadge} from '@beyond10x/docs-system/components';
import {surfaceNavigation} from '@beyond10x/docs-system/navigation';
import type {RegistrySurface} from '@beyond10x/docs-system/types';
import registryDocument from '../../.generated/data/ecosystem.json';
import familyTaxonomyDocument from '../../data/ecosystem-families.json';
import styles from './EcosystemFamilyLanding.module.css';

interface FamilyDefinition {
  id: string;
  label: string;
  slug: string;
  purpose: string;
  startRepository: string;
  next: {family: string; label: string};
}

const surfaces = (registryDocument as {surfaces: RegistrySurface[]}).surfaces;
const families = (familyTaxonomyDocument as {families: FamilyDefinition[]}).families;
const familyById = new Map(families.map((family) => [family.id, family]));

export default function EcosystemFamilyLanding({family: familyId}: {family: string}): ReactNode {
  const family = familyById.get(familyId);
  if (!family) throw new Error(`unknown ecosystem family ${familyId}`);
  const members = uniqueRepositories(surfaces.filter((surface) => surfaceNavigation(surface)?.group === family.id));
  const start = members.find((surface) => surface.repository.id === family.startRepository);
  if (!start) throw new Error(`${family.label} start ${family.startRepository} is absent from its declared members`);
  const next = familyById.get(family.next.family);
  if (!next) throw new Error(`${family.label} points to unknown next family ${family.next.family}`);

  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className="b10x-eyebrow">ECOSYSTEM FAMILY · {String(families.indexOf(family) + 1).padStart(2, '0')}</p>
      <Heading as="h1">{family.label}</Heading>
      <p>{family.purpose}</p>
      <span>{members.length} {members.length === 1 ? 'public project' : 'public projects'}</span>
    </header>

    <section className={styles.start} aria-labelledby={`${family.id}-start`}>
      <header>
        <p className="b10x-eyebrow">Recommended start · {start.name}</p>
        <Heading as="h2" id={`${family.id}-start`}>Begin with one inspectable outcome.</Heading>
        <p>The action and prerequisites below are owned by {start.repository.displayName ?? start.name} at the Website's locked source revision.</p>
      </header>
      <div className={styles.startGrid}>
        <AdoptionCard surface={start} journey={primaryJourneyOf(start)} />
        <aside className={styles.availability} aria-label={`${start.name} current availability`}>
          <p className="b10x-eyebrow">Current availability</p>
          <StatusBadge maturity={start.maturity} />
          <dl>
            <div><dt>Maturity</dt><dd>{label(start.maturity)}</dd></div>
            <div><dt>Publication</dt><dd>{label(start.availability)}</dd></div>
            <div><dt>Audience</dt><dd>{(start.audiences ?? []).map(label).join(', ') || 'Not declared'}</dd></div>
          </dl>
          <Link to={`/ecosystem/${start.repository.id}/`}>Inspect the full project profile <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </section>

    <section className={styles.members} aria-labelledby={`${family.id}-members`}>
      <header><p className="b10x-eyebrow">Family members</p><Heading as="h2" id={`${family.id}-members`}>Choose the boundary that owns your next question.</Heading></header>
      <ul>{members.map((surface) => <li key={surface.repository.id}>
        <Heading as="h3"><Link to={`/ecosystem/${surface.repository.id}/`}>{surface.name}</Link></Heading>
        <p>{surface.summary}</p>
        <small>{label(primaryJourneyOf(surface) ?? 'journey-not-declared')} · {label(surface.maturity)}</small>
      </li>)}</ul>
    </section>

    <nav className={styles.next} aria-label="Next ecosystem family">
      <p><span className="b10x-eyebrow">Next boundary</span><strong>{next.label}</strong><small>{family.next.label}</small></p>
      <Link to={`/docs${next.slug}`}>Continue <span aria-hidden="true">→</span></Link>
    </nav>
  </div>;
}

function uniqueRepositories(input: RegistrySurface[]): RegistrySurface[] {
  const byRepository = new Map<string, RegistrySurface>();
  for (const surface of input) {
    const current = byRepository.get(surface.repository.id);
    if (!current || (!current.adoption && surface.adoption) || (current.id !== 'docs' && surface.id === 'docs')) {
      byRepository.set(surface.repository.id, surface);
    }
  }
  return [...byRepository.values()].sort((left, right) => (surfaceNavigation(left)?.order ?? 100) - (surfaceNavigation(right)?.order ?? 100)
    || left.name.localeCompare(right.name, 'en'));
}

function primaryJourneyOf(surface: RegistrySurface) {
  return 'primaryJourney' in surface ? surface.primaryJourney : undefined;
}

function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
