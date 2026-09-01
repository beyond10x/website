import type {CSSProperties, ReactNode} from 'react';
import {StatusBadge} from '@beyond10x/docs-system/components';
import type {RegistrySurface} from '@beyond10x/docs-system/types';

export default function EcosystemProjectCard({surface}: {surface: RegistrySurface}): ReactNode {
  const action = surface.adoption ?? {label: `Read ${surface.name}`, url: surface.canonicalUrl};
  return <article className="b10x-project-card" style={{'--b10x-project-accent': surface.accent} as CSSProperties}>
    <div><StatusBadge maturity={surface.maturity} /><span>{surface.kind}</span></div>
    <h3><a href={`/ecosystem/${surface.repository.id}/`}>{surface.name}</a></h3>
    <p>{surface.summary}</p>
    <ul>{surface.capabilities.map((capability) => <li key={capability}>{capability.replaceAll('-', ' ')}</li>)}</ul>
    <a className="b10x-adoption-link" href={action.url}>{action.label} <span aria-hidden="true">→</span></a>
  </article>;
}
