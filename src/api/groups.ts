import { api } from './client';
import { SOFT, softItems } from './soft';
import type {
  Approval,
  ApprovalKind,
  ApprovalPayload,
  ApprovalsPage,
  Group,
  GroupDetail,
  GroupJoinPolicy,
  GroupMember,
  GroupPublishPolicy,
  GroupRole,
  GroupVisibility,
  HandleCheck,
  Invite,
  InviteInfo,
  JoinRequest,
  Note,
  Paged,
  PendingCounts,
  PublishQueuePage,
  PublishQueueStatus,
  TiptapDoc,
} from './types';

/** `POST /groups/{id}/publish-queue/{aid}/results`: one platform's outcome. */
export interface PublishResultIn {
  platform: string;
  status: 'published' | 'failed';
  url?: string | null;
  /** Required when `failed`. */
  error?: string | null;
  account?: string | null;
}

export type { GroupVisibility } from './types';

export interface GroupCreateBody {
  name: string;
  /** Optional one-line intro; the M1 backend ignores unknown fields. */
  description?: string;
  visibility?: GroupVisibility;
}

/** `PATCH /groups/{id}`: any subset of the editable profile (contract §A). */
export interface GroupPatch {
  name?: string;
  description?: string;
  visibility?: GroupVisibility;
  join_policy?: GroupJoinPolicy;
  publish_policy?: GroupPublishPolicy;
  /** SPEC-r6 §A: the group blog's address; same rules and 30-day cooldown as a user handle (owner / admin). */
  handle?: string;
  avatar_asset_hash?: string | null;
}

/** `GET /groups/{id}/approvals` (r4 §A); `available=false` while the endpoint is not deployed. */
export interface ApprovalsResult extends ApprovalsPage {
  available: boolean;
}

/** Normalise the approvals response; a bare 404 / unknown shape reads as "not available". */
export function normalizeApprovals(res: unknown): ApprovalsResult {
  if (!res || typeof res !== 'object' || !Array.isArray((res as { items?: unknown }).items)) {
    return { items: [], total: 0, pending_counts: null, available: false };
  }
  const r = res as Partial<ApprovalsPage> & { items: unknown[] };
  const items = r.items.filter((a): a is Approval =>
    Boolean(a && typeof a === 'object' && typeof (a as Approval).id === 'string'),
  );
  const pc = r.pending_counts;
  const pending_counts: PendingCounts | null =
    pc && typeof pc === 'object'
      ? {
          publish: Number(pc.publish ?? 0),
          role: Number(pc.role ?? 0),
          join: Number(pc.join ?? 0),
          total:
            typeof pc.total === 'number'
              ? pc.total
              : Number(pc.publish ?? 0) + Number(pc.role ?? 0) + Number(pc.join ?? 0),
        }
      : null;
  return {
    items,
    total: typeof r.total === 'number' ? r.total : items.length,
    pending_counts,
    available: true,
  };
}

export interface InviteCreateBody {
  role?: Extract<GroupRole, 'editor' | 'viewer'>;
  expires_days?: number;
  max_uses?: number | null;
}

