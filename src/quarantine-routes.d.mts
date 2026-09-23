export function quarantinedRepositoryTarget(repository: string | undefined, quarantined: ReadonlySet<string>): string | undefined;
export function quarantinedRouteTarget(url: string, quarantined: ReadonlySet<string>): string | undefined;
export interface QuarantinedSurfaceLink {
  key: string;
  id: string;
  name: string;
  canonicalUrl: string;
  repository: {id: string; url: string};
}
export function quarantinedSurfaceLink(key: string, quarantined: ReadonlySet<string>): QuarantinedSurfaceLink | undefined;
export function completeSurfaceLookup<T>(surfaces: Map<string, T>, keys: Iterable<string>, quarantined: ReadonlySet<string>): Map<string, T | QuarantinedSurfaceLink>;
export function isQuarantinedRepositoryUrl(url: string, quarantined: ReadonlySet<string>): boolean;
