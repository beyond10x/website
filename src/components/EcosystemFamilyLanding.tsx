import type {ReactNode} from 'react';
import Link from '@site/src/lib/PublishedLink';
import {AdoptionCard, CardGrid, ContentCard, FactGrid, PageHeader, SectionHeader, StatusBadge} from '@beyond10x/docs-system/components';
import {surfaceNavigation} from '@beyond10x/docs-system/navigation';
import type {RegistrySurface} from '@beyond10x/docs-system/types';
import registryDocument from '../../.generated/data/ecosystem.json';
import familyTaxonomyDocument from '../../data/ecosystem-families.json';
import {localizedAdoptionHref} from '@site/src/lib/published';
import {isQuarantinedRepository} from '../lib/published';
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
  // A start is absent only when this build quarantines it; any other absence is a taxonomy error.
  if (!start && !isQuarantinedRepository(family.startRepository)) {
    throw new Error(`${family.label} start ${family.startRepository} is absent from its declared members`);
  }
  const next = familyById.get(family.next.family);
  if (!next) throw new Error(`${family.label} points to unknown next family ${family.next.family}`);

  return <div className={styles.page}>
    <PageHeader
      eyebrow={`Ecosystem family · ${String(families.indexOf(family) + 1).padStart(2, '0')}`}
      title={family.label}
      description={family.purpose}
    ><span>{members.length} {members.length === 1 ? 'public project' : 'public projects'}</span></PageHeader>

    {start ? <section className={styles.start} aria-labelledby={`${family.id}-start`}>
      <SectionHeader
        eyebrow={`Recommended start · ${start.name}`}
        title="Begin with one inspectable outcome."
        id={`${family.id}-start`}
        description={`The action and prerequisites below are owned by ${start.repository.displayName ?? start.name} at the Website's locked source revision.`}
      />
      <div className={styles.startGrid}>
        <AdoptionCard surface={start} journey={primaryJourneyOf(start)} actionUrl={localizedAdoptionHref(start)} />
        <ContentCard
          title="Current availability"
          meta={<StatusBadge maturity={start.maturity} />}
          actionUrl={`/ecosystem/${start.repository.id}/`}
          actionLabel="Inspect the full project profile"
        ><FactGrid items={[
          {label: 'Maturity', value: label(start.maturity)},
          {label: 'Publication', value: label(start.availability)},
          {label: 'Audience', value: (start.audiences ?? []).map(label).join(', ') || 'Not declared'},
        ]} /></ContentCard>
      </div>
    </section> : <section className={styles.start} aria-labelledby={`${family.id}-start`}>
      <SectionHeader
        eyebrow={`Recommended start · ${family.startRepository}`}
        title="This family's recommended start is not published in this build."
        id={`${family.id}-start`}
        description="Its documentation failed validation at the last publication, so the portal leaves it out rather than showing a stale copy."
      />
      <p><Link to={`https://github.com/beyond10x/${family.startRepository}`}>Read {family.startRepository} on GitHub</Link></p>
    </section>}

    <section className={styles.members} aria-labelledby={`${family.id}-members`}>
      <SectionHeader eyebrow="Family members" title="Choose the boundary that owns your next question." id={`${family.id}-members`} />
      {members.length === 0 ? <p>No project in this family is published in this build.</p> : null}
      <CardGrid columns={2}>{members.map((surface) => <ContentCard
        key={surface.repository.id}
        title={surface.name}
        titleUrl={`/ecosystem/${surface.repository.id}/`}
        description={surface.summary}
        meta={`${label(primaryJourneyOf(surface) ?? 'journey-not-declared')} · ${label(surface.maturity)}`}
        actionUrl={`/ecosystem/${surface.repository.id}/`}
        actionLabel="View project profile"
        accent={surface.accent}
      />)}</CardGrid>
    </section>

    <nav className={styles.next} aria-label="Next family in the technical reference">
      <p><span className="b10x-eyebrow">Next in the reference tour</span><strong>{next.label}</strong><small>{family.next.label} New to agentic coding? <Link to="/start/">Start with an outcome</Link>.</small></p>
      <Link to={`/docs${next.slug}`}>Continue the reference <span aria-hidden="true">→</span></Link>
    </nav>
  </div>;
}

function uniqueRepositories(input: RegistrySurface[]): RegistrySurface[] {
  const byRepository = new Map<string, RegistrySurface>();
  for (const surface of input) {
    const current = byRepository.get(surface.repository.id);
    if (!current || (!declaredAdoption(current) && declaredAdoption(surface)) || (current.id !== 'docs' && surface.id === 'docs')) {
      byRepository.set(surface.repository.id, surface);
    }
  }
  return [...byRepository.values()].sort((left, right) => (surfaceNavigation(left)?.order ?? 100) - (surfaceNavigation(right)?.order ?? 100)
    || left.name.localeCompare(right.name, 'en'));
}

function declaredAdoption(surface: RegistrySurface) {
  return 'adoption' in surface ? surface.adoption : undefined;
}

function primaryJourneyOf(surface: RegistrySurface) {
  return 'primaryJourney' in surface ? surface.primaryJourney : undefined;
}

function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
