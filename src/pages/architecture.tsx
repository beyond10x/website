import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import {DependencyGraph, PageHeader} from '@beyond10x/docs-system/components';
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
        <PageHeader
          eyebrow="Public architecture"
          title="Follow declared relationships, not an invented stack."
          description="This view is derived from repository-owned documentation manifests at the revisions in the source lock. An arrow states its relationship explicitly; the reading journeys do not imply dependencies."
        />
        <DependencyGraph nodes={graph.nodes} edges={graph.edges} minWidth="112rem" title="Public repository relationships" description="Provider and consumer relationships declared by owning repositories. Focus the visual to pan at full size, or open its complete text alternative." />
        <p><a href="/dependencies.json">Download the deterministic graph projection</a>.</p>
      </main>
    </Layout>
  );
}
