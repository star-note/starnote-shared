import { api } from './client';
import type { PublishChenjiBody } from './publications';
import { SOFT } from './soft';
import type {
  Activity,
  Approval,
  Comment,
  CommentsPage,
  Note,
  NoteDetail,
  NoteViewer,
  Paged,
  Publication,
  PublishPlanPayload,
  Revision,
  RevisionDetail,
  Tag,
  TiptapDoc,
  TrashNote,
  TrashScope,
  TrashScopeKey,
} from './types';

export interface NoteChildren {
  items: Note[];
  next_cursor?: string | null;
}

export const notesApi = {
  children: (parentId: string | null, cursor?: string) =>
    api.get<NoteChildren | Note[]>('/notes', {
      params: { parent_id: parentId ?? 'root', limit: 200, cursor: cursor || undefined },
    }),
  get: (id: string) => api.get<NoteDetail>(`/notes/${id}`),
  /**
   * CONTRACTS-r9 §2: the note's 公众号风格主题 and whether AI wrote / rewrote part of it. No If-Match, no new
   * version, no revision.
   */
  meta: (id: string, body: { style_id?: string | null; theme?: string | null; ai_assisted?: boolean }) =>
    api.patch<{ id: string; style_id: string | null; theme: string | null; ai_assisted: boolean }>(
      `/notes/${id}/meta`,
      body,
    ),
  create: (body: { title?: string; parent_id?: string | null; content?: TiptapDoc }) =>
    api.post<Note>('/notes', body),
  update: (
    id: string,
    body: { title?: string; content?: TiptapDoc; pinned?: boolean },
    version: number,
    /** The collab socket's tab id: echoed back as `note.updated.by_client` so this tab can ignore its own save. */
    clientId?: string,
  ) =>
    api.patch<Note>(`/notes/${id}`, body, {
      headers: { 'If-Match': String(version), ...(clientId ? { 'X-Client-Id': clientId } : {}) },
    }),
  /** Re-parent; `owner` moves the whole subtree into another tree (personal ↔ group). */
  move: (
    id: string,
    parentId: string | null,
    owner?: { type: 'user' } | { type: 'group'; id: string },
  ) =>
    api.post<Note>(
      `/notes/${id}/move`,
      owner ? { parent_id: parentId, owner } : { parent_id: parentId },
    ),
  remove: (id: string) => api.delete<unknown>(`/notes/${id}`),
  /** One trash scope (`personal` = my personal notes, `group:{id}` = a group's trash); omitted = everything. */
  trash: (page = 1, scope?: TrashScopeKey) =>
    api.get<Paged<TrashNote>>('/notes/trash', { params: { page, scope } }),
  /** The trash tabs with counts and what my role allows in each. */
  trashScopes: () => api.get<{ items: TrashScope[] }>('/notes/trash/scopes'),
  /** `restored_to_root`: the original parent was gone / still trashed, the note went to its tree's root. */
  restore: (id: string) => api.post<Note & { restored_to_root?: boolean }>(`/notes/${id}/restore`),
  /**
   * 40901 `{publications}` when the subtree still has online posts; retry with `withPublications` to take them
   * offline and delete them too. Group notes: owner / admin only (40301).
   */
  purge: (id: string, withPublications = false) =>
    api.delete<{ id: string; purged: number }>(`/notes/${id}/purge`, {
      params: withPublications ? { with_publications: true } : undefined,
    }),
  /** Empty one scope (same 40901 rule, all or nothing). */
  emptyTrash: (scope?: TrashScopeKey, withPublications = false) =>
    api.delete<{ purged: number }>('/notes/trash', {
      params: { scope, ...(withPublications ? { with_publications: true } : {}) },
    }),
  recent: (limit = 20) => api.get<Note[]>('/notes/recent', { params: { limit } }),
  favorite: (id: string) => api.post<unknown>(`/notes/${id}/favorite`),
  unfavorite: (id: string) => api.delete<unknown>(`/notes/${id}/favorite`),
  favorites: () => api.get<Note[] | Paged<Note>>('/favorites'),
  publications: (id: string) => api.get<Publication[]>(`/notes/${id}/publications`),
  /**
   * r4 §A: ask the group's approvers to publish this note — same body as `publish/chenji`.
   * 40902 when a request is already pending.
   */
  /** SPEC-r8-group-publisher: `plan` carries the chosen platforms + their fields for the reviewer / 发布员. */
  publishRequest: (id: string, body: PublishChenjiBody & { plan?: PublishPlanPayload }) =>
    api.post<Approval>(`/notes/${id}/publish-request`, body),
  /** Both tag endpoints answer with the note's full tag list. */
  addTag: (id: string, name: string) => api.post<{ tags: Tag[] }>(`/notes/${id}/tags`, { name }),
  removeTag: (id: string, tagId: string) =>
    api.delete<{ tags: Tag[] }>(`/notes/${id}/tags/${tagId}`),

  // ---- contract §B: activities / revisions / viewers ----------------------
  activities: (id: string, page = 1, pageSize = 50) =>
    api.get<Paged<Activity> | Activity[]>(`/notes/${id}/activities`, {
      ...SOFT,
      params: { page, page_size: pageSize },
    }),
  revisions: (id: string) => api.get<Paged<Revision> | Revision[]>(`/notes/${id}/revisions`, SOFT),
  revision: (id: string, rid: string) => api.get<RevisionDetail>(`/notes/${id}/revisions/${rid}`),
  restoreRevision: (id: string, rid: string) =>
    api.post<NoteDetail>(`/notes/${id}/revisions/${rid}/restore`),
  viewers: (id: string, limit = 12) =>
    api.get<{ items: NoteViewer[]; total: number } | NoteViewer[]>(`/notes/${id}/viewers`, {
      ...SOFT,
      params: { limit },
    }),

  // ---- contract §C: comments on a note ------------------------------------
  comments: (id: string, page = 1, pageSize = 20) =>
    api.get<CommentsPage>(`/notes/${id}/comments`, {
      ...SOFT,
      params: { page, page_size: pageSize },
    }),
  createComment: (id: string, content: TiptapDoc, parentId?: string | null) =>
    api.post<Comment>(
      `/notes/${id}/comments`,
      parentId ? { content, parent_id: parentId } : { content },
    ),
};

/** The children endpoint may answer with `{items}` or a bare array; normalise. */
export function asItems<T>(res: { items: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res?.items ?? []);
}
