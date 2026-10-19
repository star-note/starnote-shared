import { useCallback, useEffect, useMemo, useRef } from 'react';

import { isApiError } from '../api/client';
import { notesApi } from '../api/notes';
import type { UserBrief } from '../api/types';
import { useEditorStore } from '../stores/editor';
import { useNotesStore } from '../stores/notes';

/** Trailing debounce with `cancel` / `flush` (what ahooks' useDebounceFn gave the web app; no UI dependency here). */
function useDebounced(fn: () => void, wait: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useMemo(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const run = () => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        fnRef.current();
      }, wait);
    };
    const flush = () => {
      if (!timer.current) return;
      cancel();
      fnRef.current();
    };
    return { run, cancel, flush };
  }, [wait]);
}

export interface AutosaveOptions {
  /** The collab socket's tab id → `X-Client-Id`, so this tab can ignore the `note.updated` of its own save. */
  clientId?: string;
  onSaved?(version: number): void;
}

/**
 * Debounced PATCH with `If-Match`; a 40902 surfaces as `conflict` in the editor store. A save that failed for lack
 * of network turns `offline` and is retried when the browser is back online (SPEC-r2-collaboration §3.8). In Yjs
 * mode the shared document is saved by the server, so nothing is PATCHed.
 */
export function useAutosave(noteId: string, opts: AutosaveOptions = {}) {
  const inflight = useRef(false);
  const pending = useRef(false);
  const latest = useRef(opts);
  latest.current = opts;

  const save = useCallback(
    async (force = false) => {
      const s = useEditorStore.getState();
      if (!s.note || s.note.id !== noteId) return;
      if (s.collabMode === 'yjs') return;
      if (s.saveState === 'conflict' && !force) return;
      if (inflight.current) {
        pending.current = true;
        return;
      }
      inflight.current = true;
      s.setSaveState('saving');
      try {
        const body = { title: s.title.trim(), content: s.content ?? undefined };
        const saved = await notesApi.update(noteId, body, s.version, latest.current.clientId);
        useEditorStore.getState().applySaved(saved.version, {
          title: saved.title,
          word_count: saved.word_count,
          updated_at: saved.updated_at,
          published: saved.published,
        });
        useNotesStore.getState().upsert(saved);
        latest.current.onSaved?.(saved.version);
      } catch (e) {
        if (isApiError(e) && e.code === 40902) {
          const d = (e.data ?? {}) as {
            version?: number;
            updated_at?: string;
            updated_by?: UserBrief;
          };
          useEditorStore.getState().setConflict({
            version: d.version ?? 0,
            updated_at: d.updated_at ?? '',
            updated_by: d.updated_by ?? null,
          });
        } else if (isApiError(e) && e.code === 0) {
          useEditorStore.getState().setSaveState('offline');
        } else {
          useEditorStore.getState().setSaveState('error');
        }
      } finally {
        inflight.current = false;
        if (pending.current) {
          pending.current = false;
          void save();
        }
      }
    },
    [noteId],
  );

  const { run: scheduleSave, cancel, flush } = useDebounced(() => void save(), 800);

  useEffect(() => () => cancel(), [cancel]);

  // back online: retry the save that failed offline
  useEffect(() => {
    const retry = () => {
      if (useEditorStore.getState().saveState === 'offline') void save();
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [save]);

  /** Overwrite: adopt the server's version number, then PATCH our content on top. */
  const overwrite = useCallback(async () => {
    const s = useEditorStore.getState();
    const target = s.conflict?.version ?? s.version;
    useEditorStore.setState({ version: target, conflict: null, saveState: 'dirty' });
    await save(true);
  }, [save]);

  return { scheduleSave, flush, cancel, saveNow: save, overwrite };
}
