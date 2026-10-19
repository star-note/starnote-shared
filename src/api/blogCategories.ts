import { blogScopeApi, MY_BLOG } from './blogScope';

export type { BlogCategoryPatch } from './blogScope';

const mine = blogScopeApi(MY_BLOG);

/** My own blog's 栏目 (contract r3 §A); group blogs use `blogScopeApi({kind:'group', id})`. */
export const blogCategoriesApi = {
  list: mine.categories,
  create: mine.createCategory,
  update: mine.updateCategory,
  remove: mine.removeCategory,
  merge: mine.mergeCategories,
  reorder: mine.reorderCategories,
};
