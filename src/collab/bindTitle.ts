import { useCallback, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

/**
 * The note title as a shared `Y.Text('title')` (SPEC-r2-collaboration §4.1), bound to a plain text input.
 *
 * A local change is applied as the minimal splice (common prefix / suffix), so two people typing in different parts
 * of the title merge instead of overwriting each other. Offsets are UTF-16 code units on both sides (JS strings and
 * Y.Text agree).
 */
export const TITLE_FIELD = 'title';
export const TITLE_ORIGIN = 'starnote-title-input';

export function spliceOf(
  before: string,
  after: string,
): { index: number; remove: number; insert: string } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore--;
    endAfter--;
  }
  return { index: start, remove: endBefore - start, insert: after.slice(start, endAfter) };
}

export function applyTitle(ytext: Y.Text, next: string) {
  const splice = spliceOf(ytext.toString(), next);
  if (!splice || !ytext.doc) return;
  ytext.doc.transact(() => {
    if (splice.remove) ytext.delete(splice.index, splice.remove);
    if (splice.insert) ytext.insert(splice.index, splice.insert);
  }, TITLE_ORIGIN);
}

/** `[title, setTitle]` backed by the Y document (null doc → `fallback`, no-op setter). */
export function useYTitle(doc: Y.Doc | null, fallback: string): [string, (next: string) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!doc) return () => {};
      const text = doc.getText(TITLE_FIELD);
      text.observe(cb);
      return () => text.unobserve(cb);
    },
    [doc],
  );
  const value = useSyncExternalStore(subscribe, () =>
    doc ? doc.getText(TITLE_FIELD).toString() : fallback,
  );
  const set = useCallback(
    (next: string) => doc && applyTitle(doc.getText(TITLE_FIELD), next),
    [doc],
  );
  return [value, set];
}
