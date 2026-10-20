import { create } from 'zustand';

import type { NoteDetail, TiptapDoc, UserBrief } from '../api/types';

/** `offline`: the last save failed for lack of network; it is retried when the connection returns. */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'offline';

/** `rest`: PATCH autosave; `lock`: PATCH + the collab soft lock; `yjs`: the Y document is the source of truth. */
export type CollabMode = 'rest' | 'lock' | 'yjs';

interface EditorState {
  note: NoteDetail | null;
  title: string;
  content: TiptapDoc | null;
  version: number;
  saveState: SaveState;
  conflict: { version: number; updated_at: string; updated_by?: UserBrief | null } | null;
  wordCount: number;
  collabMode: CollabMode;
  /**
   * Bumped whenever the document was replaced from outside the editor (a revision
   * restore, a reload). The editor page watches it and swaps the ProseMirror doc.
   */
  externalRev: number;
  setNote(note: NoteDetail): void;
  /** Replace the whole note (title, content, version) and ask the editor to re-render it. */
  replaceNote(note: NoteDetail): void;
  setTitle(title: string): void;
  setContent(content: TiptapDoc, wordCount?: number): void;
  /** Yjs mode: mirror the shared document (no autosave, no `dirty`). */
  setLive(patch: {
    content?: TiptapDoc;
    title?: string;
    wordCount?: number;
    version?: number;
  }): void;
  setCollabMode(mode: CollabMode): void;
  setSaveState(state: SaveState): void;
  setConflict(c: EditorState['conflict']): void;
  applySaved(version: number, patch?: Partial<NoteDetail>): void;
  clear(): void;
}

export const useEditorStore = create<EditorState>((set) => ({
  note: null,
  title: '',
  content: null,
  version: 0,
  saveState: 'idle',
  conflict: null,
  wordCount: 0,
  collabMode: 'rest',
  externalRev: 0,
  setNote: (note) =>
    set({
      note,
      title: note.title,
      content: note.content ?? { type: 'doc', content: [] },
      version: note.version,
      saveState: 'idle',
      conflict: null,
      wordCount: note.word_count,
    }),
  replaceNote: (note) =>
    set((s) => ({
      note,
      title: note.title,
      content: note.content ?? { type: 'doc', content: [] },
      version: note.version,
      saveState: 'idle',
      conflict: null,
      wordCount: note.word_count,
      externalRev: s.externalRev + 1,
    })),
  setTitle: (title) => set({ title, saveState: 'dirty' }),
  setContent: (content, wordCount) =>
    set((s) => ({ content, saveState: 'dirty', wordCount: wordCount ?? s.wordCount })),
  setLive: ({ content, title, wordCount, version }) =>
    set((s) => ({
      content: content ?? s.content,
      title: title ?? s.title,
      wordCount: wordCount ?? s.wordCount,
      version: version ?? s.version,
      note: s.note && version !== undefined ? { ...s.note, version } : s.note,
    })),
  setCollabMode: (collabMode) => set({ collabMode }),
  setSaveState: (saveState) => set({ saveState }),
  setConflict: (conflict) => set({ conflict, saveState: conflict ? 'conflict' : 'idle' }),
  applySaved: (version, patch) =>
    set((s) => ({
      version,
      saveState: 'saved',
      note: s.note ? { ...s.note, ...patch, version } : s.note,
    })),
  clear: () =>
    set({
      note: null,
      title: '',
      content: null,
      version: 0,
      saveState: 'idle',
      conflict: null,
      collabMode: 'rest',
    }),
}));
