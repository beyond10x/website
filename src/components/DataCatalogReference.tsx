import {useEffect, useState, type ReactNode} from 'react';
import {DataCatalog, type DataCatalogItem} from '@beyond10x/docs-system/components';

interface Props {sourceUrl: string; sourceRepository: string; title: string}

export default function DataCatalogReference({sourceUrl, sourceRepository, title}: Props): ReactNode {
  const [items, setItems] = useState<DataCatalogItem[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetch(sourceUrl, {signal: controller.signal})
      .then((response) => {
        if (!response.ok) throw new Error(`data source returned ${response.status}`);
        return response.json();
      })
      .then((document: unknown) => setItems(normalizeCatalog(document)))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [sourceUrl]);

  if (error) return <p role="alert">Could not render this catalog: {error}. <a href={sourceUrl}>Download the data</a>.</p>;
  if (!items) return <p aria-live="polite">Loading the pinned data catalog…</p>;
  return <><p><a href={sourceUrl}>Download data</a> · <a href={sourceRepository} target="_blank" rel="noopener noreferrer">View owning source</a></p><DataCatalog items={items} title={title} /></>;
}

function normalizeCatalog(document: unknown): DataCatalogItem[] {
  const values = Array.isArray(document)
    ? document
    : document && typeof document === 'object'
      ? Object.values(document as Record<string, unknown>).find(Array.isArray) ?? Object.entries(document).map(([id, value]) => ({id, ...(isRecord(value) ? value : {name: String(value)})}))
      : [];
  return (values as unknown[]).map((value, index) => {
    const item = isRecord(value) ? value : {name: String(value)};
    const id = stringValue(item.id ?? item.key ?? item.slug ?? item.name) ?? `item-${index + 1}`;
    return {
      id,
      name: stringValue(item.name ?? item.title ?? item.label) ?? id,
      ...(stringValue(item.summary ?? item.description) ? {summary: stringValue(item.summary ?? item.description)} : {}),
      ...(stringValue(item.kind ?? item.category) ? {kind: stringValue(item.kind ?? item.category)} : {}),
      ...(stringValue(item.url) ? {url: stringValue(item.url)} : {}),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
