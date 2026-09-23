import type {ComponentProps, ReactNode} from 'react';
import Link from '@docusaurus/Link';
import {publishedHref} from './published';

/**
 * `@docusaurus/Link` with its target passed through the quarantine rule. Every Website page and
 * component links through this, so no hard-coded route can point into a source this build omits.
 */
export default function PublishedLink({to, href, ...props}: ComponentProps<typeof Link>): ReactNode {
  return <Link
    {...props}
    {...(to === undefined ? {} : {to: publishedHref(to)})}
    {...(href === undefined ? {} : {href: publishedHref(href)})}
  />;
}
