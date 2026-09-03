import React, {type ReactNode, useEffect, useState} from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import type {Props} from '@theme/Root';
import {localizeWebsiteHref, WEBSITE_ORIGIN} from '../lib/links';
import styles from './Root.module.css';

type LocalPreviewMetadata = {
  enabled: true;
  revision: string;
  treeState: 'clean' | 'dirty' | 'unknown';
  reusedInputs: boolean;
};

function readMetadata(value: unknown): LocalPreviewMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.enabled !== true
    || typeof candidate.revision !== 'string'
    || !['clean', 'dirty', 'unknown'].includes(String(candidate.treeState))
    || typeof candidate.reusedInputs !== 'boolean') return undefined;
  return candidate as LocalPreviewMetadata;
}

function isLocalPreviewOrigin(): boolean {
  return window.location.origin !== WEBSITE_ORIGIN;
}

function confineWebsiteAnchors(root: Document | Element): void {
  const anchors = root instanceof HTMLAnchorElement
    ? [root]
    : [...root.querySelectorAll<HTMLAnchorElement>('a[href]')];
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    const localized = localizeWebsiteHref(href);
    if (localized === href) continue;
    anchor.setAttribute('href', localized);
    anchor.removeAttribute('target');
    if (anchor.getAttribute('rel') === 'noopener noreferrer') anchor.removeAttribute('rel');
  }
}

export default function Root({children}: Props): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  const metadata = readMetadata(siteConfig.customFields?.localPreview);
  const [showBadge, setShowBadge] = useState(false);

  useEffect(() => {
    const local = Boolean(metadata) && isLocalPreviewOrigin();
    setShowBadge(local);
    if (!local) return undefined;

    confineWebsiteAnchors(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') confineWebsiteAnchors(record.target as Element);
        for (const node of record.addedNodes) {
          if (node instanceof Element) confineWebsiteAnchors(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['href'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [metadata]);

  return (
    <>
      {children}
      {showBadge && metadata ? (
        <aside className={styles.badge} aria-label="Local preview status">
          <details>
            <summary>
              <strong>Local</strong>
              <code title={metadata.revision}>{metadata.revision.slice(0, 7)}</code>
            </summary>
            <div className={styles.details}>
              <span className={metadata.treeState === 'dirty' ? styles.warning : undefined}>
                Tree {metadata.treeState} at launch
              </span>
              <span className={metadata.reusedInputs ? styles.warning : undefined}>
                {metadata.reusedInputs ? 'Reused generated inputs' : 'Fresh generated inputs'}
              </span>
            </div>
          </details>
        </aside>
      ) : null}
    </>
  );
}
