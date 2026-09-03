import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {CardGrid, ContentCard, PageHeader, SectionHeader} from '@beyond10x/docs-system/components';
import styles from '../ecosystem.module.css';

const destinations = [
  {
    eyebrow: 'Recommended start',
    title: 'Understand safe autonomous coding',
    description: 'Learn the intent, authority, execution, review, and evidence boundaries before adopting a tool.',
    url: '/learn/safe-agentic-coding/',
  },
  {
    eyebrow: 'System model',
    title: 'See how the pieces fit together',
    description: 'Follow the concept-first architecture narrative from principles through specifications, runtimes, and services.',
    url: '/learn/from-principle-to-action/',
  },
  {
    eyebrow: 'Source-owned research',
    title: 'Read the Agentic Principles corpus',
    description: 'Inspect the observations, research notes, and principles that ground the operating model.',
    url: '/docs/agentic-principles/',
  },
  {
    eyebrow: 'Keep learning',
    title: 'Browse changes and field notes',
    description: 'Follow adopter-impact updates, releases, and repository-owned field notes without mixing them into onboarding.',
    url: '/updates/',
  },
];

export default function Learn(): ReactNode {
  return (
    <Layout title="Learn safe agentic coding" description="Understand the beyond10x operating model before choosing implementation detail.">
      <main className={`container ${styles.page}`}>
        <div className="b10x-search-attributes" data-pagefind-ignore>
          <span data-pagefind-meta="qualified_title">Learn safe agentic coding | beyond10x</span>
          <span data-pagefind-meta="description">Understand the beyond10x operating model before choosing implementation detail.</span>
          <span data-pagefind-filter="audience">developer</span>
          <span data-pagefind-filter="audience">evaluator</span>
          <span data-pagefind-filter="audience">researcher</span>
          <span data-pagefind-filter="document_type">landing</span>
        </div>
        <div className={styles.hero}>
          <PageHeader
            eyebrow="Learn"
            title="Understand the model before choosing the machinery."
            description="Start with the safety boundaries and mental model. Repository references remain available when you need to trace a claim to its owner."
            actions={<Link className="button button--primary" to="/learn/safe-agentic-coding/">Learn the safe loop</Link>}
          />
        </div>
        <section className={styles.updates} aria-labelledby="learn-destinations">
          <SectionHeader id="learn-destinations" title="Choose the depth you need" description="These routes explain why the system is shaped this way; they do not pretend that every reader is deploying a platform." />
          <CardGrid columns={2} label="Learning destinations">
            {destinations.map((destination) => <ContentCard
              key={destination.url}
              eyebrow={destination.eyebrow}
              title={destination.title}
              titleUrl={destination.url}
              description={destination.description}
              actionUrl={destination.url}
              actionLabel="Open learning route"
              headingLevel={2}
            />)}
          </CardGrid>
        </section>
      </main>
    </Layout>
  );
}
