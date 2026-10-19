import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type * as Y from 'yjs';

import { useNotePresence, type NoteUpdatedMsg } from './useNotePresence';
import { notesApi } from '../api/notes';
import type { NoteDetail, TiptapDoc } from '../api/types';
import { useYTitle } from '../collab/bindTitle';
import { useAuthStore } from '../stores/auth';
import { type CollabMode, useEditorStore } from '../stores/editor';
import { useNotesStore } from '../stores/notes';
import { editableNow, usePresenceStore } from '../stores/presence';

/** How long a tab that took the lock over waits for the previous holder's last save before typing (§3.3). */
export const TAKEOVER_WAIT_MS = 3000;
const CURSOR_THROTTLE_MS = 100;

export interface NoteCollabOptions {
  noteId: string;
  note: NoteDetail | null;
  editorRef: RefObject<Editor | null>;
  /** Save pending edits now (autosave flush). */
  flushSave(): void;
  /** Drop the pending autosave (a refused lock undid the input). */
  cancelSave(): void;
  /** How the app shows short notices (web: antd `message`, phone: antd-mobile `Toast`). */
  notify: CollabNotify;
}

export interface CollabNotify {
  info(text: string): unknown;
  warning(text: string): unknown;
}

/**
 * Everything the editor page needs from real-time collaboration (SPEC-r2-collaboration §3.8 / §4.12), so the page
 * only wires props: the socket + presence, lock reactions (undo on denial, save when taken over, wait for the
 * holder's save after a takeover), silent refresh on `note.updated`, and — for group notes in Yjs mode — the Y
 * document, the title bound to `Y.Text('title')` and the live mirror into the editor store.
 */
