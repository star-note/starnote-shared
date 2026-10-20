import { api } from './client';
import type { FeedItem, Paged } from './types';

/** A saved post: the feed item shape plus when it was saved. */
export type FavoritePost = FeedItem & { favorited: true; favorited_at: string | null };

/**
 * 收藏 of published posts (`post_favorites`, API migration 0019). Notes keep their own favourites
 * (`notesApi.favorite` / `unfavorite` / `favorites`).
 */
export const favoritesApi = {
  /** Saved posts still online, newest saved first. */
  posts: (params: { page?: number; page_size?: number } = {}) =>
    api.get<Paged<FavoritePost>>('/me/favorites/posts', { params }),
  /** Whether this publication is saved (the reader's 收藏 state). */
  isSaved: async (publicationId: string) =>
    (await api.get<Paged<FavoritePost>>('/me/favorites/posts', { params: { ids: publicationId } }))
      .total > 0,
  save: (publicationId: string) =>
    api.post<{ publication_id: string; favorited: boolean }>('/me/favorites/posts', {
      publication_id: publicationId,
    }),
  unsave: (publicationId: string) =>
    api.delete<{ publication_id: string; favorited: boolean }>(
      `/me/favorites/posts/${publicationId}`,
    ),
};
