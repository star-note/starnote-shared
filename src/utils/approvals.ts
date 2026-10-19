import { ROLE_LABEL } from './roles';
import { visibilityLabel } from './visibility';
import type {
  Approval,
  ApprovalKind,
  ApprovalStatus,
  GroupRole,
  JoinRequest,
  PendingCounts,
} from '../api/types';

/** The three sections of the 审批流 tab, in display order (r4 §A). */
export const APPROVAL_KINDS: ApprovalKind[] = ['publish', 'role', 'join'];

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  publish: '发布审批',
  role: '权限审批',
  join: '加入申请',
};

/** Verb used in list rows / toasts: 「xx 申请发布」「xx 申请成为编辑」「xx 申请加入」. */
export const APPROVAL_KIND_VERB: Record<ApprovalKind, string> = {
  publish: '申请发布',
  role: '申请权限',
  join: '申请加入',
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已撤回',
  awaiting_publish: '待发布',
  publishing: '发布中',
  published: '已发布',
  partially_published: '部分发布',
};

/* ---- 「待发布」 (SPEC-r8-group-publisher) ---- */

/** The 审批流 tab's 「待发布」 section. */
export function publishQueuePath(groupId: string): string {
  return `/groups/${groupId}?tab=approvals&section=queue`;
}

/** Straight to the note's 发布 panel with the approved plan preloaded (the 发布员's 「去发布」). */
export function queueEditorPath(a: { id: string; note: { id: string } | null; group?: { id: string } | null }, groupId?: string): string | null {
  const gid = a.group?.id ?? groupId;
  if (!a.note || !gid) return null;
  return `/notes/${a.note.id}?queue=${encodeURIComponent(a.id)}&group=${encodeURIComponent(gid)}`;
}

/** The plan's platforms of a publish request: `[{key, name, fields}]`, `[]` without a plan (辰记 only). */
export function planPlatforms(a: Pick<Approval, 'payload'>): { key: string; name: string; fields: Record<string, unknown> }[] {
  const list = a.payload?.plan?.platforms;
  if (!Array.isArray(list)) return [];
  return list
    .filter((p) => p && typeof p.key === 'string' && p.key)
    .map((p) => ({ key: p.key, name: typeof p.name === 'string' && p.name ? p.name : p.key, fields: p.fields ?? {} }));
}

/** The external platforms (besides 辰记) the 发布员 publishes, from the server field or the plan. */
export function externalPlatforms(a: Pick<Approval, 'payload' | 'external_platforms'>): string[] {
  if (Array.isArray(a.external_platforms)) return a.external_platforms;
  return planPlatforms(a).map((p) => p.key).filter((k) => k !== 'chenji');
}

/** Platforms of the plan still without a successful result (what a retry has to do). */
export function unpublishedPlatforms(a: Pick<Approval, 'payload' | 'external_platforms' | 'results'>): string[] {
  return externalPlatforms(a).filter((k) => a.results?.[k]?.status !== 'published');
}

/** The queue's segment counter: items waiting for a 发布员. */
export function countAwaiting(items: Pick<Approval, 'status'>[]): number {
  return items.filter((a) => a.status === 'awaiting_publish').length;
}

export function isApprovalKind(v: unknown): v is ApprovalKind {
  return v === 'publish' || v === 'role' || v === 'join';
}

/** The role a role / join request names, `null` when the payload carries none we know. */
export function approvalRole(a: Pick<Approval, 'payload'>): GroupRole | null {
  const r = a.payload?.role;
  return typeof r === 'string' && r in ROLE_LABEL ? (r as GroupRole) : null;
}

/** Category name out of the free-form payload (`{id,name}`, a bare name, or `category_name`). */
export function approvalCategoryName(a: Pick<Approval, 'payload'>): string {
  const p = a.payload;
  if (!p) return '';
  if (typeof p.category_name === 'string' && p.category_name) return p.category_name;
  const c = p.category;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && typeof c.name === 'string') return c.name;
  return '';
}

/** One-line description of what is being asked: the card title under the requester's name. */
export function approvalHeadline(a: Pick<Approval, 'kind' | 'note' | 'payload'>): string {
  if (a.kind === 'publish') return `发布《${a.payload?.title || a.note?.title || '无标题'}》`;
  if (a.kind === 'role') {
    const role = approvalRole(a);
    return role ? `申请成为${ROLE_LABEL[role]}` : '申请更高权限';
  }
  return '申请加入群组';
}

/** The publish request's facts for the card: 摘要 / 分类 / 可见性, omitting what the payload lacks. */
export function publishFacts(a: Pick<Approval, 'payload'>): { label: string; value: string }[] {
  const p = a.payload ?? {};
  const out: { label: string; value: string }[] = [];
  if (typeof p.summary === 'string' && p.summary.trim())
    out.push({ label: '摘要', value: p.summary.trim() });
  const cat = approvalCategoryName(a);
  if (cat) out.push({ label: '分类', value: cat });
  if (typeof p.visibility === 'string' && p.visibility)
    out.push({ label: '可见性', value: visibilityLabel(p.visibility) || p.visibility });
  return out;
}

/** Sum of a server `pending_counts`, or count the pending items myself when it is missing. */
export function countPending(items: Approval[], counts?: PendingCounts | null): PendingCounts {
  if (counts && typeof counts.total === 'number') return counts;
  const c: PendingCounts = { publish: 0, role: 0, join: 0, total: 0 };
  for (const a of items) {
    if (a.status !== 'pending' || !a.can_review) continue;
    c[a.kind] += 1;
    c.total += 1;
  }
  return c;
}

/** An r2 join request shaped as a `kind=join` approval, for the compatibility fallback. */
export function joinRequestToApproval(r: JoinRequest, canReview: boolean): Approval {
  return {
    id: r.id,
    kind: 'join',
    status: r.status,
    requester: r.user,
    note: null,
    payload: r.message ? { message: r.message } : null,
    reason: null,
    reviewer: null,
    created_at: r.created_at,
    decided_at: null,
    can_review: canReview && r.status === 'pending',
    legacy: true,
  };
}
