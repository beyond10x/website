import type {ReactNode} from 'react';
import OriginalHeading from '@theme-original/Heading';
import type {Props} from '@theme/Heading';
import useBrokenLinks from '@docusaurus/useBrokenLinks';

export default function Heading({as, id, ...props}: Props): ReactNode {
  const brokenLinks = useBrokenLinks();
  // Imported Markdown can link to its title. Docusaurus reserves this slug
  // during compilation but its default theme drops the id on h1 elements.
  // Retain the compiler's exact id, including its collision handling.
  if (as === 'h1' && id) {
    brokenLinks.collectAnchor(id);
    return <h1 {...props} id={id} />;
  }
  return <OriginalHeading as={as} id={id} {...props} />;
}
