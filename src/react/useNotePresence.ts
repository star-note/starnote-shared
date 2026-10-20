import { YSyncProvider } from 'ai-sparkwrite-editor';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';

import { NoteSocket, newClientId, type Peer, type ServerMessage, type UserBrief } from '../api/ws';
import { lockView, usePresenceStore } from '../stores/presence';

/**
 * Mounts the collaboration socket of the open note (SPEC-r2-collaboration §3.8 / §4.12).
 *
 * * Phase 1 (`mode: 'lock'`): presence, typing, cursor and the advisory edit lock — acquired on the first local
 *   input, 15 s heartbeats, released after 60 s without input; `note.updated` from other tabs / people.
 * * Phase 2 (`mode: 'yjs'`, group notes when the server grants `starnote.y.v1`): a `Y.Doc` per note synced through
 *   the SDK's `YSyncProvider` over the same socket; no lock.
 */
export const HEARTBEAT_MS = 15_000;
export const IDLE_RELEASE_MS = 60_000;
export const TYPING_OFF_MS = 2_000;

export type NoteUpdatedMsg = Extract<ServerMessage, { t: 'note.updated' }>;

export interface UseNotePresenceOptions {
  noteId: string;
  /** `/me.features.collab` (and the note is loaded). */
  enabled: boolean;
  /** Ask for Yjs: a group note while `/me.features.collab_yjs` is on. */
  wantYjs: boolean;
  me: { id: string; name: string; handle?: string; avatar_url?: string | null } | null;
  currentVersion(): number | undefined;
  /** `note.updated` written by someone else (or another tab). */
  onNoteUpdated?(msg: NoteUpdatedMsg): void;
  /** Our lock request was refused: undo the optimistic input, go read-only. */
  onLockDenied?(): void;
  /** Someone took the lock from this tab: save what we have. */
  onLockTaken?(by: UserBrief): void;
  /** This tab took the lock over: load the holder's last save before typing. */
  onTookOver?(): void;
  onLockRequested?(by: Peer): void;
  onError?(msg: { code: number; message: string }): void;
  /** No access any more / note gone / signed out. */
  onFatal?(code: number): void;
  /** The server refused Yjs updates (read-only member, document too large). */
  onYjsDenied?(reason: string): void;
}

export interface NotePresence {
  clientId: string;
  /** The Y document of a Yjs-mode note (null in lock mode); stable for the note's lifetime. */
  ydoc: Y.Doc | null;
  provider: YSyncProvider | null;
  /** Call on every local edit (body or title). */
  notifyInput(): void;
  acquireLock(reason?: 'edit' | 'takeover'): void;
  releaseLock(): void;
  requestLock(): void;
  sendCursor(anchor: number, head: number, title?: boolean): void;
  /** Yjs: ask the server to materialize now (before publishing); resolves with the note version. */
  flush(timeoutMs?: number): Promise<number | null>;
}

