import type { GroupPublishPolicy, GroupRole } from '../api/types';

/** Higher rank = more power. `null` (non-member) ranks below everyone. */
export const ROLE_RANK: Record<GroupRole, number> = {
  owner: 5,
  admin: 4,
  approver: 3,
  editor: 2,
  viewer: 1,
};

export const ROLE_LABEL: Record<GroupRole, string> = {
  owner: '群主',
  admin: '管理员',
  approver: '审批',
  editor: '编辑',
  viewer: '只读',
};

export const ROLE_HINT: Record<GroupRole, string> = {
  owner: '转让 / 解散群组，设置管理员，审批一切',
  admin: '改资料、审批申请、邀请与管理成员',
  approver: '新建、修改笔记，审批发布',
  editor: '新建、修改、移动笔记，写评论',
  viewer: '只读笔记，可评论',
};

export const ROLES_DESC: GroupRole[] = ['owner', 'admin', 'approver', 'editor', 'viewer'];

export function rankOf(role: GroupRole | null | undefined): number {
  return role ? (ROLE_RANK[role] ?? 0) : 0;
}

/** `role` is at least `min` in the matrix. */
export function atLeast(role: GroupRole | null | undefined, min: GroupRole): boolean {
  return rankOf(role) >= ROLE_RANK[min];
}

export const isAdmin = (role: GroupRole | null | undefined) => atLeast(role, 'admin');
/** May review publish requests (r4 §A): approver and above. */
export const isApprover = (role: GroupRole | null | undefined) => atLeast(role, 'approver');
export const isEditor = (role: GroupRole | null | undefined) => atLeast(role, 'editor');
export const isOwner = (role: GroupRole | null | undefined) => role === 'owner';

/**
 * Roles I may hand out: strictly below my own, and only the owner may create
 * admins. Owner itself is never assignable here (that is a transfer).
 */
export function assignableRoles(me: GroupRole | null | undefined): GroupRole[] {
  if (!isAdmin(me)) return [];
  const mine = rankOf(me);
  return ROLES_DESC.filter(
    (r) => r !== 'owner' && ROLE_RANK[r] < mine && (r !== 'admin' || me === 'owner'),
  );
}

/** Roles a member may ask for (r4 §A `POST /groups/{id}/role-requests`): above my own, never owner. */
export function requestableRoles(
  me: GroupRole | null | undefined,
): Exclude<GroupRole, 'owner' | 'viewer'>[] {
  const mine = rankOf(me);
  return (['admin', 'approver', 'editor'] as const).filter((r) => ROLE_RANK[r] > mine);
}

/** May `me` change `target`'s role or remove them? Only members ranked below me, and never myself. */
export function canManageMember(
  me: GroupRole | null | undefined,
  target: GroupRole,
  isSelf = false,
): boolean {
  if (isSelf) return false;
  if (!isAdmin(me)) return false;
  return ROLE_RANK[target] < rankOf(me);
}

/**
 * r4 §A replaced r2's "lowest role that may publish" with `direct | approval`; the migration maps
 * `owner` / `admin` → `approval` and `editor` → `direct`. Unknown / missing → `direct`.
 */
export function normalizePublishPolicy(policy: string | null | undefined): GroupPublishPolicy {
  if (policy === 'approval' || policy === 'owner' || policy === 'admin') return 'approval';
  return 'direct';
}

/** May `role` publish a group note straight to a blog under `policy` (no request)? */
export function canPublishUnder(
  policy: string | null | undefined,
  role: GroupRole | null | undefined,
): boolean {
  return normalizePublishPolicy(policy) === 'approval' ? isApprover(role) : isEditor(role);
}

/** Must `role` go through a publish request under `policy`? Editors under `approval`; viewers never publish. */
export function mustRequestPublish(
  policy: string | null | undefined,
  role: GroupRole | null | undefined,
): boolean {
  return normalizePublishPolicy(policy) === 'approval' && isEditor(role) && !isApprover(role);
}

export const PUBLISH_POLICY_LABEL: Record<GroupPublishPolicy, string> = {
  direct: '直接发布',
  approval: '需要审批',
};

export const PUBLISH_POLICY_HINT: Record<GroupPublishPolicy, string> = {
  direct: '编辑及以上可以直接把群组笔记发布到群组博客',
  approval: '编辑提交后，由审批、管理员或群主通过才发布到群组博客',
};

/** SPEC-r6 §A: a group note always publishes to the group's own blog (never a member's). */
export const GROUP_BLOG_TARGET = '群组博客';

export const JOIN_POLICY_LABEL = {
  invite: '仅限邀请',
  approval: '申请后审批',
  open: '自由加入',
} as const;

export const VISIBILITY_LABEL = {
  private: '私密',
  public: '公开',
} as const;
