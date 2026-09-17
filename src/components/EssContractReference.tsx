import {useEffect, useState, type ReactNode} from 'react';
import {EssContractViewer} from '@beyond10x/docs-system/ess-contract-viewer';

interface Props {sourceUrl: string; sourceRepository: string; title: string}
type Load = {source: string; document: unknown} | {source: string; error: string};

/** Website owns the passive download; Docs System owns contract presentation. */
export default function EssContractReference({sourceUrl, sourceRepository, title}: Props): ReactNode {
  const [loaded, setLoaded] = useState<Load>();
  useEffect(() => {
    const controller = new AbortController();
    fetch(sourceUrl, {signal: controller.signal, credentials: 'omit'})
      .then(response => {
        if (!response.ok) throw new Error(`documentation source returned ${response.status}`);
        return response.json();
      })
      .then((document: unknown) => { if (!controller.signal.aborted) setLoaded({source: sourceUrl, document}); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setLoaded({source: sourceUrl, error: reason instanceof Error ? reason.message : String(reason)});
      });
    return () => controller.abort();
  }, [sourceUrl]);
  if (!loaded || loaded.source !== sourceUrl) return <p role="status">Loading the contract reference…</p>;
  if ('error' in loaded) return <p role="alert">Could not load the contract reference: {loaded.error}. <a href={sourceUrl}>Download the projection</a>.</p>;
  return <EssContractViewer document={loaded.document} id={sourceUrl} title={title} sourceUrl={sourceUrl} sourceRepository={sourceRepository} />;
}