export const groupsApi = {
  list: () => api.get<Group[] | Paged<Group>>('/groups'),
  get: (id: string) => api.get<GroupDetail>(`/groups/${id}`),
  notes: (id: string, params?: { parent_id?: string | null; limit?: number; cursor?: string }) =>
    api.get<Note[] | Paged<Note>>(`/groups/${id}/notes`, { params }),
  /** A note owned by the group; `parent_id` must be another note of the same group. */
  createNote: (
    id: string,
    body: { title?: string; parent_id?: string | null; content?: TiptapDoc },
  ) => api.post<Note>(`/groups/${id}/notes`, body),
  create: (body: GroupCreateBody | string) =>
    api.post<Group>('/groups', typeof body === 'string' ? { name: body } : body),

  // ---- profile (admin+) / lifecycle (owner) ------------------------------
  patch: (id: string, body: GroupPatch) => api.patch<GroupDetail>(`/groups/${id}`, body),
  /** SPEC-r6 §A: availability of a group blog handle (shared namespace with user handles); `null` while missing. */
  handleCheck: async (id: string, handle: string) => {
    const res = await api.get<HandleCheck | unknown>(`/groups/${id}/handle/check`, {
      ...SOFT,
      params: { handle },
    });
    return res &&
      typeof res === 'object' &&
      typeof (res as { available?: unknown }).available === 'boolean'
      ? (res as HandleCheck)
      : null;
  },
  remove: (id: string) => api.delete<unknown>(`/groups/${id}`),
  transfer: (id: string, userId: string) =>
    api.post<GroupDetail>(`/groups/${id}/transfer`, { user_id: userId }),

  // ---- members -------------------------------------------------------------
  members: (id: string, page = 1, pageSize = 50) =>
    api.get<Paged<GroupMember> | GroupMember[]>(`/groups/${id}/members`, {
      ...SOFT,
      params: { page, page_size: pageSize },
    }),
  setMemberRole: (id: string, userId: string, role: GroupRole) =>
    api.patch<GroupMember>(`/groups/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) =>
    api.delete<unknown>(`/groups/${id}/members/${userId}`),
  /** Leave the group myself; the owner must transfer first. */
  leave: (id: string) => api.delete<unknown>(`/groups/${id}/members/me`),

  // ---- invites -------------------------------------------------------------
  createInvite: (id: string, body: InviteCreateBody) =>
    api.post<Invite>(`/groups/${id}/invites`, body),
  invites: (id: string) => api.get<Invite[] | Paged<Invite>>(`/groups/${id}/invites`, SOFT),
  revokeInvite: (id: string, code: string) => api.delete<unknown>(`/groups/${id}/invites/${code}`),
  /** Anyone signed in may look at an invite before accepting it. */
  inviteInfo: (code: string) => api.get<InviteInfo>(`/invites/${code}`),
  acceptInvite: (code: string) => api.post<GroupDetail>(`/invites/${code}/accept`),

  // ---- join requests -------------------------------------------------------
  /** Non-member asks to join; an `open` group answers with the GroupDict directly. */
  requestJoin: (id: string, message?: string) =>
    api.post<{ id: string; status: 'pending' } | GroupDetail>(
      `/groups/${id}/requests`,
      message ? { message } : {},
    ),
  requests: (id: string, status: 'pending' | 'approved' | 'rejected' = 'pending') =>
    api.get<Paged<JoinRequest> | JoinRequest[]>(`/groups/${id}/requests`, {
      ...SOFT,
      params: { status },
    }),
  approveRequest: (id: string, rid: string, role?: GroupRole) =>
    api.post<unknown>(`/groups/${id}/requests/${rid}/approve`, role ? { role } : {}),
  rejectRequest: (id: string, rid: string) =>
    api.post<unknown>(`/groups/${id}/requests/${rid}/reject`),

  // ---- approvals (r4 §A): publish / role / join in one queue ---------------
  approvals: async (
    id: string,
    params: { kind?: ApprovalKind; status?: 'pending' | 'all'; page?: number } = {},
  ) =>
    normalizeApprovals(
      await api.get<ApprovalsPage | unknown>(`/groups/${id}/approvals`, {
        ...SOFT,
        params: { status: 'all', ...params },
      }),
    ),
  /** publish: `payload` is the reviewer's edit of the form / plan, merged over the request (SPEC-r8-group-publisher). */
  approve: (
    id: string,
    aid: string,
    body: { reason?: string; role?: GroupRole; payload?: ApprovalPayload } = {},
  ) => api.post<Approval | unknown>(`/groups/${id}/approvals/${aid}/approve`, body),
  reject: (id: string, aid: string, reason: string) =>
    api.post<Approval | unknown>(`/groups/${id}/approvals/${aid}/reject`, { reason }),
  /** The requester takes a pending request back. */
  cancelApproval: (id: string, aid: string) =>
    api.post<Approval | unknown>(`/groups/${id}/approvals/${aid}/cancel`),
  /** A member asks for a higher role; answers with the `kind=role` approval. */
  requestRole: (
    id: string,
    body: { role: Exclude<GroupRole, 'owner' | 'viewer'>; message?: string },
  ) => api.post<Approval>(`/groups/${id}/role-requests`, body.message ? body : { role: body.role }),
  /** Join requests under the compat alias, already normalised to a list. */
  legacyJoinRequests: async (id: string, status: 'pending' | 'approved' | 'rejected' = 'pending') =>
    softItems<JoinRequest>(
      await api.get<Paged<JoinRequest> | JoinRequest[] | unknown>(`/groups/${id}/requests`, {
        ...SOFT,
        params: { status },
      }),
    ),

  // ---- 发布员 + 「待发布」 (SPEC-r8-group-publisher) ---------------------------
  /** Owner / admin flag a member (editor and above) as 发布员, or clear it. */
  setPublisher: (id: string, userId: string, on: boolean) =>
    on
      ? api.put<GroupMember>(`/groups/${id}/members/${userId}/publisher`)
      : api.delete<GroupMember>(`/groups/${id}/members/${userId}/publisher`),
  /** Publish requests past review; `open` = awaiting_publish | publishing | partially_published. */
  publishQueue: (id: string, params: { status?: PublishQueueStatus; page?: number; page_size?: number } = {}) =>
    api.get<PublishQueuePage>(`/groups/${id}/publish-queue`, { params: { status: 'open', ...params } }),
  publishItem: (id: string, aid: string) => api.get<Approval>(`/groups/${id}/publish-queue/${aid}`),
  claimPublish: (id: string, aid: string) => api.post<Approval>(`/groups/${id}/publish-queue/${aid}/claim`),
  unclaimPublish: (id: string, aid: string) =>
    api.post<Approval>(`/groups/${id}/publish-queue/${aid}/unclaim`),
  /** Per-platform outcome (link or failure reason); merges by platform, then settles the status. */
  reportPublish: (id: string, aid: string, results: PublishResultIn[]) =>
    api.post<Approval>(`/groups/${id}/publish-queue/${aid}/results`, { results }),

  // ---- discovery -----------------------------------------------------------
  discover: (q = '') =>
    api.get<Paged<Group> | Group[]>('/groups/discover', { ...SOFT, params: q ? { q } : undefined }),
};
