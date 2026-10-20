import { api } from './client';
import type { Category } from './types';
import { flattenCategories, type CategoriesResponse } from '../utils/categoryTree';

export const categoriesApi = {
  /** Flat, depth-first (parents followed by their children). Accepts both response shapes (contract §D). */
  list: async (): Promise<Category[]> =>
    flattenCategories(await api.get<CategoriesResponse>('/categories')),
};
