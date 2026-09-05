import type {ReactNode} from 'react';
import OriginalMermaid from '@theme-original/Mermaid';
import type {Props} from '@theme/Mermaid';
import {DiagramFrame} from '@beyond10x/docs-system/components';

/**
 * Keep an exact, non-visual payload marker in static HTML so the build can
 * prove that every Mermaid fence reached the client renderer. The original
 * component still owns parsing and the visible SVG after hydration.
 */
export default function Mermaid(props: Props): ReactNode {
  const title = /^[\t ]*accTitle:[\t ]*(.+)$/m.exec(props.value)?.[1]?.trim() ?? 'Diagram';
  const description = /^[\t ]*accDescr:[\t ]*(.+)$/m.exec(props.value)?.[1]?.trim()
    ?? 'A visual explanation of the surrounding documentation.';
  return (
    <>
      <span hidden data-b10x-mermaid-source={props.value} />
      <DiagramFrame key={props.value} title={title} description={description}>
        <OriginalMermaid {...props} />
      </DiagramFrame>
    </>
  );
}
