import type {ReactNode} from 'react';
import OriginalMDXA from '@theme-original/MDXComponents/A';
import type {Props} from '@theme/MDXComponents/A';
import {localizeWebsiteHref} from '../../../lib/links';

export default function MDXA({href, ...props}: Props): ReactNode {
  const localized = href ? localizeWebsiteHref(href) : href;
  // Compatibility URLs are already resolved to their integrated target by the shared helper.
  return <OriginalMDXA {...props} href={localized} />;
}
