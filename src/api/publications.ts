import { api } from './client';
import type {
  CoverVariantKey,
  Paged,
  Publication,
  PublicationStats,
  TocItem,
  Visibility,
} from './types';

/** Contract r3 §A: an existing blog category by id, or a new one by name (created on publish). */
export type BlogCategoryInput = { id: string } | { name: string };

export interface PublishChenjiBody {
  category?: BlogCategoryInput;
  /** Legacy: a system category id; the API maps it to a same-named blog category. */
  category_id?: string;
  visibility: Visibility;
  summary?: string;
  cover_asset_hash?: string;
  /** Asset hashes of the cover at other sizes (contract: migration 0011); missing keys fall back to the cover. */
  cover_variants?: Partial<Record<CoverVariantKey, string>>;
  /** Cover alt text (img alt / og:image:alt); the server defaults it to the title. */
  cover_alt?: string;
  slug?: string;
  show_in_blog?: boolean;
  html?: string;
  toc?: TocItem[];
  title?: string;
  /** CONTRACTS-r9 §2: the note's 公众号风格主题 (null = none). */
  theme?: string | null;
  /** r9 译文: `{en: {...}}` saves / replaces, `{en: null}` removes; absent = unchanged. */
  translations?: Record<string, PublicationTranslationInput | null>;
}

export interface PublicationTranslationInput {
  title: string;
  html: string;
  summary?: string;
  toc?: TocItem[];
}

export const publicationsApi = {
  publishChenji: (noteId: string, body: PublishChenjiBody) =>
    api.post<Publication>(`/notes/${noteId}/publish/chenji`, body),
  update: (
    id: string,
    body: Partial<{
      /** Blog category (contract r3 §A); `category_id` stays the system-category field. */
      category: BlogCategoryInput;
      category_id: string;
      visibility: Visibility;
      summary: string;
      slug: string;
      pinned: boolean;
      cover_asset_hash: string;
      cover_variants: Partial<Record<CoverVariantKey, string>>;
      cover_alt: string;
    }>,
  ) => api.patch<Publication>(`/publications/${id}`, body),
  /** Contract r3 §B: a fresh 提取码 for a password post; `url` already carries `?pwd=`. */
  resetAccessCode: (id: string) =>
    api.post<{ access_code: string; url: string }>(`/publications/${id}/access-code/reset`),
  offline: (id: string) => api.post<Publication>(`/publications/${id}/offline`),
  online: (id: string) => api.post<Publication>(`/publications/${id}/online`),
  /** Delete an offline / failed record (40901 「请先下线再删除」 while online). */
  remove: (id: string) => api.delete<{ id: string }>(`/publications/${id}`),
  mine: (params: {
    /** Filter by my blog category (contract r3 §A). */
    blog_category_id?: string;
    category_id?: string;
    visibility?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }) => api.get<Paged<Publication>>('/me/publications', { params }),
  stats: () => api.get<PublicationStats>('/me/publications/stats'),
};
