export interface SearchResultLike {
  id: string;
}

export interface SearchResultDataLike {
  excerpt?: string;
  meta?: {description?: string};
}

export interface SearchFiltersLike {
  [key: string]: string | undefined;
  document_type?: string;
}

export function prioritizeSearchResults<T extends SearchResultLike>(results: T[], preferred: T[], limit?: number): T[];
export function preferredExperienceFilters<T extends SearchFiltersLike>(query: string, filters: T): (T & {document_type: 'experience'}) | undefined;
export function resultCountDescription(displayed: number, total: number): string;
export function resultSummary(result: SearchResultDataLike, options?: {preferDescription?: boolean}): string;
