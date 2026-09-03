import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import {CardGrid, ContentCard, PageHeader, SectionHeader} from '@beyond10x/docs-system/components';
import styles from './ecosystem.module.css';

export default function Updates(): ReactNode {
  return (
    <Layout title="Updates" description="Changes, releases, and repository-owned field notes across beyond10x.">
      <main className={`container ${styles.page}`}>
        <div className={styles.hero}>
          <PageHeader
            eyebrow="Updates"
            title="Follow changes without reconstructing them from repositories."
            description="The root site publishes organization impact, release facts, and source-owned field notes from the same locked source revisions as the documentation."
          />
        </div>
        <section className={styles.updates} aria-labelledby="update-streams-title">
          <SectionHeader
            id="update-streams-title"
            title="Choose the stream that answers your question."
            description="Impact explains what changed for adopters. Releases preserve version facts. Field notes retain repository-owned observations and research."
          />
          <CardGrid columns={3} label="Public update streams">
            <ContentCard
              eyebrow="Adoption impact"
              title="What changed for me?"
              titleUrl="/changes/"
              description="Human-authored impact records across projects, with scope and source evidence."
              actionUrl="/changes/"
              actionLabel="Browse changes"
              headingLevel={2}
            />
            <ContentCard
              eyebrow="Releases"
              title="What shipped?"
              titleUrl="/releases/"
              description="Versioned release facts and feeds derived from the public change ledger."
              actionUrl="/releases/"
              actionLabel="Browse releases"
              headingLevel={2}
            />
            <ContentCard
              eyebrow="Field notes"
              title="What was observed?"
              titleUrl="/updates/field-notes/"
              description="Research notes and observations selected by their owning source repositories."
              actionUrl="/updates/field-notes/"
              actionLabel="Read field notes"
              headingLevel={2}
            />
          </CardGrid>
        </section>
        <section className={styles.updates} aria-labelledby="update-feeds-title">
          <SectionHeader id="update-feeds-title" title="Subscribe to deterministic feeds" />
          <ul>
            <li><a href="/changes/feed.json">All changes · JSON Feed</a></li>
            <li><a href="/changes/rss.xml">All changes · RSS</a></li>
            <li><a href="/releases/feed.json">Releases · JSON Feed</a></li>
            <li><a href="/updates/field-notes/feed.json">Field notes · JSON Feed</a></li>
          </ul>
        </section>
      </main>
    </Layout>
  );
}
