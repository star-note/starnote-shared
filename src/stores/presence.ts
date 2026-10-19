import { create } from 'zustand';

import type { Lock, NoteAccessCan, Peer, SocketStatus, UserBrief } from '../api/ws';

/**
 * Who else has the open note, the edit lock and the socket state (SPEC-r2-collaboration §3.8).
 * Fed by `useNotePresence`; components read it through the selectors below.
 */
export type CollabMode = 'lock' | 'yjs';

export interface PresenceUser {
  user: UserBrief;
  color: string;
  typing: boolean;
  clientIds: string[];
}

export type LockView =
  | { kind: 'none' }
  | { kind: 'mine' }
  /** Someone else holds it. `sameUser` = it is me in another tab. */
  | { kind: 'other'; lock: Lock; sameUser: boolean };

export interface PresenceState {
  noteId: string | null;
  status: SocketStatus;
  clientId: string;
  /** Granted by the server's welcome / subprotocol; null until the first welcome. */
  mode: CollabMode | null;
  me: { user: UserBrief & { color?: string }; role: string | null; can: NoteAccessCan } | null;
  peers: Record<string, Peer>;
  lock: Lock | null;
  /** Yjs: the first sync round with the server completed (the editor may accept input). */
  synced: boolean;
  /** The lock was taken from this tab (banner 「xx 已接管编辑」 until the next own edit / acquire). */
  takenOverBy: UserBrief | null;
  /** 「申请编辑」 from another member while this tab holds the lock. */
  requestedBy: Peer | null;
  /** The last `note.updated` by someone else (conflict dialog copy). */
  lastUpdatedBy: { version: number; updated_at: string; updated_by: UserBrief } | null;
  reset(noteId: string | null, clientId?: string): void;
  set(patch: Partial<PresenceState>): void;
  upsertPeer(peer: Peer): void;
  removePeer(clientId: string): void;
  patchPeer(clientId: string, patch: Partial<Peer>): void;
}

const initial = {
  noteId: null,
  status: 'offline' as SocketStatus,
  clientId: '',
  mode: null,
  me: null,
  peers: {},
  lock: null,
  synced: false,
  takenOverBy: null,
  requestedBy: null,
  lastUpdatedBy: null,
};

export const usePresenceStore = create<PresenceState>((set) => ({
  ...initial,
  reset: (noteId, clientId = '') => set({ ...initial, noteId, clientId }),
  set: (patch) => set(patch),
  upsertPeer: (peer) => set((s) => ({ peers: { ...s.peers, [peer.client_id]: peer } })),
  removePeer: (clientId) =>
    set((s) => {
      if (!(clientId in s.peers)) return s;
      const peers = { ...s.peers };
      delete peers[clientId];
      return { peers };
    }),
  patchPeer: (clientId, patch) =>
    set((s) =>
      s.peers[clientId]
        ? { peers: { ...s.peers, [clientId]: { ...s.peers[clientId], ...patch } } }
        : s,
    ),
}));

/** Other people on the note, one entry per user (several tabs of one person collapse), in join order. */
export function othersOf(s: Pick<PresenceState, 'peers' | 'clientId' | 'me'>): PresenceUser[] {
  const byUser = new Map<string, PresenceUser>();
  const peers = Object.values(s.peers).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  for (const p of peers) {
    if (p.client_id === s.clientId || p.user.id === s.me?.user.id) continue;
    const entry = byUser.get(p.user.id);
    if (entry) {
      entry.typing ||= p.typing;
      entry.clientIds.push(p.client_id);
    } else {
      byUser.set(p.user.id, {
        user: p.user,
        color: p.color,
        typing: p.typing,
        clientIds: [p.client_id],
      });
    }
  }
  return [...byUser.values()];
}

export function lockView(s: Pick<PresenceState, 'lock' | 'clientId' | 'me'>): LockView {
  const lock = s.lock;
  if (!lock) return { kind: 'none' };
  if (lock.client_id === s.clientId) return { kind: 'mine' };
  return { kind: 'other', lock, sameUser: Boolean(s.me && lock.user.id === s.me.user.id) };
}

/**
 * May this tab type right now? `canEdit` = the role allows editing (`note.can.edit`). Yjs mode: always (merging
 * makes the lock unnecessary) once synced; lock mode: unless another tab holds the lock.
 */
export function editableNow(
  s: Pick<PresenceState, 'lock' | 'clientId' | 'me' | 'mode' | 'synced'>,
  canEdit: boolean,
): boolean {
  if (!canEdit) return false;
  if (s.mode === 'yjs') return s.synced;
  return lockView(s).kind !== 'other';
}

/** 「张三 正在编辑」 / 「张三、李四 正在编辑」 / 「张三、李四 等 3 人正在编辑」 for whoever is typing. */
export function typingText(users: PresenceUser[]): string {
  const names = users.filter((u) => u.typing).map((u) => u.user.name);
  if (!names.length) return '';
  if (names.length > 2) return `${names.slice(0, 2).join('、')} 等 ${names.length} 人正在编辑`;
  return `${names.join('、')} 正在编辑`;
}
