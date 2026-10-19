import type { Overview } from '../api/types';

/** A piece of the top line: plain text, a bold number, or the streak dots after the streak number. */
export type SentencePart =
  | { kind: 'text'; text: string }
  | { kind: 'num'; value: number; unit: string }
  | { kind: 'streak'; days: number };

type Input = Pick<Overview, 'today' | 'streak_days' | 'unpublished_count'> & {
  recent_notes?: unknown[];
};

/**
 * The home page's one readable sentence (contract r4 §C.1):
 * `今天写了 925 字，改了 3 篇笔记；已连续写作 3 天。还有 8 篇笔记没有发布。`
 * Clauses the data cannot support are left out, and the punctuation is rebuilt so what remains
 * still reads as one sentence.
 */
export function todaySentence(data: Input): SentencePart[] {
  const text = (t: string): SentencePart => ({ kind: 'text', text: t });
  // the unit travels with its number so a line never breaks between "8" and "篇"
  const num = (n: number, unit: string): SentencePart => ({ kind: 'num', value: n, unit });
  const first: SentencePart[] = [];
  const today = data.today;
  if (today) {
    if (today.words > 0) {
      first.push(text('今天写了 '), num(today.words, ' 字'));
      if (today.notes_edited > 0) first.push(text('，改了 '), num(today.notes_edited, ' 篇笔记'));
    } else {
      first.push(text('今天还没动笔'));
    }
  }
  const streak = data.streak_days ?? 0;
  if (streak > 0) {
    if (first.length) first.push(text('；'));
    first.push(text('已连续写作 '), num(streak, ' 天'), { kind: 'streak', days: streak });
  }
  const parts: SentencePart[] = [];
  if (first.length) parts.push(...first, text('。'));
  const unpublished = data.unpublished_count ?? 0;
  if (unpublished > 0) parts.push(text('还有 '), num(unpublished, ' 篇笔记没有发布'), text('。'));
  if (parts.length) return parts;
  const n = data.recent_notes?.length ?? 0;
  return [text(n ? `最近动过 ${n} 篇笔记，接着写吧。` : '桌面还是空的，写下第一篇吧。')];
}

/** The sentence as plain text (numbers unformatted), for tests and `aria-label`s. */
export function sentenceText(parts: SentencePart[]): string {
  return parts
    .map((p) => (p.kind === 'text' ? p.text : p.kind === 'num' ? `${p.value}${p.unit}` : ''))
    .join('');
}
