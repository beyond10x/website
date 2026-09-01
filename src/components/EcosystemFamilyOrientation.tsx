import {useId, type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import {surfaceNavigation} from '@beyond10x/docs-system/navigation';
import type {RegistrySurface} from '@beyond10x/docs-system/types';
import familyTaxonomyDocument from '../../data/ecosystem-families.json';
import styles from './EcosystemFamilyOrientation.module.css';

interface FamilyDefinition {
  id: string;
  label: string;
  slug: string;
  expectedMembers: number;
  purpose: string;
  startRepository: string;
  next: {family: string; label: string};
}

interface FamilyTaxonomy {
  schema: 'b10x-ecosystem-families/v1';
  families: FamilyDefinition[];
}

const taxonomy = familyTaxonomyDocument as FamilyTaxonomy;
const familyById = new Map(taxonomy.families.map((family) => [family.id, family]));

export default function EcosystemFamilyOrientation({
  surfaces,
  title = 'Choose a clear place to begin.',
  description = 'Each family answers a different question. Start with one concrete path, then follow the next boundary only when you need it.',
}: {
  surfaces: RegistrySurface[];
  title?: string;
  description?: string;
}): ReactNode {
  const titleId = `ecosystem-family-orientation-${useId().replaceAll(':', '')}`;
  const cards = taxonomy.families.map((family, index) => {
    const candidates = surfaces.filter((surface) => surface.repository.id === family.startRepository);
    const start = candidates.find((surface) => surface.adoption) ?? candidates[0];
    if (!start) throw new Error(`recommended family start ${family.startRepository} is absent from the public registry`);
    const next = familyById.get(family.next.family);
    if (!next) throw new Error(`${family.id} points to unknown next family ${family.next.family}`);
    const action = start.adoption ?? {label: `Read ${start.name}`, url: start.canonicalUrl};
    const memberCount = new Set(surfaces
      .filter((surface) => surfaceNavigation(surface)?.group === family.id)
      .map((surface) => surface.repository.id)).size;
    const familyTarget = memberCount > 0 ? familyDocsPath(family.slug) : familyExplorePath(family.id);
    return {family, index, start, action, next, memberCount, familyTarget};
  });

  return (
    <section className={`b10x-family-gateway ${styles.section}`} aria-labelledby={titleId}>
      <header className="b10x-family-gateway__header">
        <p className="b10x-eyebrow">ECOSYSTEM MAP</p>
        <Heading as="h2" id={titleId}>{title}</Heading>
        <p>{description}</p>
      </header>
      <div className="b10x-family-gateway__families">
        {cards.map(({family, index, start, action, next, memberCount, familyTarget}) => (
          <article className={`b10x-family-card ${styles.card}`} key={family.id}>
            <header>
              <Heading as="h3"><Link to={familyTarget}>{family.label}</Link></Heading>
              <span>{String(index + 1).padStart(2, '0')} · {memberCount} {memberCount === 1 ? 'project' : 'projects'}</span>
            </header>
            <p className={styles.purpose}>{family.purpose}</p>
            <ul>
              <li>
                <Link to={localTarget(action.url)}>
                  <span>
                    <strong>Recommended start · {start.name}</strong>
                    <small>{action.label}<code>{displayPath(action.url)}</code></small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
              <li>
                <Link to={familyExplorePath(next.id)}>
                  <span>
                    <strong>Next · {next.label}</strong>
                    <small>{family.next.label}</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function familyExplorePath(id: string): string {
  return `/ecosystem/?family=${encodeURIComponent(id)}`;
}

function familyDocsPath(slug: string): string {
  return `/docs${slug.startsWith('/') ? slug : `/${slug}`}`;
}

function localTarget(value: string): string {
  const url = new URL(value, 'https://beyond10x.github.io');
  return url.origin === 'https://beyond10x.github.io'
    ? `${url.pathname}${url.search}${url.hash}`
    : value;
}

function displayPath(value: string): string {
  const target = localTarget(value);
  return target.startsWith('/') ? target : new URL(target).hostname;
}
