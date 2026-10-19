import { groupsApi } from '../../api/groups';
import { notesApi } from '../../api/notes';
import type { Note, NoteDetail } from '../../api/types';
import { childKey, groupExpandKey, noteOwner, ownerKey, USER_OWNER, useNotesStore } from '../notes';

// vi.mock is hoisted above the imports by vitest.
vi.mock('../../api/notes', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    notesApi: { ...(actual.notesApi as object), children: vi.fn(), get: vi.fn() },
  };
});
vi.mock('../../api/groups', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, groupsApi: { ...(actual.groupsApi as object), notes: vi.fn() } };
});

const note = (id: string, title: string, extra: Partial<Note> = {}): Note => ({
  id,
  title,
  parent_id: null,
  owner_type: 'user',
  owner_id: 'u1',
  pinned: false,
  has_children: false,
  sort_key: title,
  version: 1,
  word_count: 0,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  tags: [],
  ...extra,
});
const groupNote = (id: string, title: string, extra: Partial<Note> = {}) =>
  note(id, title, { owner_type: 'group', owner_id: 'g1', ...extra });

const G1 = { type: 'group', id: 'g1' } as const;

beforeEach(() => {
  useNotesStore.getState().reset();
  useNotesStore.setState({ expandedKeys: [], error: null });
  vi.mocked(notesApi.children).mockReset();
  vi.mocked(notesApi.get).mockReset();
  vi.mocked(groupsApi.notes).mockReset();
});

describe('owner keys', () => {
  it('derives bucket keys per owner', () => {
    expect(ownerKey(USER_OWNER)).toBe('user');
    expect(ownerKey(G1)).toBe('group:g1');
    expect(childKey(USER_OWNER, null)).toBe('user/__root__');
    expect(childKey(G1, 'p')).toBe('group:g1/p');
    expect(noteOwner(groupNote('x', 'x'))).toEqual(G1);
    expect(noteOwner(note('x', 'x'))).toEqual(USER_OWNER);
  });
});

describe('upsert buckets by owner', () => {
  it('puts personal and group notes into separate root buckets', () => {
    const s = useNotesStore.getState();
    s.upsert(note('a', '甲'));
    s.upsert(groupNote('g', '群'));
    const st = useNotesStore.getState();
    expect(st.children['user/__root__']).toEqual(['a']);
    expect(st.children['group:g1/__root__']).toEqual(['g']);
    expect(st.byId.g.owner_type).toBe('group');
  });

  it('nests under the parent inside the same owner bucket and flags has_children', () => {
    const s = useNotesStore.getState();
    s.upsert(groupNote('p', '父'));
    s.upsert(groupNote('c', '子', { parent_id: 'p' }));
    const st = useNotesStore.getState();
    expect(st.children['group:g1/p']).toEqual(['c']);
    expect(st.byId.p.has_children).toBe(true);
  });
});

describe('loadChildren per owner', () => {
  it('fetches group roots through /groups/{id}/notes and personal roots through /notes', async () => {
    vi.mocked(groupsApi.notes).mockResolvedValue({
      items: [groupNote('g', '群')],
      next_cursor: 'c2',
    } as never);
    vi.mocked(notesApi.children).mockResolvedValue({ items: [note('a', '甲')], next_cursor: null });
    await useNotesStore.getState().loadChildren(null, G1);
    await useNotesStore.getState().loadChildren(null);
    expect(groupsApi.notes).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ parent_id: 'root', limit: 200 }),
    );
    expect(notesApi.children).toHaveBeenCalledWith(null, undefined);
    const st = useNotesStore.getState();
    expect(st.children['group:g1/__root__']).toEqual(['g']);
    expect(st.cursors['group:g1/__root__']).toBe('c2');
    expect(st.loaded['user/__root__']).toBe(true);
    expect(st.children['user/__root__']).toEqual(['a']);
  });

  it('loadMore appends the next page into the same bucket', async () => {
    vi.mocked(groupsApi.notes)
      .mockResolvedValueOnce({ items: [groupNote('b', '乙')], next_cursor: 'c2' } as never)
      .mockResolvedValueOnce({ items: [groupNote('a', '甲')], next_cursor: null } as never);
    await useNotesStore.getState().loadChildren(null, G1);
    await useNotesStore.getState().loadMore(null, G1);
    expect(groupsApi.notes).toHaveBeenLastCalledWith(
      'g1',
      expect.objectContaining({ cursor: 'c2' }),
    );
    const st = useNotesStore.getState();
    expect(st.children['group:g1/__root__']).toEqual(['a', 'b']);
    expect(st.cursors['group:g1/__root__']).toBeNull();
  });
});

