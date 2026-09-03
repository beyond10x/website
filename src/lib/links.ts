import type {RegistrySurface} from '@beyond10x/docs-system/types';
import legacyRoutesDocument from '../../legacy-routes.json' with {type: 'json'};

export const WEBSITE_ORIGIN = 'https://beyond10x.github.io';

interface LegacyRoute {
  from: string;
  to?: string;
  source?: string;
  type: 'html' | 'alias';
}

const effectiveLegacyTargets = new Map(
  (legacyRoutesDocument.redirects as LegacyRoute[]).map((route) => [
    route.from,
    route.type === 'html' ? route.to : route.source ? `/${route.source}` : undefined,
  ]),
);

/**
 * Keep links to the canonical Website on whichever origin is rendering it.
 * Canonical data, source links, and links to every other origin remain unchanged.
 */
export function localizeWebsiteHref(value: string): string {
  let url: URL;
  try {
    url = value.startsWith('/') && !value.startsWith('//')
      ? new URL(value, WEBSITE_ORIGIN)
      : new URL(value);
  } catch {
    return value;
  }
  if (url.origin !== WEBSITE_ORIGIN) return value;
  const effectivePath = effectiveLegacyTarget(url.pathname) ?? url.pathname;
  return `${effectivePath}${url.search}${url.hash}`;
}

/** Tell presentation code whether a link actually leaves the canonical Website. */
export function isExternalWebsiteHref(value: string): boolean {
  try {
    return new URL(value, WEBSITE_ORIGIN).origin !== WEBSITE_ORIGIN;
  } catch {
    return false;
  }
}

function effectiveLegacyTarget(pathname: string): string | undefined {
  const exact = effectiveLegacyTargets.get(pathname);
  if (exact) return exact;
  const alternate = pathname.endsWith('/') ? pathname.slice(0, -1) : `${pathname}/`;
  return effectiveLegacyTargets.get(alternate);
}

/** Match the adoption URL selection used by the shared cards, then localize it for presentation. */
export function localizedAdoptionHref(surface: RegistrySurface): string {
  const adoption = 'adoption' in surface ? surface.adoption : undefined;
  const fallback = surface.sections.find((section) => section.kind === 'quickstart' || section.kind === 'guide');
  return localizeWebsiteHref(adoption?.url ?? fallback?.url ?? surface.canonicalUrl);
}