export function useNoteCollab({
  noteId,
  note,
  editorRef,
  flushSave,
  cancelSave,
  notify,
}: NoteCollabOptions) {
  const message = notify;
  const user = useAuthStore((s) => s.user);
  const loaded = Boolean(note && note.id === noteId);
  const enabled = loaded && user?.features?.collab !== false && Boolean(user);
  const wantYjs = enabled && note?.owner_type === 'group' && Boolean(user?.features?.collab_yjs);
  const [awaitingFresh, setAwaitingFresh] = useState(false);
  const awaitingRef = useRef(false);
  const latest = useRef({ flushSave, cancelSave });
  latest.current = { flushSave, cancelSave };

  const reload = useCallback(async () => {
    const fresh = await notesApi.get(noteId);
    if (useEditorStore.getState().note?.id !== noteId) return;
    useEditorStore.getState().replaceNote(fresh);
    useNotesStore.getState().upsert(fresh);
  }, [noteId]);

  /** Tags / pin / move changed elsewhere: refresh those facts without touching the body. */
  const refreshMeta = useCallback(async () => {
    const fresh = await notesApi.get(noteId);
    useEditorStore.setState((s) =>
      s.note?.id === noteId
        ? {
            note: {
              ...s.note,
              tags: fresh.tags,
              pinned: fresh.pinned,
              ancestors: fresh.ancestors,
              owner_id: fresh.owner_id,
            },
          }
        : s,
    );
  }, [noteId]);

  const onNoteUpdated = useCallback(
    (msg: NoteUpdatedMsg) => {
      const store = useEditorStore.getState();
      if (msg.changed.includes('trashed')) {
        message.warning(`${msg.updated_by?.name ?? '有人'}把这篇笔记移到了回收站`);
        return;
      }
      if (store.collabMode === 'yjs') {
        // body and title arrive through the Y document; only keep the version and the side facts current
        store.setLive({ version: msg.version });
        if (msg.changed.some((c) => c === 'tags' || c === 'pinned' || c === 'moved'))
          void refreshMeta();
        return;
      }
      const bodyChanged = msg.changed.includes('content') || msg.changed.includes('title');
      if (bodyChanged || msg.changed.includes('pinned')) {
        if (awaitingRef.current || store.saveState === 'idle' || store.saveState === 'saved') {
          awaitingRef.current = false;
          setAwaitingFresh(false);
          void reload();
        }
        // dirty / saving: our PATCH will meet 40902 and the conflict dialog names who changed it
        return;
      }
      void refreshMeta();
    },
    [message, refreshMeta, reload],
  );

  const presence = useNotePresence({
    noteId,
    enabled,
    wantYjs,
    me: user
      ? { id: user.id, name: user.name, handle: user.handle, avatar_url: user.avatar_url }
      : null,
    currentVersion: () => useEditorStore.getState().version || undefined,
    onNoteUpdated,
    onLockDenied: () => {
      // the optimistic keystroke goes back, the page turns read-only (banner explains who edits)
      latest.current.cancelSave();
      const ed = editorRef.current;
      if (ed && !ed.isDestroyed && ed.can().undo()) ed.commands.undo();
      const s = useEditorStore.getState();
      if (s.note) useEditorStore.setState({ title: s.note.title, saveState: 'idle' });
    },
    onLockTaken: (by) => {
      latest.current.flushSave();
      message.info(`${by.name} 已接管编辑，你的改动已保存`);
    },
    onTookOver: () => {
      awaitingRef.current = true;
      setAwaitingFresh(true);
      window.setTimeout(() => {
        if (!awaitingRef.current) return;
        awaitingRef.current = false;
        setAwaitingFresh(false);
        void reload();
      }, TAKEOVER_WAIT_MS);
    },
    onLockRequested: (by) => message.info(`${by.user.name} 申请编辑这篇笔记`),
    onError: (e) => {
      if (e.code !== 40001) message.warning(e.message);
    },
    onFatal: (code) => {
      if (code === 4404) message.warning('这篇笔记已不存在或被移到回收站');
      else if (code === 4403) message.warning('你已无权访问这篇笔记的实时协同');
    },
    onYjsDenied: (reason) => {
      if (reason !== '40301') message.warning(reason);
    },
  });

  const mode = usePresenceStore((s) => s.mode);
  const synced = usePresenceStore((s) => s.synced);
  const lock = usePresenceStore((s) => s.lock);
  const me = usePresenceStore((s) => s.me);
  const clientId = presence.clientId;
  const status = usePresenceStore((s) => s.status);

  const yjs = Boolean(wantYjs && presence.ydoc && presence.provider && mode !== 'lock');
  const collabMode: CollabMode = yjs ? 'yjs' : mode === 'lock' ? 'lock' : 'rest';
  useEffect(() => {
    if (loaded) useEditorStore.getState().setCollabMode(collabMode);
  }, [collabMode, loaded]);

  const canEdit = note?.can?.edit !== false;
  const editable = useMemo(() => {
    if (!canEdit) return false;
    if (yjs) return synced;
    if (mode === 'lock' && status === 'online') {
      return editableNow({ lock, clientId, me, mode, synced }, true) && !awaitingFresh;
    }
    return true;
  }, [canEdit, yjs, synced, mode, status, lock, clientId, me, awaitingFresh]);

  // ---- Yjs: title + live mirror ----
  const [yTitle, setYTitle] = useYTitle(yjs ? presence.ydoc : null, note?.title ?? '');
  useEffect(() => {
    if (yjs && synced) useEditorStore.getState().setLive({ title: yTitle });
  }, [yjs, synced, yTitle]);
  useEffect(() => {
    const doc = yjs ? presence.ydoc : null;
    if (!doc) return;
    const meta = doc.getMap('meta');
    const sync = () => {
      const v = meta.get('version');
      if (typeof v === 'number' && v > useEditorStore.getState().version)
        useEditorStore.getState().setLive({ version: v });
    };
    meta.observe(sync);
    sync();
    return () => meta.unobserve(sync);
  }, [yjs, presence.ydoc]);

  const editorCollab = useMemo(
    () =>
      yjs && presence.ydoc && presence.provider
        ? {
            ydoc: presence.ydoc,
            provider: presence.provider,
            user: { name: user?.name ?? '我', color: me?.user.color ?? '#6918b4' },
          }
        : null,
    [yjs, presence.ydoc, presence.provider, user?.name, me?.user.color],
  );

  // ---- edits from the page ----
  const lastCursor = useRef(0);
  const onSelection = useCallback(
    (anchor: number, head: number) => {
      if (collabMode !== 'lock') return; // Yjs carets travel through awareness
      const now = Date.now();
      if (now - lastCursor.current < CURSOR_THROTTLE_MS) return;
      lastCursor.current = now;
      presence.sendCursor(anchor, head);
    },
    [collabMode, presence],
  );

  /** Body change from the editor. Returns true when the page should autosave it (REST / lock mode). */
  const onBodyChange = useCallback(
    (content: TiptapDoc, wordCount: number) => {
      if (yjs) {
        useEditorStore.getState().setLive({ content, wordCount });
        // remote changes also come through here: only local input counts as typing
        if (editorRef.current?.isFocused) presence.notifyInput();
        return false;
      }
      // the editor also emits updates of its own (normalizing an empty document on load): only focused input
      // asks for the lock / counts as typing
      if (editorRef.current?.isFocused) presence.notifyInput();
      return true;
    },
    [yjs, presence, editorRef],
  );

  /** Title change from the input. Returns true when the page should autosave it. */
  const onTitleChange = useCallback(
    (value: string) => {
      presence.notifyInput();
      if (yjs) {
        setYTitle(value);
        return false;
      }
      return true;
    },
    [yjs, presence, setYTitle],
  );

  return {
    clientId,
    mode: collabMode,
    editable,
    awaitingFresh,
    /** Pass to SparkEditor (`null` = plain editor). */
    editorCollab,
    /** The title to show (the shared one in Yjs mode). */
    title: yjs ? yTitle : null,
    onSelection,
    onBodyChange,
    onTitleChange,
    acquireLock: presence.acquireLock,
    releaseLock: presence.releaseLock,
    requestLock: presence.requestLock,
    flush: presence.flush,
    reload,
    /** Yjs document for tests / debugging. */
    ydoc: presence.ydoc as Y.Doc | null,
  };
}
