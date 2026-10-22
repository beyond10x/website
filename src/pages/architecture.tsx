import type {ReactNode} from 'react';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {Diagram, DependencyGraph, PageHeader, ScrollableTable, SectionHeader} from '@beyond10x/docs-system/components';
import {publishedHref} from '@site/src/lib/published';
import graphDocument from '../../.generated/data/dependencies.json';

interface GraphDocument {
  schema: 'b10x-public-dependency-graph/v1';
  nodes: Array<{id: string; label: string}>;
  edges: Array<{from: string; to: string; label?: string}>;
}
const graph = graphDocument as GraphDocument;

interface Component {
  name: string;
  repository: string;
  docs?: string;
}
interface Term {
  term: string;
  layer: string;
  meaning: string;
  components: Component[];
}

const terms: Term[] = [
  {term: 'Model call', layer: 'L0', meaning: 'One turn in, one turn out: messages and tools in; text, tool calls and usage out. Owns provider wires, credentials, routes and cost.', components: [
    {name: 'llm', repository: 'llm', docs: '/llm/'},
    {name: 'inference', repository: 'inference'},
    {name: 'llm-gateway', repository: 'llm-gateway'},
  ]},
  {term: 'Harness', layer: 'L1', meaning: 'The agent loop: turns, prompt assembly, tool round trips, compaction, session and transcript, budgets. Claude Code and Codex are vendor harnesses; tools holds the tool contracts.', components: [
    {name: 'harness', repository: 'harness', docs: publishedHref('/docs/harness/')},
    {name: 'tools', repository: 'tools'},
  ]},
  {term: 'Meta-harness', layer: 'L2', meaning: 'Starts any harness behind one event stream and one command set, allows, denies or rewrites each tool call, and records every session as trace-ir/1.', components: [
    {name: 'metaharness', repository: 'metaharness', docs: '/metaharness/'},
  ]},
  {term: 'Governed runtime', layer: 'L3', meaning: 'Opens a case on a protocol and lets a model act only through the actions the case admits at that moment. Calls llm for its own short decisions and metaharness for agent work.', components: [
    {name: 'Loom', repository: 'loom'},
  ]},
  {term: 'Application', layer: 'above L3', meaning: 'An end-to-end use of the stack, built on loom-sdk. takt delivers stories and counts nothing done until a validator records the evidence; it manages agents and is not one.', components: [
    {name: 'takt', repository: 'takt'},
    {name: 'swarm', repository: 'swarm'},
  ]},
  {term: 'Conductor', layer: 'operator tooling', meaning: 'Coordinates Claude Code sessions across the repositories of one organization: one session tracks every repository and starts one controller session per repository.', components: [
    {name: 'conductor', repository: 'conductor'},
  ]},
  {term: 'Control plane', layer: 'paused', meaning: 'A local workspace service: add repositories, set a goal, follow its plan, implementation assignments and verified merge receipts. Paused; it is not part of the stack above.', components: [
    {name: 'control-plane', repository: 'control-plane'},
  ]},
];

function ComponentLinks({components}: {components: Component[]}): ReactNode {
  return components.map((component, index) => <span key={component.repository}>
    {index > 0 ? ', ' : ''}
    {component.docs ? <>
      <a href={component.docs}>{component.name}</a>
      {' '}(<a href={`https://github.com/beyond10x/${component.repository}`}>GitHub</a>)
    </> : <code>{component.name}</code>}
  </span>);
}

export default function Architecture(): ReactNode {
  const layers = useBaseUrl('/img/agent-stack/layers.svg');
  const dependencies = useBaseUrl('/img/agent-stack/dependencies.svg');
  return (
    <Layout title="Architecture" description="Repository-owned public relationships across beyond10x, and the layers of the agent stack.">
      <main className="container margin-vert--xl">
        <PageHeader
          eyebrow="Public architecture"
          title="Follow declared relationships, not an invented stack."
          description="This view is derived from repository-owned documentation manifests at the revisions in the source lock. An arrow states its relationship explicitly; the reading journeys do not imply dependencies."
        />
        <DependencyGraph nodes={graph.nodes} edges={graph.edges} minWidth="112rem" title="Public repository relationships" description="Provider and consumer relationships declared by owning repositories. Focus the visual to pan at full size, or open its complete text alternative." />
        <p><a href="/dependencies.json">Download the deterministic graph projection</a>.</p>

        <section id="agent-stack" className="margin-top--xl">
          <SectionHeader
            id="agent-stack-heading"
            eyebrow="Agent stack"
            title="One owner per layer"
            description="Six layers from applications down to model providers. A layer depends only on the layers below it. Recorded in the organization's architecture decisions 0096 to 0101, 2026-10-20."
          />
          <Diagram kind="svg" src={layers} download={layers} minWidth="78rem" title="The agent stack: one owner per layer" description="Six layers from applications down to model providers, with each layer's responsibilities and the repositories and libraries that own it." alternative={{label: 'Layers as text', content: <p>Applications (takt, b10x-loom, swarm) build on loom-sdk. L3, the governed runtime, is Loom. L2, the harness interface, is metaharness. L1 is harness, Claude Code and Codex, with tools. L0, the model call, is llm and inference. Providers (Anthropic, OpenAI, self-hosted through llm-gateway) are outside beyond10x.</p>}} />
          <Diagram kind="svg" src={dependencies} download={dependencies} minWidth="78rem" title="How a request travels through the agent stack" description="From the operator through takt and Loom, then either straight to llm for Loom's own decisions or through metaharness to harness, Claude Code or Codex, down to the model providers." alternative={{label: 'Request path as text', content: <p>The operator gives takt an intent or a story. takt opens a case in Loom through loom-sdk. Loom calls llm directly for short decisions (classify, select, fill arguments) and runs agent work as a session through metaharness, which drives harness, Claude Code or Codex. Those call llm, which calls the provider. Commission in Loom applies the proposed change.</p>}} />

          <SectionHeader headingLevel={3} id="agent-stack-terms" title="Definitions" description="Each term, the layer it names, and the repositories that own it." />
          <ScrollableTable label="Agent stack definitions">
            <thead>
              <tr><th>Term</th><th>Layer</th><th>What it does</th><th>Owned by</th></tr>
            </thead>
            <tbody>
              {terms.map((row) => <tr key={row.term}>
                <td>{row.term}</td>
                <td>{row.layer}</td>
                <td>{row.meaning}</td>
                <td><ComponentLinks components={row.components} /></td>
              </tr>)}
            </tbody>
          </ScrollableTable>
        </section>
      </main>
    </Layout>
  );
}
