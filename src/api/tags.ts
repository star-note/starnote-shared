import { api } from './client';
import { asItems } from './notes';
import type { Tag, TagSuggest } from './types';

export const tagsApi = {
  /** The server pages this list (`{items}`); callers always get a plain array. */
  list: async (q = '', limit = 20) =>
    asItems(await api.get<{ items: Tag[] } | Tag[]>('/tags', { params: { q, limit } })),
  suggest: (noteId: string) =>
    api.get<TagSuggest>('/tags/suggest', { params: { note_id: noteId } }),
};
