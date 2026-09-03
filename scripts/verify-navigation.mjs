import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PRIMARY_ROUTE_MATRIX, verifyRenderedNavigation} from './navigation-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const redirects = JSON.parse(await readFile(path.join(root, 'legacy-routes.json'), 'utf8'));
const result = await verifyRenderedNavigation({build: path.join(root, 'build'), redirects});
process.stdout.write(
  `verified ${result.linksChecked} rendered navigation links across ${result.documentCount} HTML pages; `
  + `${PRIMARY_ROUTE_MATRIX.length} primary destinations resolve\n`,
);
