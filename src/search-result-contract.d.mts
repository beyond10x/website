export interface SearchResultLike {
  id: string;
}

export function prioritizeSearchResults<T extends SearchResultLike>(results: T[], preferred: T[], limit?: number): T[];
export function resultCountDescription(displayed: number, total: number): string;
