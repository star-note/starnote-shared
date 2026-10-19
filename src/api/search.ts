import { api } from './client';
import type { SearchParams, SearchResult, SearchScope } from './types';

const EMPTY: SearchResult = { notes: [], posts: [], total: 0, facets: {} };

export const searchApi = {
  /** Keyword search with per-scope filters (blog: category/handle, mine: tag, group: group_id). */
  search: (params: SearchParams) => api.get<SearchResult>('/search', { params: clean(params) }),
  /** Back-compat for callers that only know q + scope (palette). */
  quick: (q: string, scope: SearchScope, limit = 20) =>
    api.get<SearchResult>('/search', { params: { q, scope, page_size: limit } }),
  empty: EMPTY,
};

function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null),
  ) as Partial<T>;
}
