import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {CardGrid, ContentCard, PageHeader, SectionHeader} from '@beyond10x/docs-system/components';
import styles from '../ecosystem.module.css';

const destinations = [
  {
    eyebrow: 'Recommended path',
    title: 'Build an observable agent system',
    description: 'Move from host guidance to bounded execution, effects, and evaluation with an explicit finish line.',
    url: '/build/agent-systems/',
  },
  {
    eyebrow: 'First governed change',
    title: 'Start smaller with Claude',
    description: 'Use focused Agent Plugins and an inspectable specification before introducing agent infrastructure.',
    url: '/start/spec-driven-development/',
  },
  {
    eyebrow: 'Host instructions',
    title: 'Install Agent Plugins',
    description: 'Add focused beyond10x guidance to Claude and choose only the plugin needed for the current decision.',
    url: '/docs/agentplugins/install/',
  },
  {
    eyebrow: 'Agent loop',
    title: 'Build with Harness',
    description: 'Use the source-owned Harness guide for observable sessions, explicit tools, approvals, and evidence.',
    url: '/docs/harness/',
  },
  {
    eyebrow: 'Docs as spec',
    title: 'Generate documentation with ESS',
    description: 'Model important system behavior as validated input, then generate deterministic human documentation and contracts.',
    url: '/docs/ess/',
  },
];

export default function Build(): ReactNode {
  return (
    <Layout title="Build agent systems" description="Choose the smallest beyond10x building path that matches the system boundary you own.">
      <main className={`container ${styles.page}`}>
        <div className="b10x-search-attributes" data-pagefind-ignore>
          <span data-pagefind-meta="qualified_title">Build agent systems | beyond10x</span>
          <span data-pagefind-meta="description">Choose the smallest beyond10x building path that matches the system boundary you own.</span>
          <span data-pagefind-filter="audience">developer</span>
          <span data-pagefind-filter="document_type">landing</span>
        </div>
        <div className={styles.hero}>
          <PageHeader
            eyebrow="Build"
            title="Choose the smallest boundary that can prove the result."
            description="Start with a governed change when that is enough. Introduce Harness, specifications, and runtime components only when the system needs those boundaries."
            actions={<Link className="button button--primary" to="/build/agent-systems/">Open the builder path</Link>}
          />
        </div>
        <section className={styles.updates} aria-labelledby="build-destinations">
          <SectionHeader id="build-destinations" title="Builder destinations" description="Each route keeps conceptual orientation separate from the technical instructions owned by its repository." />
          <CardGrid columns={2} label="Builder destinations">
            {destinations.map((destination) => <ContentCard
              key={destination.url}
              eyebrow={destination.eyebrow}
              title={destination.title}
              titleUrl={destination.url}
              description={destination.description}
              actionUrl={destination.url}
              actionLabel="Open builder route"
              headingLevel={2}
            />)}
          </CardGrid>
        </section>
      </main>
    </Layout>
  );
}