describe('reveal', () => {
  it('loads each ancestor level of a group note and expands the chain plus the group root', async () => {
    const detail: NoteDetail = {
      ...groupNote('leaf', '叶', { parent_id: 'mid' }),
      ancestors: [
        { id: 'top', title: '顶' },
        { id: 'mid', title: '中' },
      ],
      children_count: 0,
    };
    vi.mocked(notesApi.get).mockResolvedValue(detail);
    vi.mocked(groupsApi.notes).mockImplementation(async (_gid, params) => {
      const pid = params?.parent_id;
      if (pid === 'root')
        return {
          items: [groupNote('top', '顶', { has_children: true })],
          next_cursor: null,
        } as never;
      if (pid === 'top')
        return {
          items: [groupNote('mid', '中', { has_children: true, parent_id: 'top' })],
          next_cursor: null,
        } as never;
      if (pid === 'mid')
        return {
          items: [groupNote('leaf', '叶', { parent_id: 'mid' })],
          next_cursor: null,
        } as never;
      return { items: [], next_cursor: null } as never;
    });

    const got = await useNotesStore.getState().reveal('leaf');
    expect(got?.id).toBe('leaf');
    const st = useNotesStore.getState();
    expect(st.loaded['group:g1/__root__']).toBe(true);
    expect(st.loaded['group:g1/top']).toBe(true);
    expect(st.loaded['group:g1/mid']).toBe(true);
    expect(st.expandedKeys).toEqual(expect.arrayContaining([groupExpandKey('g1'), 'top', 'mid']));
    expect(notesApi.children).not.toHaveBeenCalled();
  });

  it('uses the in-memory chain when every ancestor is already known', async () => {
    const s = useNotesStore.getState();
    s.upsert(note('top', '顶', { has_children: true }));
    s.upsert(note('leaf', '叶', { parent_id: 'top' }));
    vi.mocked(notesApi.children).mockResolvedValue({ items: [], next_cursor: null });
    const got = await useNotesStore.getState().reveal('leaf');
    expect(got?.id).toBe('leaf');
    expect(notesApi.get).not.toHaveBeenCalled();
    expect(useNotesStore.getState().expandedKeys).toEqual(['top']);
  });
});

describe('moveLocal', () => {
  it('re-parents within a tree without dropping selection/focus', () => {
    const s = useNotesStore.getState();
    s.upsert(note('a', '甲'));
    s.upsert(note('b', '乙'));
    s.setSelected(['a']);
    s.setFocused('a');
    useNotesStore.getState().moveLocal('a', 'b');
    const st = useNotesStore.getState();
    expect(st.children['user/__root__']).toEqual(['b']);
    expect(st.children['user/b']).toEqual(['a']);
    expect(st.selectedKeys).toEqual(['a']);
    expect(st.focusedId).toBe('a');
  });

  it('moves a subtree into another tree: owner fields change and the old cached subtree is dropped', () => {
    const s = useNotesStore.getState();
    s.upsert(note('p', '父', { has_children: true }));
    s.upsert(note('c', '子', { parent_id: 'p' }));
    useNotesStore.setState((st) => ({ loaded: { ...st.loaded, 'user/p': true } }));
    useNotesStore.getState().moveLocal('p', null, G1);
    const st = useNotesStore.getState();
    expect(st.children['user/__root__']).toEqual([]);
    expect(st.children['group:g1/__root__']).toEqual(['p']);
    expect(st.byId.p.owner_type).toBe('group');
    expect(st.byId.p.owner_id).toBe('g1');
    expect(st.byId.c).toBeUndefined();
    expect(st.children['user/p']).toBeUndefined();
    expect(st.loaded['group:g1/p']).toBeUndefined();
  });
});

describe('remove / invalidate', () => {
  it('clears has_children when the last loaded child is removed', () => {
    const s = useNotesStore.getState();
    s.upsert(groupNote('p', '父'));
    s.upsert(groupNote('c', '子', { parent_id: 'p' }));
    useNotesStore.setState((st) => ({ loaded: { ...st.loaded, 'group:g1/p': true } }));
    useNotesStore.getState().remove('c');
    expect(useNotesStore.getState().byId.p.has_children).toBe(false);
  });

  it('invalidate infers the owner from the parent note', () => {
    const s = useNotesStore.getState();
    s.upsert(groupNote('p', '父'));
    useNotesStore.setState((st) => ({
      loaded: { ...st.loaded, 'group:g1/p': true, 'user/__root__': true },
    }));
    useNotesStore.getState().invalidate('p');
    useNotesStore.getState().invalidate(null);
    const st = useNotesStore.getState();
    expect(st.loaded['group:g1/p']).toBe(false);
    expect(st.loaded['user/__root__']).toBe(false);
  });
});
