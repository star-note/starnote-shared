import { api } from './client';
import type { Comment, Paged, TiptapDoc } from './types';

/** Operations on a single comment regardless of what it is attached to (contract §C). */
export const commentsApi = {
  replies: (id: string, page = 1, pageSize = 20) =>
    api.get<Paged<Comment> | Comment[]>(`/comments/${id}/replies`, {
      params: { page, page_size: pageSize },
    }),
  /** Author only, within 15 minutes of posting. */
  update: (id: string, content: TiptapDoc) => api.patch<Comment>(`/comments/${id}`, { content }),
  /** Author / blog owner / group admin+; soft delete. */
  remove: (id: string) => api.delete<unknown>(`/comments/${id}`),
};
