import type { NoteDetail, NotePublishState } from '../api/types';
import { isApprover, isEditor, mustRequestPublish, normalizePublishPolicy } from '../utils/roles';

/** `publish`: straight to the blog · `request`: submit for approval (r4 §A) · `none`: not allowed. */
export type PublishMode = 'publish' | 'request' | 'none';

export interface PublishModeInfo {
  mode: PublishMode;
  state: NotePublishState | null;
  /** A request is waiting for review — the editor shows 「审批中」 and no second submit. */
  pending: boolean;
  /** The last request was rejected — show the reason, allow 重新提交. */
  rejected: boolean;
}

/**
 * Decide how the publish button behaves for `note`. The server's `can.request_publish` wins;
 * before the backend sends it, the group's `publish_policy` and my role decide.
 */
export function publishMode(
  note: Pick<NoteDetail, 'owner_type' | 'my_role' | 'can' | 'publish_state'>,
  policy?: string | null,
): PublishModeInfo {
  const state = note.publish_state ?? null;
  const pending = state?.status === 'pending';
  const rejected = state?.status === 'rejected';
  const canPublish = note.can?.publish !== false;
  if (note.owner_type !== 'group')
    return { mode: canPublish ? 'publish' : 'none', state, pending, rejected };

  const role = note.my_role ?? null;
  const approvalFlow = normalizePublishPolicy(policy) === 'approval' && !isApprover(role);
  const flag = note.can?.request_publish;
  const canRequest =
    flag != null
      ? flag
      : policy != null
        ? mustRequestPublish(policy, role)
        : isEditor(role) && !canPublish;
  if (canRequest && (!canPublish || approvalFlow))
    return { mode: 'request', state, pending, rejected };
  return { mode: canPublish ? 'publish' : 'none', state, pending, rejected };
}
