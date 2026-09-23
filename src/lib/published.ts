import quarantineDocument from '../../.generated/data/quarantine.json' with {type: 'json'};
import type {RegistrySurface} from '@beyond10x/docs-system/types';
import {completeSurfaceLookup, isQuarantinedRepositoryUrl, quarantinedRouteTarget} from '../quarantine-routes.mjs';
import {localizedAdoptionHref as localizedAdoption, localizeWebsiteHref as localize} from './links';

// Everything src/ renders links through: links.ts stays free of generated inputs (tests import it
// before site preparation), and this module composes it with the build's quarantine.
export {isExternalWebsiteHref, WEBSITE_ORIGIN} from './links';

// Written by scripts/prepare-site.mjs from the publication inputs: the sources this build omits.
const quarantined: ReadonlySet<string> = new Set((quarantineDocument as {repositories: string[]}).repositories);

/**
 * A Website-authored link, unless it points into a quarantined source, in which case the source's
 * GitHub repository — the rule scripts/link-rewriting.mjs applies to every other source's links.
 */
export function publishedHref(url: string): string {
  return quarantinedRouteTarget(url, quarantined) ?? url;
}

export function isQuarantinedRepository(repository: string): boolean {
  return quarantined.has(repository);
}

/**
 * A surface lookup built from the published registry, completed with every requested key of a
 * quarantined surface, so a reference to one renders as a link to its GitHub repository rather than
 * an anchor with no target. The completion carries only the fields a link renders.
 */
export function withQuarantinedSurfaces<T>(surfaces: Map<string, T>, keys: Iterable<string>): Map<string, T> {
  return completeSurfaceLookup(surfaces, keys, quarantined) as Map<string, T>;
}

/** Whether a URL is exactly what the rule turned a link into a quarantined source into. */
export function isQuarantineRedirect(url: string): boolean {
  return isQuarantinedRepositoryUrl(url, quarantined);
}

/** `localizeWebsiteHref` for this build: a link into a quarantined source becomes its GitHub repository. */
export function localizeWebsiteHref(value: string): string {
  return publishedHref(localize(publishedHref(value)));
}

export function localizedAdoptionHref(surface: RegistrySurface): string {
  return publishedHref(localizedAdoption(surface));
}
