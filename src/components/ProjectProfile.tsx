import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import {AdoptionCard, CardGrid, ContentCard, FactGrid, SectionHeader, StatusBadge} from '@beyond10x/docs-system/components';
import type {Journey, RegistrySurface, ReleaseFact, ReleaseFactsDocument, SurfaceLink, SurfaceRelationship} from '@beyond10x/docs-system/types';
import registryDocument from '../../.generated/data/ecosystem.json';
import releaseFactsDocument from '../../.generated/data/release-facts.json';
import styles from './ProjectProfile.module.css';

const surfaces = (registryDocument as {surfaces: RegistrySurface[]}).surfaces;
const releases = (releaseFactsDocument as ReleaseFactsDocument).releases;

interface RelationshipView extends Omit<SurfaceRelationship, 'target'> {
  source: RegistrySurface;
  targetKey: string;
  targetSurface?: RegistrySurface;
}

export default function ProjectProfile({repository, revision}: {repository: string; revision: string}): ReactNode {
  const owned = surfaces.filter((surface) => surface.repository.id === repository);
  if (!owned.length) throw new Error(`project profile ${repository} is absent from the public registry`);
  const primary = owned.find((surface) => surface.id === 'docs') ?? owned[0];
  const ownedKeys = new Set(owned.map((surface) => surface.key));
  const byKey = new Map(surfaces.map((surface) => [surface.key, surface]));
  const outgoing = owned.flatMap((source) => (source.relationships ?? []).filter(isPresentedRelationship).map((relationship) => ({kind: relationship.kind, label: relationship.label, source, targetKey: relationship.target, targetSurface: byKey.get(relationship.target)})));
  const incoming = surfaces.flatMap((source) => (source.relationships ?? [])
    .filter((relationship) => ownedKeys.has(relationship.target) && isPresentedRelationship(relationship))
    .map((relationship) => ({kind: relationship.kind, label: relationship.label, source, targetKey: relationship.target, targetSurface: byKey.get(relationship.target)})));
  const latestRelease = latestReleaseFor(repository);
  const references = collectReferences(owned);

  return <>
    <section className={styles.intro} aria-label={`${primary.name} public status`}>
      <div className={styles.status}><StatusBadge maturity={primary.maturity} /><span>{primary.kind}</span><span>{primary.availability}</span></div>
      <p>{primary.summary}</p>
      <FactGrid items={[
        {label: 'Locked revision', value: /^[0-9a-f]{40}$/.test(revision) ? <Link to={`${primary.repository.url}/tree/${revision}`} aria-label={`View locked revision ${revision} on GitHub`} title={revision}><code>{revision.slice(0, 12)}</code></Link> : 'Local preview'},
        {label: 'Latest release', value: latestRelease ? <Link to={latestRelease.url}>{latestRelease.version}</Link> : 'Not recorded', detail: latestRelease ? <time dateTime={latestRelease.publishedAt}>{formatDate(latestRelease.publishedAt)}</time> : 'No release exists in the current snapshot'},
        {label: 'Primary outcome', value: primaryJourneyOf(primary) ? <Link to={experienceRouteForJourney(primaryJourneyOf(primary) ?? '')}>{label(primaryJourneyOf(primary) ?? '')}</Link> : 'Not declared'},
        {label: 'Audience', value: (primary.audiences ?? []).map(label).join(', ') || 'Not declared'},
      ]} />
    </section>

    <section className={styles.section} aria-labelledby="profile-start">
      <SectionHeader eyebrow="Recommended start" title="Begin with the repository-owned adoption path." id="profile-start" />
      <CardGrid>{owned.map((surface) => <div className={styles.adoptionItem} key={surface.key}>
        <AdoptionCard surface={surface} journey={primaryJourneyOf(surface)} />
        <p className={styles.audience}><span className={styles.label}>Audience </span>{(surface.audiences ?? []).map(label).join(', ') || 'not declared'}</p>
      </div>)}</CardGrid>
    </section>

    <section className={styles.section} aria-labelledby="profile-references">
      <SectionHeader eyebrow="Public surface" title="Continue into declared documentation and machine interfaces." id="profile-references" />
      <CardGrid columns={3}>
        <ReferenceGroup title="Sections" items={references.sections} empty="No additional sections are declared." />
        <ReferenceGroup title="APIs and schemas" items={references.specifications} empty="No machine specification is declared." />
        <ReferenceGroup title="Feeds" items={references.feeds} empty="No repository feed is declared." />
      </CardGrid>
    </section>

    <section className={styles.section} aria-labelledby="profile-relationships">
      <SectionHeader eyebrow="Declared relationships" title="See what this project points to—and what points here." id="profile-relationships" />
      <CardGrid columns={2}>
        <RelationshipGroup title="Outgoing" relationships={outgoing} direction="outgoing" />
        <RelationshipGroup title="Incoming" relationships={incoming} direction="incoming" />
      </CardGrid>
    </section>
  </>;
}

