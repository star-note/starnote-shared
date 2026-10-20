import { ROLE_LABEL } from './roles';
import type { MeActivity } from '../api/types';

/** What the home rail renders for one `GET /me/activity` row. */
export interface ActivityLine {
  /** The verb after the actor's name, e.g. 「提交了发布申请」. */
  verb: string;
  /** Title to show after the verb (the note), `null` when the kind has none. */
  object: string | null;
  /** Where the row goes: the group's 审批流 tab for review items, otherwise the note or the group. */
  to: string;
  /** The row needs me — highlight it and label it with `todo`. */
  needsMe: boolean;
  /** 待你审批 / 待你发布 (SPEC-r8-group-publisher), `null` when nothing waits for me. */
  todo: string | null;
}

const VERB: Record<string, string> = {
  note_created: '新建了',
  note_edited: '编辑了',
  publish_requested: '提交了发布申请',
  publish_approved: '通过了发布',
  publish_rejected: '驳回了发布',
  member_joined: '加入了群组',
  role_changed: '调整了角色',
  join_requested: '申请加入群组',
  note_trashed: '删除了',
  note_restored: '恢复了',
  note_purged: '彻底删除了',
  publish_awaiting: '通过了发布，等待发布员发布',
  publish_claimed: '领取了待发布',
  publish_published: '发布到了外部平台',
  publish_partial: '发布了部分平台',
};

/** Trash events of group notes go to that group's trash, except a restore (the note is back). */
const TRASH_KINDS = new Set(['note_trashed', 'note_purged']);

const APPROVAL_KINDS = new Set(['publish_requested', 'join_requested', 'role_requested']);

export function approvalsTabPath(groupId: string): string {
  return `/groups/${groupId}?tab=approvals`;
}

/** Pure mapping — tested on its own; unknown kinds fall back to a generic verb so nothing is dropped. */
export function describeActivity(a: MeActivity): ActivityLine {
  const needsMe = Boolean(a.needs_me);
  const noteTitle = a.note ? a.note.title || '无标题' : null;
  const toPublish = needsMe && a.needs === 'publish';
  const to = toPublish
    ? a.note && a.approval_id
      ? `/notes/${a.note.id}?queue=${encodeURIComponent(a.approval_id)}&group=${encodeURIComponent(a.group.id)}`
      : `/groups/${a.group.id}?tab=approvals&section=queue`
    : needsMe || (APPROVAL_KINDS.has(a.kind) && !a.note)
      ? approvalsTabPath(a.group.id)
      : TRASH_KINDS.has(a.kind)
        ? `/trash?scope=group:${a.group.id}`
        : a.note
          ? `/notes/${a.note.id}`
          : `/groups/${a.group.id}`;
  let verb = VERB[a.kind] ?? '有新动态';
  if (a.kind === 'role_changed') {
    const role = a.meta?.role;
    if (typeof role === 'string' && role in ROLE_LABEL)
      verb = `成为了${ROLE_LABEL[role as keyof typeof ROLE_LABEL]}`;
  }
  const object =
    a.kind === 'member_joined' || a.kind === 'join_requested' || a.kind === 'role_changed'
      ? null
      : noteTitle;
  const todo = needsMe ? (toPublish ? '待你发布' : '待你审批') : null;
  return { verb, object, to, needsMe, todo };
}

/** Items waiting for me first (newest first inside each half), so the rail leads with what needs doing. */
export function sortActivity(items: MeActivity[]): MeActivity[] {
  return [...items].sort((x, y) => {
    if (Boolean(x.needs_me) !== Boolean(y.needs_me)) return x.needs_me ? -1 : 1;
    return y.created_at.localeCompare(x.created_at);
  });
}
