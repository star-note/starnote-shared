import { create } from 'zustand';

import { groupsApi } from '../api/groups';
import { asItems, notesApi } from '../api/notes';
import type { Note } from '../api/types';
import { sortNotes } from '../utils/collator';

export const ROOT = '__root__';
const EXPANDED_KEY = 'sn.tree.expanded';

/** Which tree a note lives in: the personal tree or one group's tree. */
export type Owner = { type: 'user' } | { type: 'group'; id: string };
export const USER_OWNER: Owner = { type: 'user' };

/** Bucket id for an owner: `user` or `group:<id>`. */
export function ownerKey(owner: Owner): string {
  return owner.type === 'user' ? 'user' : `group:${owner.id}`;
}
/** Key of a children/loaded/loading/cursors bucket: `<ownerKey>/<parentId|__root__>`. */
export function childKey(owner: Owner, parentId: string | null | undefined): string {
  return `${ownerKey(owner)}/${parentId ?? ROOT}`;
}
export function noteOwner(note: Pick<Note, 'owner_type' | 'owner_id'>): Owner {
  return note.owner_type === 'group' ? { type: 'group', id: note.owner_id } : USER_OWNER;
}
export function sameOwner(a: Owner, b: Owner): boolean {
  return ownerKey(a) === ownerKey(b);
}
/** `expandedKeys` entry that stands for a group's root row in the sidebar. */
export function groupExpandKey(groupId: string): string {
  return `group:${groupId}`;
}

function readExpanded(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(EXPANDED_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeExpanded(keys: string[]) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(keys.slice(0, 2000)));
  } catch {
    /* storage unavailable: expansion is session-only */
  }
}

async function fetchChildren(owner: Owner, parentId: string | null, cursor?: string) {
  if (owner.type === 'group') {
    return groupsApi.notes(owner.id, {
      parent_id: parentId ?? 'root',
      limit: 200,
      cursor: cursor || undefined,
    });
  }
  return notesApi.children(parentId, cursor);
}

