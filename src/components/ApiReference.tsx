import {useEffect, useState, type ReactNode} from 'react';
import {JsonSchemaViewer, OpenApiReference} from '@beyond10x/docs-system/renderers';
import type {JsonSchema, OpenApiDocument} from '@beyond10x/docs-system/renderers';

interface Props {
  format: 'openapi' | 'json-schema';
  sourceUrl: string;
  sourceRepository: string;
}

export default function ApiReference({format, sourceUrl, sourceRepository}: Props): ReactNode {
  const [document, setDocument] = useState<OpenApiDocument | JsonSchema>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetch(sourceUrl, {signal: controller.signal})
      .then((response) => {
        if (!response.ok) throw new Error(`API source returned ${response.status}`);
        return response.json();
      })
      .then(setDocument)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [sourceUrl]);

  if (error) return <p role="alert">Could not render this contract: {error}. <a href={sourceUrl}>Download the source</a>.</p>;
  if (!document) return <p aria-live="polite">Loading the pinned contract…</p>;
  if (format === 'openapi') return <OpenApiReference document={document as OpenApiDocument} sourceUrl={sourceUrl} />;
  return (
    <section>
      <p><a href={sourceUrl}>Download JSON Schema</a> · <a href={sourceRepository}>View its owning source</a></p>
      <JsonSchemaViewer schema={document as JsonSchema} />
    </section>
  );
}
