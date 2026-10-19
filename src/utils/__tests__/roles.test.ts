import {
  assignableRoles,
  atLeast,
  canManageMember,
  canPublishUnder,
  isAdmin,
  isApprover,
  mustRequestPublish,
  normalizePublishPolicy,
  PUBLISH_POLICY_LABEL,
  GROUP_BLOG_TARGET,
  rankOf,
  requestableRoles,
  ROLE_LABEL,
  ROLES_DESC,
} from '../roles';

describe('group role ranks (r4: five levels)', () => {
  it('orders owner > admin > approver > editor > viewer > none', () => {
    expect(rankOf('owner')).toBeGreaterThan(rankOf('admin'));
    expect(rankOf('admin')).toBeGreaterThan(rankOf('approver'));
    expect(rankOf('approver')).toBeGreaterThan(rankOf('editor'));
    expect(rankOf('editor')).toBeGreaterThan(rankOf('viewer'));
    expect(rankOf('viewer')).toBeGreaterThan(rankOf(null));
    expect(rankOf(undefined)).toBe(0);
    expect(ROLES_DESC).toEqual(['owner', 'admin', 'approver', 'editor', 'viewer']);
  });

  it('labels every role in the contract wording', () => {
    expect(ROLE_LABEL).toEqual({
      owner: '群主',
      admin: '管理员',
      approver: '审批',
      editor: '编辑',
      viewer: '只读',
    });
  });

  it('atLeast follows the matrix', () => {
    expect(atLeast('admin', 'editor')).toBe(true);
    expect(atLeast('editor', 'admin')).toBe(false);
    expect(atLeast('viewer', 'viewer')).toBe(true);
    expect(isAdmin('owner')).toBe(true);
    expect(isAdmin('approver')).toBe(false);
    expect(isApprover('approver')).toBe(true);
    expect(isApprover('admin')).toBe(true);
    expect(isApprover('editor')).toBe(false);
  });

  it('only the owner may hand out admin; nobody hands out owner; approvers hand out nothing', () => {
    expect(assignableRoles('owner')).toEqual(['admin', 'approver', 'editor', 'viewer']);
    expect(assignableRoles('admin')).toEqual(['approver', 'editor', 'viewer']);
    expect(assignableRoles('approver')).toEqual([]);
    expect(assignableRoles('editor')).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });

  it('a member may ask for any role above their own, never owner', () => {
    expect(requestableRoles('viewer')).toEqual(['admin', 'approver', 'editor']);
    expect(requestableRoles('editor')).toEqual(['admin', 'approver']);
    expect(requestableRoles('approver')).toEqual(['admin']);
    expect(requestableRoles('admin')).toEqual([]);
    expect(requestableRoles('owner')).toEqual([]);
  });

  it('members may only be managed by an admin ranked above them, never oneself', () => {
    expect(canManageMember('owner', 'admin')).toBe(true);
    expect(canManageMember('admin', 'admin')).toBe(false);
    expect(canManageMember('admin', 'approver')).toBe(true);
    expect(canManageMember('approver', 'editor')).toBe(false);
    expect(canManageMember('editor', 'viewer')).toBe(false);
    expect(canManageMember('owner', 'viewer', true)).toBe(false);
  });

  it('normalises r2 publish policies into direct | approval', () => {
    expect(normalizePublishPolicy('owner')).toBe('approval');
    expect(normalizePublishPolicy('admin')).toBe('approval');
    expect(normalizePublishPolicy('editor')).toBe('direct');
    expect(normalizePublishPolicy('approval')).toBe('approval');
    expect(normalizePublishPolicy('direct')).toBe('direct');
    expect(normalizePublishPolicy(undefined)).toBe('direct');
    expect(PUBLISH_POLICY_LABEL).toEqual({ direct: '直接发布', approval: '需要审批' });
    expect(GROUP_BLOG_TARGET).toBe('群组博客'); // SPEC-r6 §A: no submitter / owner choice any more
  });

  it('direct lets editor+ publish; approval lets approver+ publish and makes editors request', () => {
    expect(canPublishUnder('direct', 'editor')).toBe(true);
    expect(canPublishUnder('direct', 'viewer')).toBe(false);
    expect(canPublishUnder('approval', 'editor')).toBe(false);
    expect(canPublishUnder('approval', 'approver')).toBe(true);
    expect(canPublishUnder(undefined, 'editor')).toBe(true);
    expect(mustRequestPublish('approval', 'editor')).toBe(true);
    expect(mustRequestPublish('approval', 'approver')).toBe(false);
    expect(mustRequestPublish('approval', 'viewer')).toBe(false);
    expect(mustRequestPublish('direct', 'editor')).toBe(false);
  });
});
