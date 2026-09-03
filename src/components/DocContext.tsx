import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import experiencePagesDocument from '../../data/experience-pages.json';
import styles from './DocContext.module.css';

type ExperiencePage = {
  experienceId: string;
  route: string;
  navigationLabel: string;
  sections: Array<{
    steps: Array<{id: string; title: string; url: string}>;
  }>;
};

type DocContextProps = {
  currentRoute: string;
  repository: string;
  projectName: string;
  documentType: string;
  audiences: string[];
  experienceIds: string[];
  support: string;
  access: string;
  sourceLabel: string;
  sourceHref: string;
  revision: string;
};

const experiencePages = new Map(
  (experiencePagesDocument.pages as ExperiencePage[])
    .map((page) => [page.experienceId, page] as const),
);

export default function DocContext({
  currentRoute,
  repository,
  projectName,
  documentType,
  audiences,
  experienceIds,
  support,
  access,
  sourceLabel,
  sourceHref,
  revision,
}: DocContextProps): ReactNode {
  const paths = experienceIds
    .map((id) => experiencePages.get(id))
    .filter((page): page is ExperiencePage => Boolean(page))
    .map((page) => {
      const steps = page.sections.flatMap((section) => section.steps);
      const stepIndex = steps.findIndex((step) => step.url === currentRoute);
      return {
        ...page,
        stepIndex,
        stepCount: steps.length,
        nextStep: stepIndex >= 0 ? steps[stepIndex + 1] : undefined,
      };
    });
  const states = [
    support !== 'unspecified' ? {kind: 'support', value: support} : undefined,
    access !== 'unspecified' ? {kind: 'access', value: access} : undefined,
  ].filter((state): state is {kind: string; value: string} => Boolean(state));

  return (
    <aside className={styles.context} aria-label="Documentation context" data-pagefind-ignore>
      <div className={styles.identity}>
        <span>{label(documentType)}</span>
        <Link to={`/ecosystem/${repository}/`}>{projectName}</Link>
      </div>

      <p className={styles.audience}>
        <span>For</span>
        <strong>{audiences.length ? audiences.map(label).join(' · ') : 'General'}</strong>
      </p>

      <nav className={styles.paths} aria-label="Related outcome paths">
        <span>{paths.length ? 'Related paths' : 'Need a path?'}</span>
        <div>
          {paths.length ? paths.map((path) => (
            <span className={styles.path} key={path.experienceId}>
              <Link to={path.route}>{path.navigationLabel}</Link>
              {path.stepIndex >= 0 ? (
                <small>
                  Step {path.stepIndex + 1} of {path.stepCount}
                  {path.nextStep ? <> · <Link to={path.nextStep.url}>Next: {path.nextStep.title}</Link></> : null}
                </small>
              ) : null}
            </span>
          )) : <Link to="/start/">Choose an outcome</Link>}
        </div>
      </nav>

      {states.length ? (
        <div className={styles.states} aria-label="Documentation status">
          {states.map((state) => (
            <span key={state.kind} data-state={state.value}>{label(state.value)}</span>
          ))}
        </div>
      ) : null}

      <details className={`${styles.source} b10x-source-provenance`} data-b10x-source-provenance data-pagefind-ignore>
        <summary>Source &amp; revision</summary>
        <p>
          <a href={sourceHref} target="_blank" rel="noopener noreferrer">{sourceLabel}</a>
          {' · '}
          <code title={revision}>{revision.slice(0, 12)}</code>
        </p>
      </details>
    </aside>
  );
}

function label(value: string): string {
  const acronyms = new Map([
    ['aep', 'AEP'],
    ['api', 'API'],
    ['cli', 'CLI'],
    ['ess', 'ESS'],
    ['mcp', 'MCP'],
  ]);
  return value.split('-').map((part) => acronyms.get(part) ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
