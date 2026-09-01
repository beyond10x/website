import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import {CardGrid, ContentCard, PageHeader, SectionHeader} from '@beyond10x/docs-system/components';
import releasesDocument from '../../.generated/data/release-facts.json';
import styles from './ecosystem.module.css';

interface ReleaseFact {repository: string; version: string; publishedAt: string; url: string}
const releases = (releasesDocument as {releases: ReleaseFact[]}).releases;

export default function Releases(): ReactNode {
  return (
    <Layout title="Releases" description="The complete public technical release stream across beyond10x.">
      <main className="container">
        <div className={styles.hero}><PageHeader
          eyebrow="Technical releases"
          title="Every published version, in one place."
          description={<>Impactful changes are explained on the <a href="/changes/">changes page</a>; this list remains complete and mechanical.</>}
        /></div>
        <section className={styles.updates}>
          <SectionHeader title="Release stream" description={`${releases.length} repository versions in the current generated snapshot.`} />
          <CardGrid>{releases.map((release) => <ContentCard
            key={`${release.repository}/${release.version}`}
            eyebrow={release.repository}
            title={release.version}
            titleUrl={release.url}
            meta={<time dateTime={release.publishedAt}>{release.publishedAt.slice(0, 10)}</time>}
            actionUrl={release.url}
            actionLabel="View release"
            headingLevel={2}
          />)}</CardGrid>
        </section>
      </main>
    </Layout>
  );
}