function ReferenceGroup({title, items, empty}: {title: string; items: Array<{key: string; label: string; url: string; detail?: string; external?: boolean}>; empty: string}): ReactNode {
  return <ContentCard title={title}>{items.length ? <ul>{items.map((item) => <li key={item.key}>{item.external ? <a href={item.url}>{item.label}</a> : <Link to={localTarget(item.url)}>{item.label}</Link>}{item.detail ? <small>{item.detail}</small> : null}</li>)}</ul> : <p className={styles.empty}>{empty}</p>}</ContentCard>;
}

function experienceRouteForJourney(journey: string): string {
  if (journey === 'understand') return '/learn/safe-agentic-coding/';
  if (journey === 'plan-work' || journey === 'specify') return '/start/spec-driven-development/';
  if (journey === 'build-agents') return '/build/agent-systems/';
  return '/operate/';
}

function RelationshipGroup({title, relationships, direction}: {title: string; relationships: RelationshipView[]; direction: 'incoming' | 'outgoing'}): ReactNode {
  return <ContentCard title={title}>{relationships.length ? <ul>{relationships.map((relationship, index) => {
    const peer = direction === 'outgoing' ? relationship.targetSurface : relationship.source;
    const peerName = peer?.name ?? relationship.targetKey;
    const peerRepository = peer?.repository.id;
    return <li key={`${relationship.source.key}-${relationship.targetKey}-${relationship.kind}-${index}`}>
      {direction === 'outgoing' ? <><strong>{label(relationship.kind)}</strong> {peerRepository ? <Link to={`/ecosystem/${peerRepository}/`}>{peerName}</Link> : peerName}</> : <>{peerRepository ? <Link to={`/ecosystem/${peerRepository}/`}>{peerName}</Link> : peerName} <strong>{label(relationship.kind)}</strong> this project</>}
      {relationship.label ? <small>{relationship.label}</small> : null}
    </li>;
  })}</ul> : <p className={styles.empty}>No {direction} public relationships are declared.</p>}</ContentCard>;
}

function collectReferences(owned: RegistrySurface[]) {
  const sections = unique(owned.flatMap((surface) => surface.sections ?? []).map((section: SurfaceLink) => ({
    key: `${section.url}-${section.label}`,
    label: section.label,
    url: section.url,
    detail: section.kind ? label(section.kind) : undefined,
  })));
  const specifications = unique(owned.flatMap((surface) => 'source' in surface ? surface.source.specifications ?? [] : []).map((specification) => ({
    key: specification.route,
    label: specification.title ?? specification.id,
    url: specification.route,
    detail: specification.format === 'openapi' ? 'OpenAPI' : 'JSON Schema',
  })));
  const feeds = unique(owned.flatMap((surface) => surface.feeds ?? []).map((feed) => ({
    key: `${feed.url}-${feed.label}`,
    label: feed.label,
    url: feed.url,
    external: true,
    detail: 'format' in feed ? `${label(feed.format)} · ${feed.scope}` : undefined,
  })));
  return {sections, specifications, feeds};
}

function unique<T extends {key: string}>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.key, item])).values()];
}

function latestReleaseFor(repository: string): ReleaseFact | undefined {
  return releases.filter((release) => release.repository === repository)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.version.localeCompare(right.version))[0];
}

function primaryJourneyOf(surface: RegistrySurface): Journey | undefined {
  return 'primaryJourney' in surface ? surface.primaryJourney : undefined;
}

function isPresentedRelationship(relationship: SurfaceRelationship): boolean {
  return relationship.kind !== ('documentation-source' as SurfaceRelationship['kind'])
    && !(relationship.kind === 'supports' && relationship.target === 'website/docs');
}

function localTarget(value: string): string {
  const url = new URL(value, 'https://beyond10x.github.io');
  return url.origin === 'https://beyond10x.github.io' ? `${url.pathname}${url.search}${url.hash}` : value;
}

function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en', {dateStyle: 'medium', timeZone: 'UTC'});
}