interface NotesState {
  /** childKey(owner, parentId) → ordered child ids */
  children: Record<string, string[]>;
  byId: Record<string, Note>;
  loaded: Record<string, boolean>;
  loading: Record<string, boolean>;
  /** childKey → next page cursor (null/undefined when exhausted) */
  cursors: Record<string, string | null>;
  error: string | null;
  /** Expanded note ids, plus `group:<id>` for expanded group roots (ids are globally unique). */
  expandedKeys: string[];
  selectedKeys: string[];
  /** Keyboard focus inside the trees (independent of selection). */
  focusedId: string | null;
  /** Node currently in inline-rename mode. */
  renamingId: string | null;
  setRenaming(id: string | null): void;
  setExpanded(keys: string[]): void;
  toggleExpanded(id: string, open?: boolean): void;
  setSelected(keys: string[]): void;
  setFocused(id: string | null): void;
  loadChildren(parentId: string | null, owner?: Owner, force?: boolean): Promise<Note[]>;
  loadMore(parentId: string | null, owner?: Owner): Promise<void>;
  /** Make `id` visible: fetch its ancestors if needed, load + expand each level (and its group root). */
  reveal(id: string): Promise<Note | null>;
  upsert(note: Note): void;
  remove(id: string): void;
  rename(id: string, title: string): void;
  /** Re-parent locally; with `owner` the note (and its cached subtree) changes tree. */
  moveLocal(id: string, parentId: string | null, owner?: Owner): void;
  /** Mark a level stale; owner defaults to the parent note's owner (personal root when unknown). */
  invalidate(parentId: string | null, owner?: Owner): void;
  reset(): void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  children: {},
  byId: {},
  loaded: {},
  loading: {},
  cursors: {},
  error: null,
  expandedKeys: readExpanded(),
  selectedKeys: [],
  focusedId: null,
  renamingId: null,
  setRenaming: (renamingId) => set({ renamingId }),
  setExpanded: (keys) => {
    writeExpanded(keys);
    set({ expandedKeys: keys });
  },
  toggleExpanded(id, open) {
    const { expandedKeys, setExpanded } = get();
    const isOpen = expandedKeys.includes(id);
    const next = open ?? !isOpen;
    if (next === isOpen) return;
    setExpanded(next ? [...expandedKeys, id] : expandedKeys.filter((k) => k !== id));
  },
  setSelected: (keys) => set({ selectedKeys: keys }),
  setFocused: (focusedId) => set({ focusedId }),
  async loadChildren(parentId, owner = USER_OWNER, force = false) {
    const key = childKey(owner, parentId);
    const { loaded, loading } = get();
    if (!force && (loaded[key] || loading[key])) {
      return (
        get()
          .children[key]?.map((id) => get().byId[id])
          .filter(Boolean) ?? []
      );
    }
    set((s) => ({ loading: { ...s.loading, [key]: true }, error: null }));
    try {
      const res = await fetchChildren(owner, parentId);
      const items = asItems(res);
      const cursor = Array.isArray(res)
        ? null
        : ((res as { next_cursor?: string | null }).next_cursor ?? null);
      set((s) => {
        const byId = { ...s.byId };
        items.forEach((n) => (byId[n.id] = { ...byId[n.id], ...n }));
        return {
          byId,
          children: { ...s.children, [key]: sortNotes(items).map((n) => n.id) },
          cursors: { ...s.cursors, [key]: cursor },
          loaded: { ...s.loaded, [key]: true },
          loading: { ...s.loading, [key]: false },
        };
      });
      return items;
    } catch (e) {
      set((s) => ({
        loading: { ...s.loading, [key]: false },
        error: (e as { message?: string })?.message ?? '加载失败',
      }));
      throw e;
    }
  },
  async loadMore(parentId, owner = USER_OWNER) {
    const key = childKey(owner, parentId);
    const cursor = get().cursors[key];
    if (!cursor || get().loading[key]) return;
    set((s) => ({ loading: { ...s.loading, [key]: true } }));
    try {
      const res = await fetchChildren(owner, parentId, cursor);
      const items = asItems(res);
      const next = Array.isArray(res)
        ? null
        : ((res as { next_cursor?: string | null }).next_cursor ?? null);
      set((s) => {
        const byId = { ...s.byId };
        items.forEach((n) => (byId[n.id] = { ...byId[n.id], ...n }));
        const ids = new Set([...(s.children[key] ?? []), ...items.map((n) => n.id)]);
        const sorted = sortNotes([...ids].map((id) => byId[id]).filter(Boolean)).map((n) => n.id);
        return {
          byId,
          children: { ...s.children, [key]: sorted },
          cursors: { ...s.cursors, [key]: next },
          loading: { ...s.loading, [key]: false },
        };
      });
    } catch (e) {
      set((s) => ({ loading: { ...s.loading, [key]: false } }));
      throw e;
    }
  },
  async reveal(id) {
    const known = get().byId[id];
    // Fast path: every ancestor already in memory.
    const chain: string[] = [];
    let cur: Note | undefined = known;
    let complete = Boolean(known);
    while (cur?.parent_id) {
      const parent: Note | undefined = get().byId[cur.parent_id];
      if (!parent) {
        complete = false;
        break;
      }
      chain.unshift(parent.id);
      cur = parent;
    }
    let note: Note | null = known ?? null;
    if (!complete) {
      try {
        const detail = await notesApi.get(id);
        note = detail;
        chain.length = 0;
        detail.ancestors.forEach((a) => chain.push(a.id));
      } catch {
        return null;
      }
    }
    if (!note) return null;
    const owner = noteOwner(note);
    // Load each level top-down so the path to the note exists in the flat store.
    let parentId: string | null = null;
    for (const ancestorId of [...chain, null]) {
      try {
        await get().loadChildren(parentId, owner);
      } catch {
        return note;
      }
      if (ancestorId) parentId = ancestorId;
    }
    get().upsert(note);
    const { expandedKeys, setExpanded } = get();
    const wanted = owner.type === 'group' ? [groupExpandKey(owner.id), ...chain] : chain;
    const missing = wanted.filter((k) => !expandedKeys.includes(k));
    if (missing.length) setExpanded([...expandedKeys, ...missing]);
    return note;
  },
  upsert(note) {
    set((s) => {
      const key = childKey(noteOwner(note), note.parent_id);
      const existing = s.children[key] ?? [];
      const ids = existing.includes(note.id) ? existing : [...existing, note.id];
      const prev = s.byId[note.id];
      const byId = { ...s.byId, [note.id]: { ...prev, ...note } };
      // Keep a detail-fetched `content` if the incoming list item lacks it.
      if (prev?.content && note.content === undefined) byId[note.id].content = prev.content;
      const parent = note.parent_id ? byId[note.parent_id] : null;
      if (parent && !parent.has_children) byId[parent.id] = { ...parent, has_children: true };
      const sorted = sortNotes(ids.map((id) => byId[id]).filter(Boolean)).map((n) => n.id);
      return { byId, children: { ...s.children, [key]: sorted } };
    });
  },
  remove(id) {
    set((s) => {
      const note = s.byId[id];
      if (!note) return s;
      const key = childKey(noteOwner(note), note.parent_id);
      const rest = (s.children[key] ?? []).filter((x) => x !== id);
      const children = { ...s.children, [key]: rest };
      const byId = { ...s.byId };
      delete byId[id];
      const parent = note.parent_id ? byId[note.parent_id] : null;
      if (parent && rest.length === 0 && s.loaded[key] && !s.cursors[key]) {
        byId[parent.id] = { ...parent, has_children: false };
      }
      return {
        byId,
        children,
        selectedKeys: s.selectedKeys.filter((k) => k !== id),
        focusedId: s.focusedId === id ? null : s.focusedId,
      };
    });
  },
  rename(id, title) {
    set((s) => {
      const note = s.byId[id];
      if (!note) return s;
      const byId = { ...s.byId, [id]: { ...note, title } };
      const key = childKey(noteOwner(note), note.parent_id);
      const sorted = sortNotes((s.children[key] ?? []).map((x) => byId[x]).filter(Boolean)).map(
        (n) => n.id,
      );
      return { byId, children: { ...s.children, [key]: sorted } };
    });
  },
  moveLocal(id, parentId, owner) {
    const note = get().byId[id];
    if (!note) return;
    const from = noteOwner(note);
    const to = owner ?? (parentId ? noteOwner(get().byId[parentId] ?? note) : from);
    // Re-parent without touching selection/focus (unlike `remove`).
    const { selectedKeys, focusedId } = get();
    get().remove(id);
    set({ selectedKeys, focusedId });
    if (!sameOwner(from, to)) {
      // The cached subtree belongs to the old tree: drop it so the new tree lazily reloads it.
      set((s) => {
        const byId = { ...s.byId };
        const children = { ...s.children };
        const loaded = { ...s.loaded };
        const stack = [id];
        while (stack.length) {
          const cur = stack.pop()!;
          const k = childKey(from, cur);
          (children[k] ?? []).forEach((c) => {
            stack.push(c);
            delete byId[c];
          });
          delete children[k];
          delete loaded[k];
        }
        return { byId, children, loaded };
      });
    }
    const moved: Note =
      to.type === 'group'
        ? { ...note, parent_id: parentId, owner_type: 'group', owner_id: to.id }
        : {
            ...note,
            parent_id: parentId,
            owner_type: 'user',
            owner_id: note.owner_type === 'user' ? note.owner_id : '',
          };
    get().upsert(moved);
  },
  invalidate(parentId, owner) {
    const o =
      owner ??
      (parentId
        ? noteOwner(get().byId[parentId] ?? { owner_type: 'user', owner_id: '' })
        : USER_OWNER);
    const key = childKey(o, parentId);
    set((s) => ({ loaded: { ...s.loaded, [key]: false } }));
  },
  reset: () =>
    set({
      children: {},
      byId: {},
      loaded: {},
      loading: {},
      cursors: {},
      selectedKeys: [],
      focusedId: null,
    }),
}));

export const selectChildren =
  (parentId: string | null, owner: Owner = USER_OWNER) =>
  (s: NotesState) =>
    (s.children[childKey(owner, parentId)] ?? []).map((id) => s.byId[id]).filter(Boolean);
