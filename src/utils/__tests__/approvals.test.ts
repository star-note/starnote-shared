import type { Approval, JoinRequest } from '../../api/types';
import {
  APPROVAL_KIND_LABEL,
  APPROVAL_KINDS,
  APPROVAL_STATUS_LABEL,
  approvalHeadline,
  approvalRole,
  countAwaiting,
  countPending,
  externalPlatforms,
  joinRequestToApproval,
  planPlatforms,
  publishFacts,
  publishQueuePath,
  queueEditorPath,
  unpublishedPlatforms,
} from '../approvals';

const who = { id: 'u1', name: '小陆', handle: 'lu', avatar_url: null };

function approval(over: Partial<Approval>): Approval {
  return {
    id: 'a1',
    kind: 'publish',
    status: 'pending',
    requester: who,
    note: { id: 'n1', title: '周报' },
    payload: null,
    reason: null,
    reviewer: null,
    created_at: '2026-10-09T01:00:00Z',
    decided_at: null,
    can_review: true,
    ...over,
  };
}

describe('approval kinds and statuses', () => {
  it('names the three sections in order', () => {
    expect(APPROVAL_KINDS).toEqual(['publish', 'role', 'join']);
    expect(APPROVAL_KINDS.map((k) => APPROVAL_KIND_LABEL[k])).toEqual([
      '发布审批',
      '权限审批',
      '加入申请',
    ]);
    expect(APPROVAL_STATUS_LABEL).toEqual({
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回',
      cancelled: '已撤回',
      awaiting_publish: '待发布',
      publishing: '发布中',
      published: '已发布',
      partially_published: '部分发布',
    });
  });

  it('reads the publish plan and what is left for the 发布员 (SPEC-r8-group-publisher)', () => {
    const a = approval({
      id: 'a1',
      status: 'partially_published',
      note: { id: 'n1', title: '周报' },
      group: { id: 'g1', name: '组' },
      payload: {
        title: '周报',
        plan: {
          platforms: [
            { key: 'chenji', name: '辰记', fields: {} },
            { key: 'zhihu', fields: { title: '知乎标题' } },
            { key: 'devto', name: 'DEV', fields: {} },
          ],
        },
      },
      results: { zhihu: { status: 'published', url: 'https://zhuanlan.zhihu.com/p/1' }, devto: { status: 'failed', error: '令牌失效' } },
    });
    expect(planPlatforms(a).map((p) => [p.key, p.name])).toEqual([
      ['chenji', '辰记'],
      ['zhihu', 'zhihu'],
      ['devto', 'DEV'],
    ]);
    expect(externalPlatforms(a)).toEqual(['zhihu', 'devto']);
    expect(externalPlatforms({ ...a, external_platforms: ['zhihu'] })).toEqual(['zhihu']);
    expect(unpublishedPlatforms(a)).toEqual(['devto']);
    expect(queueEditorPath(a)).toBe('/notes/n1?queue=a1&group=g1');
    expect(queueEditorPath({ ...a, note: null })).toBeNull();
    expect(publishQueuePath('g1')).toBe('/groups/g1?tab=approvals&section=queue');
    expect(planPlatforms(approval({ payload: { title: 'x' } }))).toEqual([]);
    expect(countAwaiting([{ status: 'awaiting_publish' }, { status: 'publishing' }, { status: 'awaiting_publish' }])).toBe(2);
  });

  it('headlines each kind from its payload', () => {
    expect(approvalHeadline(approval({ payload: { title: '十月周报' } }))).toBe('发布《十月周报》');
    expect(approvalHeadline(approval({ payload: null }))).toBe('发布《周报》');
    expect(
      approvalHeadline(approval({ kind: 'role', note: null, payload: { role: 'approver' } })),
    ).toBe('申请成为审批');
    expect(
      approvalHeadline(approval({ kind: 'role', note: null, payload: { role: 'nope' } })),
    ).toBe('申请更高权限');
    expect(approvalHeadline(approval({ kind: 'join', note: null }))).toBe('申请加入群组');
    expect(approvalRole(approval({ payload: { role: 'editor' } }))).toBe('editor');
    expect(approvalRole(approval({ payload: {} }))).toBeNull();
  });

  it('lists publish facts only for what the payload carries', () => {
    expect(
      publishFacts(
        approval({
          payload: {
            summary: ' 本周三件事 ',
            category: { id: 'c', name: '工作' },
            visibility: 'password',
          },
        }),
      ),
    ).toEqual([
      { label: '摘要', value: '本周三件事' },
      { label: '分类', value: '工作' },
      { label: '可见性', value: '密码访问' },
    ]);
    expect(publishFacts(approval({ payload: { category_name: '随笔' } }))).toEqual([
      { label: '分类', value: '随笔' },
    ]);
    expect(publishFacts(approval({ payload: null }))).toEqual([]);
  });

  it('counts pending items I can review when the server sends no pending_counts', () => {
    const items = [
      approval({ id: '1', kind: 'publish' }),
      approval({ id: '2', kind: 'publish', can_review: false }),
      approval({ id: '3', kind: 'join', status: 'approved' }),
      approval({ id: '4', kind: 'role' }),
    ];
    expect(countPending(items)).toEqual({ publish: 1, role: 1, join: 0, total: 2 });
    expect(countPending(items, { publish: 3, role: 0, join: 1, total: 4 })).toEqual({
      publish: 3,
      role: 0,
      join: 1,
      total: 4,
    });
  });

  it('maps an r2 join request onto a kind=join approval', () => {
    const r: JoinRequest = {
      id: 'r1',
      user: who,
      message: '想一起写',
      status: 'pending',
      created_at: '2026-10-08T00:00:00Z',
    };
    expect(joinRequestToApproval(r, true)).toMatchObject({
      id: 'r1',
      kind: 'join',
      status: 'pending',
      requester: who,
      payload: { message: '想一起写' },
      can_review: true,
      legacy: true,
    });
    expect(joinRequestToApproval({ ...r, status: 'rejected', message: '' }, true)).toMatchObject({
      payload: null,
      can_review: false,
    });
  });
});