export function useNotePresence(opts: UseNotePresenceOptions): NotePresence {
  const { noteId, enabled, wantYjs } = opts;
  const latest = useRef(opts);
  latest.current = opts;

  const clientId = useMemo(() => newClientId(), []);
  // One Y.Doc + provider per note (kept across socket reconnects so offline edits survive).
  const y = useMemo(() => {
    if (!enabled || !wantYjs || !noteId) return null;
    const doc = new Y.Doc();
    const provider = new YSyncProvider(doc);
    return { doc, provider };
  }, [enabled, wantYjs, noteId]);

  const socketRef = useRef<NoteSocket | null>(null);
  const timers = useRef<{
    heartbeat?: ReturnType<typeof setInterval>;
    idle?: ReturnType<typeof setTimeout>;
    typing?: ReturnType<typeof setTimeout>;
  }>({});
  const acquiring = useRef(false);
  const typingOn = useRef(false);
  const flushWaiters = useRef<((v: number | null) => void)[]>([]);
  // StrictMode runs effects twice: the Y document outlives the first cleanup and is destroyed only when no effect
  // picked it up again (deferred by a tick).
  const pendingDestroy = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopHeartbeat = () => {
    if (timers.current.heartbeat) clearInterval(timers.current.heartbeat);
    if (timers.current.idle) clearTimeout(timers.current.idle);
    timers.current.heartbeat = timers.current.idle = undefined;
  };

  useEffect(() => {
    if (pendingDestroy.current) clearTimeout(pendingDestroy.current);
    pendingDestroy.current = null;
    const store = usePresenceStore.getState();
    store.reset(enabled ? noteId : null, clientId);
    if (!enabled || !noteId) return;

    const me = latest.current.me;
    if (y && me) {
      y.provider.awareness.setLocalStateField('user', {
        id: me.id,
        name: me.name,
        color: '#6918b4',
      });
    }
    const offSynced = y?.provider.on('synced', (synced) =>
      usePresenceStore.getState().set({ synced }),
    );
    const offDenied = y?.provider.on('denied', (reason) => latest.current.onYjsDenied?.(reason));

    const onMessage = (msg: ServerMessage) => {
      const s = usePresenceStore.getState();
      switch (msg.t) {
        case 'welcome': {
          const peers: Record<string, Peer> = {};
          msg.peers.forEach((p) => (peers[p.client_id] = p));
          s.set({ me: msg.me, peers, lock: msg.lock, mode: msg.features.yjs ? 'yjs' : 'lock' });
          if (msg.features.yjs && y) {
            const user = latest.current.me;
            y.provider.awareness.setLocalStateField('user', {
              id: msg.me.user.id,
              name: user?.name ?? msg.me.user.name,
              color: msg.me.user.color ?? '#6918b4',
            });
            y.provider.connect((data) => socketRef.current?.sendBinary(data));
          }
          // a reconnect while we still held the lock: try to keep it
          if (!msg.features.yjs && acquiring.current)
            socketRef.current?.send({ t: 'lock.acquire', reason: 'edit' });
          break;
        }
        case 'join':
          s.upsertPeer(msg.peer);
          break;
        case 'leave':
          s.removePeer(msg.peer.client_id);
          break;
        case 'cursor':
          s.patchPeer(msg.client_id, {
            cursor: { anchor: msg.anchor, head: msg.head, title: msg.title },
          });
          break;
        case 'typing':
          s.patchPeer(msg.client_id, { typing: msg.on });
          break;
        case 'lock': {
          const wasMine = lockView(s).kind === 'mine';
          if (msg.reason === 'denied') {
            acquiring.current = false;
            s.set({ lock: msg.lock });
            latest.current.onLockDenied?.();
            break;
          }
          s.set({ lock: msg.lock });
          const nowMine = Boolean(msg.lock && msg.lock.client_id === clientId);
          if (nowMine) {
            acquiring.current = false;
            s.set({ takenOverBy: null });
            if (!timers.current.heartbeat) {
              timers.current.heartbeat = setInterval(
                () => socketRef.current?.send({ t: 'lock.heartbeat' }),
                HEARTBEAT_MS,
              );
            }
            if (msg.reason === 'taken_over' && msg.by === clientId) latest.current.onTookOver?.();
          } else {
            stopHeartbeat();
            if (wasMine && msg.reason === 'taken_over' && msg.lock) {
              s.set({ takenOverBy: msg.lock.user, requestedBy: null });
              latest.current.onLockTaken?.(msg.lock.user);
            }
            if (!msg.lock) s.set({ requestedBy: null });
          }
          break;
        }
        case 'lock.requested':
          s.set({ requestedBy: msg.by });
          latest.current.onLockRequested?.(msg.by);
          break;
        case 'note.updated':
          if (msg.by_client && msg.by_client === clientId) break;
          s.set({
            lastUpdatedBy: {
              version: msg.version,
              updated_at: msg.updated_at,
              updated_by: msg.updated_by,
            },
          });
          latest.current.onNoteUpdated?.(msg);
          break;
        case 'flushed':
          flushWaiters.current.splice(0).forEach((resolve) => resolve(msg.version));
          break;
        case 'error':
          latest.current.onError?.(msg);
          break;
        default:
          break;
      }
    };

    const socket = new NoteSocket({
      noteId,
      clientId,
      yjs: Boolean(y),
      sinceVersion: () => latest.current.currentVersion(),
      onMessage,
      onBinary: (data) => y?.provider.receive(data),
      onStatus: (status) => {
        usePresenceStore.getState().set({ status });
        if (status === 'offline') {
          y?.provider.disconnect();
          stopHeartbeat();
          // offline: nobody's presence or lock is known any more; edits go through PATCH + If-Match meanwhile
          usePresenceStore.getState().set({ peers: {}, synced: false, lock: null });
        }
      },
      onFatal: (code) => latest.current.onFatal?.(code),
    });
    socketRef.current = socket;
    socket.connect();

    const online = () => socket.reconnectNow();
    window.addEventListener('online', online);
    const t = timers.current;
    const waiters = flushWaiters.current;
    return () => {
      window.removeEventListener('online', online);
      if (lockView(usePresenceStore.getState()).kind === 'mine') socket.send({ t: 'lock.release' });
      stopHeartbeat();
      if (t.typing) clearTimeout(t.typing);
      offSynced?.();
      offDenied?.();
      y?.provider.disconnect();
      socket.close();
      if (y) {
        pendingDestroy.current = setTimeout(() => {
          y.provider.destroy();
          y.doc.destroy();
        }, 0);
      }
      socketRef.current = null;
      acquiring.current = false;
      typingOn.current = false;
      waiters.splice(0).forEach((resolve) => resolve(null));
      usePresenceStore.getState().reset(null);
    };
  }, [noteId, enabled, y, clientId]);

  const releaseLock = useCallback(() => {
    acquiring.current = false;
    if (lockView(usePresenceStore.getState()).kind === 'mine')
      socketRef.current?.send({ t: 'lock.release' });
    stopHeartbeat();
  }, []);

  const acquireLock = useCallback((reason: 'edit' | 'takeover' = 'edit') => {
    acquiring.current = true;
    usePresenceStore.getState().set({ takenOverBy: null });
    socketRef.current?.send({ t: 'lock.acquire', reason });
  }, []);

  const notifyInput = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const s = usePresenceStore.getState();
    if (!typingOn.current) {
      typingOn.current = true;
      socket.send({ t: 'typing', on: true });
    }
    if (timers.current.typing) clearTimeout(timers.current.typing);
    timers.current.typing = setTimeout(() => {
      typingOn.current = false;
      socketRef.current?.send({ t: 'typing', on: false });
    }, TYPING_OFF_MS);
    if (s.mode !== 'lock' || !s.me?.can.edit) return;
    const view = lockView(s);
    if (view.kind === 'none' && !acquiring.current) {
      acquiring.current = true;
      socket.send({ t: 'lock.acquire', reason: 'edit' });
    }
    if (view.kind === 'mine' || acquiring.current) {
      if (timers.current.idle) clearTimeout(timers.current.idle);
      timers.current.idle = setTimeout(() => releaseLock(), IDLE_RELEASE_MS);
    }
  }, [releaseLock]);

  const requestLock = useCallback(() => socketRef.current?.send({ t: 'lock.request' }), []);

  const sendCursor = useCallback((anchor: number, head: number, title?: boolean) => {
    socketRef.current?.send(
      title ? { t: 'cursor', anchor, head, title: true } : { t: 'cursor', anchor, head },
    );
  }, []);

  const flush = useCallback((timeoutMs = 4000) => {
    const socket = socketRef.current;
    if (!socket?.isOpen || usePresenceStore.getState().mode !== 'yjs') return Promise.resolve(null);
    return new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      flushWaiters.current.push((v) => {
        clearTimeout(timer);
        resolve(v);
      });
      socket.send({ t: 'flush' });
    });
  }, []);

  return {
    clientId,
    ydoc: y?.doc ?? null,
    provider: y?.provider ?? null,
    notifyInput,
    acquireLock,
    releaseLock,
    requestLock,
    sendCursor,
    flush,
  };
}
