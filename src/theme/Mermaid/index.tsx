import type {ReactNode} from 'react';
import OriginalMermaid from '@theme-original/Mermaid';
import type {Props} from '@theme/Mermaid';

/**
 * Keep an exact, non-visual payload marker in static HTML so the build can
 * prove that every Mermaid fence reached the client renderer. The original
 * component still owns parsing and the visible SVG after hydration.
 */
export default function Mermaid(props: Props): ReactNode {
  return (
    <>
      <span hidden data-b10x-mermaid-source={props.value} />
      <OriginalMermaid {...props} />
    </>
  );
}
