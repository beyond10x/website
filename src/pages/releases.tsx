import type {ReactNode} from 'react';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import releasesDocument from '../../.generated/data/release-facts.json';
import styles from './ecosystem.module.css';

interface ReleaseFact {repository: string; version: string; publishedAt: string; url: string}
const releases = (releasesDocument as {releases: ReleaseFact[]}).releases;

export default function Releases(): ReactNode {
  return (
    <Layout title="Releases" description="The complete public technical release stream across beyond10x.">
      <main className="container">
        <header className={styles.hero}>
          <p className="b10x-eyebrow">TECHNICAL RELEASES</p>
          <Heading as="h1">Every published version, in one place.</Heading>
          <p>Impactful changes are explained on the <a href="/changes/">changes page</a>; this list remains complete and mechanical.</p>
        </header>
        <section className={styles.updates}>
          {releases.map((release) => (
            <article key={`${release.repository}/${release.version}`}>
              <Heading as="h2"><a href={release.url}>{release.repository} {release.version}</a></Heading>
              <time dateTime={release.publishedAt}>{release.publishedAt.slice(0, 10)}</time>
            </article>
          ))}
        </section>
      </main>
    </Layout>
  );
}
