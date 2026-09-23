import type {ReactNode} from 'react';
import Link from '@site/src/lib/PublishedLink';
import Layout from '@theme/Layout';
import {ContentCard, CardGrid, PageHeader, SectionHeader} from '@beyond10x/docs-system/components';
import {allExperiences} from '../../components/ExperienceView';
import {journeyById} from '../../../data/journeys.mjs';
import styles from '../ecosystem.module.css';

const hubSections = [
  {label: 'Learn', description: 'Concept-first mental model, without repository or tooling detail.', route: journeyById('learn').hubRoute},
  {label: 'Build', description: 'Agent-system construction: Harness, Substrate, and evaluation.', route: journeyById('build').hubRoute},
  {label: 'Products', description: 'Evaluate a beyond10x product before planning adoption.', route: journeyById('products').hubRoute},
];

export default function Start(): ReactNode {
  const experiences = allExperiences();
  return (
    <Layout title="Choose a documentation path" description="Start from the outcome you need, not the repository map.">
      <main className={`container ${styles.page}`}>
        <div className={styles.hero}>
          <PageHeader
            eyebrow="Start"
            title="Choose the outcome you need."
            description="Each path has an audience, a realistic finish line, and ordered learn, do, and verify steps. Technical instructions stay with the repository that owns them."
            actions={<Link className="button button--primary" to={journeyById('start').experienceRoute}>Open the practitioner planning path</Link>}
          />
        </div>
        <section className={styles.updates} aria-labelledby="paths-title">
          <SectionHeader id="paths-title" title="Six paths, one canonical documentation site" description="The first path is the recommended entry for an individual developer. The others stay available when your actual job is evaluation, agent-system construction, operations, or maintenance." />
          <CardGrid columns={2} label="Documentation experiences">
            {experiences.map((experience, index) => (
              <ContentCard
                key={experience.id}
                eyebrow={index === 0 ? 'Recommended first path' : experience.label}
                title={experience.title}
                titleUrl={experience.route}
                description={experience.summary}
                meta={`${displayStatus(experience.support)} · About ${experience.estimatedMinutes} min · ${experience.audiences.join(' · ')}`}
                actionUrl={experience.route}
                actionLabel="Open path"
                headingLevel={2}
              />
            ))}
          </CardGrid>
        </section>
        <section className={styles.updates} aria-labelledby="hubs-title">
          <SectionHeader id="hubs-title" title="Browse by section instead" description="Each outcome above also has its own section index, with further destinations beyond the single recommended path." />
          <CardGrid columns={2} label="Section indexes">
            {hubSections.map((hub) => (
              <ContentCard
                key={hub.route}
                eyebrow="Section"
                title={hub.label}
                titleUrl={hub.route}
                description={hub.description}
                actionUrl={hub.route}
                actionLabel="Open section"
                headingLevel={2}
              />
            ))}
          </CardGrid>
        </section>
      </main>
    </Layout>
  );
}

function displayStatus(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
