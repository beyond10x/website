import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './start.module.css';

const loop = [
  ['01', 'Understand', 'Make the outcome, limits, and authority visible before the model starts.'],
  ['02', 'Instruct', 'Give Claude focused Agent Plugins instead of one giant prompt.'],
  ['03', 'Specify', 'Use ESS when system behavior should validate and generate deterministic docs or contracts.'],
  ['04', 'Plan', 'Decompose and scope the work, then retain critic verdicts and unresolved decisions.'],
  ['05', 'Verify', 'Keep the validated model, generated docs, plan artifacts, blockers, and refusals inspectable.'],
];

const gateways = [
  {
    eyebrow: 'Build',
    title: 'Build observable agent systems',
    description: 'Move from host guidance to Harness, Substrate, and outside-in evaluation only when the work needs them.',
    url: '/build/agent-systems/',
  },
  {
    eyebrow: 'Evaluate',
    title: 'Evaluate a beyond10x product',
    description: 'See what is public, what is preview, and what remains access-gated before planning adoption.',
    url: '/products/evaluate/',
  },
  {
    eyebrow: 'Operate',
    title: 'Deploy an available service',
    description: 'Go directly to service and platform operations without putting cluster detail in the beginner path.',
    url: '/operate/',
  },
  {
    eyebrow: 'Contribute',
    title: 'Maintain the documentation system',
    description: 'Change technical truth in its owning repository and preview it through the canonical Website shell.',
    url: '/contribute/',
  },
];

export default function Home(): ReactNode {
  return (
    <Layout
      title="Safe autonomous coding, from intent to evidence"
      description="Learn agentic coding and turn one feature idea into a governed, spec-driven plan with Claude and beyond10x tools.">
      <main>
        <div className={styles.searchAttributes} aria-hidden="true" data-pagefind-ignore>
          <span data-pagefind-meta="qualified_title">Safe autonomous coding | beyond10x</span>
          <span data-pagefind-meta="description">Learn agentic coding and turn one feature idea into a governed, spec-driven plan with Claude and beyond10x tools.</span>
          <span data-pagefind-filter="experience">try-spec-driven-development</span>
          <span data-pagefind-filter="audience">developer</span>
          <span data-pagefind-filter="audience">adopter</span>
          <span data-pagefind-filter="document_type">landing</span>
        </div>
        <header className={styles.hero}>
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>SAFE AUTONOMOUS CODING</p>
              <Heading as="h1">Plan with agents without hiding the decisions.</Heading>
              <p className={styles.lede}>
                Start with one small feature idea in Claude. Keep intent explicit, give the agent
                focused instructions, validate the system model, generate documentation from it,
                and finish with a scoped, critic-reviewed plan and visible blockers.
              </p>
              <div className={styles.actions}>
                <Link className={styles.primaryAction} to="/start/spec-driven-development/">
                  Plan a governed change with Claude <span aria-hidden="true">→</span>
                </Link>
                <Link className={styles.secondaryAction} to="/learn/safe-agentic-coding/">
                  Learn safe agentic coding
                </Link>
              </div>
              <p className={styles.prerequisite}>
                Designed for developers with a Git repository, Claude Code, and the pinned AEP and
                ESS binaries. The published eight-step golden path ends with one story still active;
                its optional <code>aep drive</code> follow-on is experimental and does not complete implementation.
              </p>
            </div>
            <aside className={styles.promise} aria-label="What the governed path keeps visible">
              <p>THE WORK STAYS INSPECTABLE</p>
              <dl>
                <div><dt>Intent</dt><dd>specified</dd></div>
                <div><dt>Authority</dt><dd>bounded</dd></div>
                <div><dt>Scope</dt><dd>reviewed</dd></div>
                <div><dt>Evidence</dt><dd>retained</dd></div>
              </dl>
            </aside>
          </div>
        </header>

        <section className={styles.loop} aria-labelledby="loop-title">
          <div className="container">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>ONE PRACTICAL LOOP</p>
                <Heading as="h2" id="loop-title">From a feature idea to a verifiable plan.</Heading>
              </div>
              <p>
                The first path is organized around what you are trying to accomplish—not around
                which repository happens to implement each boundary.
              </p>
            </div>
            <ol className={styles.loopGrid}>
              {loop.map(([number, title, description]) => (
                <li key={number}>
                  <span>{number}</span>
                  <Heading as="h3">{title}</Heading>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
            <Link className={styles.inlineAction} to="/start/spec-driven-development/">
              Follow the complete learn → do → verify path <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className={styles.gateway} aria-labelledby="gateway-title">
          <div className="container">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>OTHER OUTCOMES</p>
                <Heading as="h2" id="gateway-title">Go deeper when the work calls for it.</Heading>
              </div>
              <p>
                Product deployment, agent infrastructure, and repository reference remain
                available without competing with a first practitioner experience.
              </p>
            </div>
            <div className={styles.gatewayGrid}>
              {gateways.map((gateway) => (
                <article key={gateway.eyebrow}>
                  <span>{gateway.eyebrow}</span>
                  <Heading as="h3"><Link to={gateway.url}>{gateway.title}</Link></Heading>
                  <p>{gateway.description}</p>
                  <Link to={gateway.url}>Open this path <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.reference} aria-labelledby="reference-title">
          <div className={`container ${styles.referenceInner}`}>
            <div>
              <p className={styles.eyebrow}>REFERENCE</p>
              <Heading as="h2" id="reference-title">Already know what you need?</Heading>
              <p>Browse source-locked technical documentation or inspect the complete project map.</p>
            </div>
            <div className={styles.referenceActions}>
              <Link className={styles.primaryAction} to="/docs/">Open technical documentation</Link>
              <Link className={styles.secondaryLightAction} to="/ecosystem/">Explore every project</Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
