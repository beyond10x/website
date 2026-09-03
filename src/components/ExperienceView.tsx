import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {
  Callout,
  FactGrid,
  PageHeader,
  SectionHeader,
} from '@beyond10x/docs-system/components';
import type {
  Access,
  AdoptionPathBlocker,
  Audience,
  EvaluatedAdoptionPath,
  EvaluatedDocumentationExperience,
  ExperienceArtifact,
  Support,
} from '@beyond10x/docs-system/types';
import evaluatedExperienceDocument from '../../.generated/data/experiences.json';
import experiencePagesDocument from '../../data/experience-pages.json';
import searchGoldenDocument from '../../data/search-golden.json';
import styles from './ExperienceView.module.css';

export type ExperienceSectionKind = 'learn' | 'do' | 'verify';

interface ExperienceStep {
  id: string;
  title: string;
  description: string;
  url: string;
  completion: string;
}

interface ExperienceSection {
  kind: ExperienceSectionKind;
  title: string;
  steps: ExperienceStep[];
}

export interface ExperienceDefinition {
  id: string;
  label: string;
  title: string;
  summary: string;
  audiences: Audience[];
  outcome: string;
  route: string;
  support: Support;
  effectiveAccess: Access;
  actionable: boolean;
  blockers: AdoptionPathBlocker[];
  artifacts: ExperienceArtifact[];
  note?: string;
  estimatedMinutes: number;
  prerequisites: string[];
  primaryPathId: string;
  adoptionPaths: EvaluatedAdoptionPath[];
  sections: ExperienceSection[];
}

interface ExperiencePageCatalog {
  schema: 'b10x-website-experience-pages/v1';
  pages: Array<{experienceId: string; adoptionPathId: string; sections: ExperienceSection[]}>;
}

interface SearchGoldenContract {
  schema: 'b10x-search-golden/v1';
  queries: Array<{query: string; expectedFirst: string}>;
}

interface EvaluatedExperienceCatalog {
  schema: 'b10x-evaluated-experiences/v1';
  experiences: EvaluatedDocumentationExperience[];
}

const pageCatalog = experiencePagesDocument as ExperiencePageCatalog;
const searchGolden = searchGoldenDocument as SearchGoldenContract;
const evaluatedCatalog = evaluatedExperienceDocument as EvaluatedExperienceCatalog;
const evaluated = new Map(evaluatedCatalog.experiences.map((experience) => [experience.id, experience]));
const definitions = pageCatalog.pages.map((page) => composeExperience(page));
const byId = new Map(definitions.map((experience) => [experience.id, experience]));
const sectionLabels: Record<ExperienceSectionKind, string> = {
  learn: 'Learn',
  do: 'Do',
  verify: 'Verify',
};

export function allExperiences(): ExperienceDefinition[] {
  return definitions;
}

