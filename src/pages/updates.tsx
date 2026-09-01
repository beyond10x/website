import type {ReactNode} from 'react';
import {Redirect} from '@docusaurus/router';

export default function Updates(): ReactNode {
  return <Redirect to="/changes" />;
}
