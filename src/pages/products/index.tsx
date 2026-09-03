import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {CardGrid, ContentCard, PageHeader, SectionHeader} from '@beyond10x/docs-system/components';
import styles from '../ecosystem.module.css';

const destinations = [
  {
    eyebrow: 'Evaluate',
    title: 'Evaluate beyond10x products honestly',
    description: 'Review public evidence, maturity, and access boundaries before investing in deployment work.',
    url: '/products/evaluate/',
  },
  {
    eyebrow: 'Operate',
    title: 'Deploy an available service',
    description: 'Enter through the operations path when you already own service or cluster responsibilities.',
    url: '/operate/',
  },
  {
    eyebrow: 'Current product',
    title: 'Inspect the Devcenter profile',
    description: 'Separate Devcenter’s proposition and public evaluation material from artifacts that remain access-gated.',
    url: '/ecosystem/devcenter/',
  },
  {
    eyebrow: 'Reference',
    title: 'Browse the public Products family',
    description: 'Use the generated project map when you need repository, relationship, or maturity facts.',
    url: '/ecosystem/?family=Products',
  },
];

export default function Products(): ReactNode {
  return (
    <Layout title="Products" description="Evaluate beyond10x products and find operations guidance without confusing the two audiences.">
      <main className={`container ${styles.page}`}>
        <div className="b10x-search-attributes" data-pagefind-ignore>
          <span data-pagefind-meta="qualified_title">Products | beyond10x</span>
          <span data-pagefind-meta="description">Evaluate beyond10x products and find operations guidance without confusing the two audiences.</span>
          <span data-pagefind-filter="audience">evaluator</span>
          <span data-pagefind-filter="document_type">landing</span>
        </div>
        <div className={styles.hero}>
          <PageHeader
            eyebrow="Products"
            title="Evaluate first. Plan deployment only when access is real."
            description="Product evaluation and platform operations are different jobs. Begin with public evidence, then move to deployment guidance only for artifacts you can actually obtain."
            actions={<Link className="button button--primary" to="/products/evaluate/">Open the evaluator path</Link>}
          />
        </div>
        <section className={styles.updates} aria-labelledby="product-destinations">
          <SectionHeader id="product-destinations" title="Product destinations" description="The product surface stays access-honest and does not turn source visibility into a deployment promise." />
          <CardGrid columns={2} label="Product destinations">
            {destinations.map((destination) => <ContentCard
              key={destination.url}
              eyebrow={destination.eyebrow}
              title={destination.title}
              titleUrl={destination.url}
              description={destination.description}
              actionUrl={destination.url}
              actionLabel="Open product route"
              headingLevel={2}
            />)}
          </CardGrid>
        </section>
      </main>
    </Layout>
  );
}