export default function ExperienceView({id}: {id: string}): ReactNode {
  const experience = byId.get(id);
  if (!experience) throw new Error(`unknown documentation experience ${id}`);

  return (
    <Layout title={experience.title} description={experience.summary}>
      <main className={`container ${styles.page}`}>
        <SearchAttributes experience={experience} />
        <div className={styles.hero}>
          <PageHeader
            eyebrow={`${experience.label} · ${label(experience.support)}`}
            title={experience.title}
            description={experience.summary}
            actions={
              <Link className="button button--primary" to={experience.sections[0].steps[0].url}>
                Begin with the first step
              </Link>
            }>
            <FactGrid
              label="Experience facts"
              items={[
                {label: 'Audience', value: experience.audiences.map(label).join(' · ')},
                {label: 'Expected time', value: `About ${experience.estimatedMinutes} minutes`},
                {label: 'Access', value: `${label(experience.effectiveAccess)} · ${experience.artifacts.length} required ${experience.artifacts.length === 1 ? 'artifact' : 'artifacts'}`},
                {label: 'Finish with', value: experience.outcome},
              ]}
            />
          </PageHeader>
        </div>

        <AdoptionPathContracts experience={experience} />

        {id === 'understand-safe-agentic-coding' ? <SafeLoop /> : null}

        <nav className={styles.progress} aria-label="Experience sequence">
          {experience.sections.map((section, index) => (
            <a key={section.kind} href={`#${section.kind}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{sectionLabels[section.kind]}</strong>
            </a>
          ))}
        </nav>

        {experience.sections.map((section, sectionIndex) => (
          <section className={styles.section} id={section.kind} key={section.kind}>
            <SectionHeader
              eyebrow={`${String(sectionIndex + 1).padStart(2, '0')} · ${sectionLabels[section.kind]}`}
              title={section.title}
              description={sectionDescription(section.kind)}
            />
            <ol className={styles.steps}>
              {section.steps.map((step, stepIndex) => (
                <li key={step.id} id={step.id}>
                  <div className={styles.stepNumber} aria-hidden="true">
                    {String(stepIndex + 1).padStart(2, '0')}
                  </div>
                  <article>
                    <h3>{step.url.startsWith('#') ? <a href={step.url}>{step.title}</a> : <Link to={step.url}>{step.title}</Link>}</h3>
                    <p>{step.description}</p>
                    <div className={styles.completion}>
                      <span>Complete when</span>
                      <p>{step.completion}</p>
                    </div>
                    {step.url.startsWith('#') ? (
                      <a className={styles.stepAction} href={step.url}>Open this step <span aria-hidden="true">→</span></a>
                    ) : (
                      <Link className={styles.stepAction} to={step.url}>Open this step <span aria-hidden="true">→</span></Link>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <Callout tone="success" title="Outcome">
          <p>{experience.outcome}</p>
        </Callout>

        {experience.note ? <Callout tone="warning" title="Access boundary"><p>{experience.note}</p></Callout> : null}

        <nav className={styles.next} aria-label="Other documentation experiences">
          <p>Need another answer or a different outcome?</p>
          <div>
            <Link to={`/search/?experience=${encodeURIComponent(experience.id)}`}>Search within this path</Link>
            <Link to="/start/">Choose another path <span aria-hidden="true">→</span></Link>
          </div>
        </nav>
      </main>
    </Layout>
  );
}

function composeExperience(page: ExperiencePageCatalog['pages'][number]): ExperienceDefinition {
  const experience = evaluated.get(page.experienceId);
  if (!experience) throw new Error(`experience page references unknown catalog experience ${page.experienceId}`);
  const path = experience.adoptionPaths.find((candidate) => candidate.id === page.adoptionPathId);
  if (!path) throw new Error(`${experience.id} has no adoption path ${page.adoptionPathId}`);
  if (!path.url || !path.outcome || !path.estimatedMinutes) throw new Error(`${experience.id}/${path.id} must declare URL, outcome, and estimate`);
  const url = new URL(path.url);
  if (url.origin !== 'https://beyond10x.github.io') throw new Error(`${experience.id}/${path.id} must route through the canonical Website`);
  return {
    id: experience.id,
    label: experience.label,
    title: path.label,
    summary: experience.summary,
    audiences: experience.audiences,
    outcome: path.outcome,
    route: url.pathname,
    support: path.support,
    effectiveAccess: path.effectiveAccess,
    actionable: path.actionable,
    blockers: path.blockers,
    artifacts: path.artifacts,
    note: path.note,
    estimatedMinutes: path.estimatedMinutes,
    prerequisites: path.prerequisites ?? [],
    primaryPathId: path.id,
    adoptionPaths: experience.adoptionPaths,
    sections: page.sections,
  };
}

function AdoptionPathContracts({experience}: {experience: ExperienceDefinition}): ReactNode {
  const alternatives = experience.adoptionPaths.length > 1;
  return (
    <section className={styles.pathContracts} aria-labelledby="adoption-contract-title">
      <SectionHeader
        eyebrow="Adoption contract"
        title={alternatives ? 'Choose an available path without crossing an access boundary.' : 'Use the declared artifacts, versions, and access boundary.'}
        id="adoption-contract-title"
        description={alternatives
          ? 'These are ordered alternatives, not interchangeable promises. A blocked option stays visible so evaluation access is never mistaken for deployability.'
          : 'This contract names the artifacts behind the path so documentation alone is not mistaken for a working runtime.'}
      />
      <div className={styles.pathGrid}>
        {experience.adoptionPaths.map((path) => {
          const primary = path.id === experience.primaryPathId;
          const restricted = path.actionable && path.effectiveAccess !== 'public';
          return (
            <article className={`${styles.pathCard} ${path.actionable ? '' : styles.pathCardBlocked}`} key={path.id}>
              <div className={styles.pathHeader}>
                <div>
                  <span className={styles.pathRole}>{primary ? 'Primary path' : 'Alternative path'}</span>
                  <h3>{path.label}</h3>
                </div>
                <span className={`${styles.pathState} ${path.actionable ? restricted ? styles.pathStateRestricted : styles.pathStateAvailable : styles.pathStateBlocked}`}>
                  {path.actionable ? restricted ? 'Access required' : 'Available now' : 'Currently blocked'}
                </span>
              </div>

              <div className={styles.pathFacts} aria-label={`${path.label} status`}>
                <span>Support: {label(path.support)}</span>
                <span>Declared access: {label(path.access)}</span>
                <span>Effective access: {label(path.effectiveAccess)}</span>
              </div>

              {path.outcome ? <p className={styles.pathOutcome}>{path.outcome}</p> : null}
              {path.estimatedMinutes ? <p className={styles.pathEstimate}>Orientation time: about {path.estimatedMinutes} minutes</p> : null}

              {path.prerequisites?.length ? (
                <div className={styles.pathPrerequisites}>
                  <h4>Prerequisites</h4>
                  <ul>{path.prerequisites.map((prerequisite) => <li key={prerequisite}>{prerequisite}</li>)}</ul>
                </div>
              ) : null}

              <div className={styles.pathArtifacts}>
                <h4>Required artifacts</h4>
                <ul>
                  {path.artifacts.map((artifact) => (
                    <li key={artifact.id}>
                      <div>
                        {artifact.url ? <a href={artifact.url}>{artifactLabel(artifact.id)}</a> : <strong>{artifactLabel(artifact.id)}</strong>}
                        <span>
                          {artifact.version ? `Version ${artifact.version} · ` : ''}
                          {label(artifact.kind)} · {label(artifact.availability)} · {label(artifact.access)}
                        </span>
                      </div>
                      {artifact.note ? <p>{artifact.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>

              {!path.actionable ? (
                <div className={styles.pathBlocker}>
                  <strong>Why this cannot be started</strong>
                  {path.explanation ? <p>{path.explanation}</p> : null}
                  {path.note ? <p>{path.note}</p> : null}
                  {path.url ? <Link to={path.url}>Review operator documentation — this does not grant artifact access</Link> : null}
                </div>
              ) : path.note ? <p className={styles.pathNote}>{path.note}</p> : null}

              {path.actionable && !primary && path.url ? <Link className={styles.pathLink} to={path.url}>{restricted ? 'Review access requirements' : 'Open this available path'} <span aria-hidden="true">→</span></Link> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SearchAttributes({experience}: {experience: ExperienceDefinition}): ReactNode {
  return (
    <div className={styles.searchAttributes}>
      <span data-pagefind-meta="qualified_title">{experience.title} | beyond10x</span>
      <span data-pagefind-meta="experience">{experience.id}</span>
      <span data-pagefind-meta="document_type">experience</span>
      <span data-pagefind-filter="experience">{experience.id}</span>
      <span data-pagefind-filter="document_type">experience</span>
      {experience.audiences.map((audience) => (
        <span key={audience} data-pagefind-filter="audience">{audience}</span>
      ))}
      {searchGolden.queries
        .filter((entry) => entry.expectedFirst === experience.route)
        .map((entry) => <span key={entry.query} data-pagefind-meta="search_priority" data-pagefind-weight="10">{entry.query}</span>)}
    </div>
  );
}

function SafeLoop(): ReactNode {
  const boundaries = [
    ['Intent', 'State the outcome, constraints, and evidence before asking for implementation.'],
    ['Specification', 'Turn important system behavior into input another tool can validate and regenerate.'],
    ['Execution', 'Give the agent only the tools, budget, and effect boundary this task needs.'],
    ['Review', 'Require an independent check before consequential state changes become accepted.'],
    ['Evidence', 'Retain test results, generated artifacts, decisions, and refusals—not only prose.'],
  ];
  return (
    <section className={styles.loop} id="safe-loop" aria-labelledby="safe-loop-title">
      <SectionHeader
        eyebrow="The practical model"
        title="A safe loop makes five boundaries visible."
        id="safe-loop-title"
        description="The model may reason inside each step. It should not silently own the rules that permit the next step."
      />
      <ol>
        {boundaries.map(([title, description], index) => (
          <li key={title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div><strong>{title}</strong><p>{description}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function sectionDescription(kind: ExperienceSectionKind): string {
  if (kind === 'learn') return 'Understand the boundary and prerequisites before running commands.';
  if (kind === 'do') return 'Follow the technical instructions in the repository that owns them.';
  return 'Check an observable outcome before treating the experience as complete.';
}

function label(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function artifactLabel(id: string): string {
  const acronyms = new Map([
    ['aep', 'AEP'],
    ['cli', 'CLI'],
    ['ess', 'ESS'],
  ]);
  return id.split('-').map((part) => acronyms.get(part) ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
