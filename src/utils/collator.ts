import type { Note } from '../api/types';

/** Mirrors the server: pinyin initials, numeric-aware, pinned first. */
export const zhCollator = new Intl.Collator('zh-Hans-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
});

export function compareNotes(a: Pick<Note, 'title' | 'pinned' | 'sort_key'>, b: typeof a): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return zhCollator.compare(a.title || '', b.title || '');
}

export function sortNotes<T extends Pick<Note, 'title' | 'pinned' | 'sort_key'>>(items: T[]): T[] {
  return [...items].sort(compareNotes);
}
