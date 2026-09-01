import type {ReactNode} from 'react';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import {DependencyGraph} from '@beyond10x/docs-system/components';
import graphDocument from '../../.generated/data/dependencies.json';

interface GraphDocument {
  schema: 'b10x-public-dependency-graph/v1';
  nodes: Array<{id: string; label: string}>;
  edges: Array<{from: string; to: string; label?: string}>;
}
const graph = graphDocument as GraphDocument;

export default function Architecture(): ReactNode {
  return (
    <Layout title="Architecture" description="Repository-owned public relationships across beyond10x.">
      <main className="container margin-vert--xl">
        <p className="b10x-eyebrow">PUBLIC ARCHITECTURE</p>
        <Heading as="h1">Follow declared relationships, not an invented stack.</Heading>
        <p>This view is derived from repository-owned documentation manifests at the revisions in the source lock. An arrow states its relationship explicitly; the reading journeys do not imply dependencies.</p>
        <DependencyGraph nodes={graph.nodes} edges={graph.edges} title="Public repository relationships" description="Provider and consumer relationships declared by owning repositories." />
        <p><a href="/dependencies.json">Download the deterministic graph projection</a>.</p>
      </main>
    </Layout>
  );
}
