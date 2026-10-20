import type { MeActivity } from '../../api/types';
import { describeActivity, sortActivity } from '../activity';

const actor = { id: 'u2', name: '阿明', handle: 'ming', avatar_url: null };
const group = { id: 'g1', name: '产品组' };

function row(over: Partial<MeActivity>): MeActivity {
  return {
    id: 'x',
    kind: 'note_edited',
    group,
    actor,
    note: { id: 'n1', title: '发布清单' },
    needs_me: false,
    created_at: '2026-10-09T02:00:00Z',
    ...over,
  };
}

describe('describeActivity (GET /me/activity → rail row)', () => {
  it('maps note kinds to a verb + note title, linking to the note', () => {
    expect(describeActivity(row({ kind: 'note_edited' }))).toEqual({
      verb: '编辑了',
      object: '发布清单',
      to: '/notes/n1',
      needsMe: false,
      todo: null,
    });
    expect(
      describeActivity(row({ kind: 'note_created', note: { id: 'n2', title: '' } })),
    ).toMatchObject({ verb: '新建了', object: '无标题', to: '/notes/n2' });
    expect(describeActivity(row({ kind: 'publish_approved' }))).toMatchObject({
      verb: '通过了发布',
      object: '发布清单',
    });
    expect(describeActivity(row({ kind: 'publish_rejected' }))).toMatchObject({
      verb: '驳回了发布',
    });
  });

  it('maps group trash events: deleted / purged go to the group trash, a restore to the note', () => {
    expect(describeActivity(row({ kind: 'note_trashed' }))).toMatchObject({
      verb: '删除了',
      object: '发布清单',
      to: '/trash?scope=group:g1',
    });
    expect(describeActivity(row({ kind: 'note_purged' }))).toMatchObject({
      verb: '彻底删除了',
      to: '/trash?scope=group:g1',
    });
    expect(describeActivity(row({ kind: 'note_restored' }))).toMatchObject({
      verb: '恢复了',
      to: '/notes/n1',
    });
  });

  it('sends items waiting for me to the group approvals tab and flags them', () => {
    expect(
      describeActivity(row({ kind: 'publish_requested', needs_me: true, approval_id: 'a1' })),
    ).toEqual({
      verb: '提交了发布申请',
      object: '发布清单',
      to: '/groups/g1?tab=approvals',
      needsMe: true,
      todo: '待你审批',
    });
    expect(describeActivity(row({ kind: 'join_requested', note: null, needs_me: true }))).toEqual({
      verb: '申请加入群组',
      object: null,
      to: '/groups/g1?tab=approvals',
      needsMe: true,
      todo: '待你审批',
    });
    // A request I cannot review still points at the queue, not a note.
    expect(describeActivity(row({ kind: 'join_requested', note: null }))).toMatchObject({
      to: '/groups/g1?tab=approvals',
      needsMe: false,
      todo: null,
    });
  });

  it('describes membership changes without a note object, linking to the group', () => {
    expect(describeActivity(row({ kind: 'member_joined', note: null }))).toEqual({
      verb: '加入了群组',
      object: null,
      to: '/groups/g1',
      needsMe: false,
      todo: null,
    });
    expect(
      describeActivity(row({ kind: 'role_changed', note: null, meta: { role: 'approver' } })),
    ).toMatchObject({ verb: '成为了审批', object: null, to: '/groups/g1' });
    expect(describeActivity(row({ kind: 'role_changed', note: null }))).toMatchObject({
      verb: '调整了角色',
    });
  });

  it('never drops an unknown kind', () => {
    expect(describeActivity(row({ kind: 'something_new' }))).toMatchObject({
      verb: '有新动态',
      object: '发布清单',
      to: '/notes/n1',
    });
  });

  it('sorts what needs me first, then newest first', () => {
    const items = [
      row({ id: 'a', created_at: '2026-10-09T03:00:00Z' }),
      row({ id: 'b', needs_me: true, created_at: '2026-10-09T01:00:00Z' }),
      row({ id: 'c', created_at: '2026-10-09T04:00:00Z' }),
    ];
    expect(sortActivity(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('「待发布」 rows (SPEC-r8-group-publisher)', () => {
  it('sends a 发布员 straight to the note with the queue item preloaded', () => {
    const d = describeActivity(
      row({ kind: 'publish_awaiting', approval_id: 'a1', needs_me: true, needs: 'publish', platforms: ['zhihu'] }),
    );
    expect(d).toEqual({
      verb: '通过了发布，等待发布员发布',
      object: '发布清单',
      to: '/notes/n1?queue=a1&group=g1',
      needsMe: true,
      todo: '待你发布',
    });
    // without a note: the group's 待发布 segment
    expect(describeActivity(row({ kind: 'publish_partial', note: null, approval_id: 'a1', needs_me: true, needs: 'publish' })).to).toBe(
      '/groups/g1?tab=approvals&section=queue',
    );
  });

  it('tells the submitter about the hand-off steps without asking them anything', () => {
    const d = describeActivity(row({ kind: 'publish_published', approval_id: 'a1', notify_me: true }));
    expect(d).toMatchObject({ verb: '发布到了外部平台', to: '/notes/n1', needsMe: false, todo: null });
    expect(describeActivity(row({ kind: 'publish_claimed' })).verb).toBe('领取了待发布');
  });
});
