import type { BlogPatch } from './blogs';
import { api } from './client';
import { SOFT, softItems } from './soft';
import type { Blog, BlogCategory, Paged, Publication, PublicationStats, Visibility } from './types';

/** Whose blog a management screen works on (SPEC-r6 §A): mine, or a group's. */
export type BlogOwnerRef = { kind: 'user' } | { kind: 'group'; id: string };

export const MY_BLOG: BlogOwnerRef = { kind: 'user' };

/** Where a note publishes (SPEC-r6 §A): a group note → the group's blog, a personal note → mine. */
export function noteBlogOwner(note: { owner_type: string; owner_id: string }): BlogOwnerRef {
  return note.owner_type === 'group' ? { kind: 'group', id: note.owner_id } : MY_BLOG;
}

/** `/me` or `/groups/{id}` — the two prefixes share one contract. */
export function blogBase(owner: BlogOwnerRef): string {
  return owner.kind === 'user' ? '/me' : `/groups/${owner.id}`;
}

/** Stable key for request caches (`me` / `group:{id}`). */
export function blogScopeKey(owner: BlogOwnerRef): string {
  return owner.kind === 'user' ? 'me' : `group:${owner.id}`;
}

/** `PATCH …/blog/categories/{id}`: any subset of the editable fields (contract r3 §A). */
export interface BlogCategoryPatch {
  name?: string;
  slug?: string;
  order?: number;
  hidden?: boolean;
  /** `null` clears the public-taxonomy mapping. */
  system_category_id?: string | null;
}

export interface PublicationsQuery {
  blog_category_id?: string;
  category_id?: string;
  visibility?: Visibility;
  q?: string;
  page?: number;
  page_size?: number;
}

export interface BulkBody {
  ids: string[];
  category_id?: string;
  blog_category_id?: string;
  visibility?: Visibility;
  show_in_blog?: boolean;
}

/**
 * Blog management for one owner. The group variant answers 40301 on every write unless I am
 * the group's owner or an admin — the UI hides those controls, the API enforces it.
 */
export function blogScopeApi(owner: BlogOwnerRef) {
  const base = blogBase(owner);
  return {
    blog: () => api.get<Blog>(`${base}/blog`),
    update: (body: BlogPatch) => api.patch<Blog>(`${base}/blog`, body),
    /** `[]` while the endpoint is missing, so the publish form still lets you type a new name. */
    categories: async () =>
      softItems<BlogCategory>(
        await api.get<BlogCategory[] | unknown>(`${base}/blog/categories`, SOFT),
      ),
    /** 40901 when the name is taken. */
    createCategory: (body: { name: string; system_category_id?: string | null }) =>
      api.post<BlogCategory>(`${base}/blog/categories`, body),
    updateCategory: (id: string, body: BlogCategoryPatch) =>
      api.patch<BlogCategory>(`${base}/blog/categories/${id}`, body),
    /** A category with posts needs `moveTo` (40001 otherwise). */
    removeCategory: (id: string, moveTo?: string) =>
      api.delete<unknown>(`${base}/blog/categories/${id}`, {
        params: moveTo ? { move_to: moveTo } : undefined,
      }),
    /** Moves every post of `from` into `to` and deletes `from`. */
    mergeCategories: (fromId: string, toId: string) =>
      api.post<{ moved?: number } | unknown>(`${base}/blog/categories/merge`, {
        from_id: fromId,
        to_id: toId,
      }),
    /** Full order of the categories (hidden ones included). */
    reorderCategories: (ids: string[]) =>
      api.put<unknown>(`${base}/blog/categories/order`, { ids }),
    publications: (params: PublicationsQuery) =>
      api.get<Paged<Publication> & { can_manage?: boolean }>(`${base}/publications`, { params }),
    /** `null` when the endpoint is not deployed (bare 404): callers fall back to one PATCH per row. */
    bulk: async (body: BulkBody) => {
      const res = await api.post<{ updated: number } | unknown>(
        `${base}/publications/bulk`,
        body,
        SOFT,
      );
      return res &&
        typeof res === 'object' &&
        typeof (res as { updated?: unknown }).updated === 'number'
        ? (res as { updated: number })
        : null;
    },
    /** Delete offline / failed records; online ones come back in `failed` with 40901. */
    bulkDelete: (ids: string[]) =>
      api.post<{ deleted: number; failed: { id: string; code: number; message: string }[] }>(
        `${base}/publications/bulk-delete`,
        { ids },
      ),
    stats: () => api.get<PublicationStats>(`${base}/publications/stats`),
  };
}

export type BlogScopeApi = ReturnType<typeof blogScopeApi>;
