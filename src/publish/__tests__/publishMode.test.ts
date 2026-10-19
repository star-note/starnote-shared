import { publishMode } from '../publishMode';

const can = (
  over: Partial<{
    edit: boolean;
    delete: boolean;
    publish: boolean;
    comment: boolean;
    request_publish: boolean;
    approve: boolean;
  }> = {},
) => ({ edit: true, delete: true, publish: true, comment: true, ...over });

describe('publishMode (r4 §A editor button)', () => {
  it('personal notes always publish', () => {
    expect(publishMode({ owner_type: 'user', my_role: 'owner', can: can() }).mode).toBe('publish');
  });

  it('follows the server flags when present', () => {
    expect(
      publishMode(
        {
          owner_type: 'group',
          my_role: 'editor',
          can: can({ publish: false, request_publish: true }),
        },
        'approval',
      ).mode,
    ).toBe('request');
    expect(
      publishMode(
        {
          owner_type: 'group',
          my_role: 'approver',
          can: can({ publish: true, request_publish: false }),
        },
        'approval',
      ).mode,
    ).toBe('publish');
    expect(
      publishMode(
        {
          owner_type: 'group',
          my_role: 'viewer',
          can: can({ edit: false, publish: false, request_publish: false }),
        },
        'approval',
      ).mode,
    ).toBe('none');
    // Flags beat an unknown policy (group not loaded yet).
    expect(
      publishMode({
        owner_type: 'group',
        my_role: 'editor',
        can: can({ publish: false, request_publish: true }),
      }).mode,
    ).toBe('request');
  });

  it('falls back to the group policy + my role before the backend sends request_publish', () => {
    expect(
      publishMode({ owner_type: 'group', my_role: 'editor', can: can() }, 'approval').mode,
    ).toBe('request');
    expect(publishMode({ owner_type: 'group', my_role: 'editor', can: can() }, 'direct').mode).toBe(
      'publish',
    );
    expect(
      publishMode({ owner_type: 'group', my_role: 'admin', can: can() }, 'approval').mode,
    ).toBe('publish');
    expect(publishMode({ owner_type: 'group', my_role: 'editor', can: can() }, 'admin').mode).toBe(
      'request',
    );
    expect(
      publishMode(
        { owner_type: 'group', my_role: 'viewer', can: can({ publish: false }) },
        'approval',
      ).mode,
    ).toBe('none');
  });

  it('reports the pending / rejected request state', () => {
    const base = {
      owner_type: 'group' as const,
      my_role: 'editor' as const,
      can: can({ publish: false, request_publish: true }),
    };
    expect(
      publishMode(
        { ...base, publish_state: { approval_id: 'a', status: 'pending', created_at: 't' } },
        'approval',
      ),
    ).toMatchObject({ mode: 'request', pending: true, rejected: false });
    expect(
      publishMode(
        {
          ...base,
          publish_state: { approval_id: 'a', status: 'rejected', reason: '太短', created_at: 't' },
        },
        'approval',
      ),
    ).toMatchObject({ pending: false, rejected: true });
    expect(publishMode({ ...base, publish_state: null }, 'approval')).toMatchObject({
      pending: false,
      rejected: false,
      state: null,
    });
  });
});
