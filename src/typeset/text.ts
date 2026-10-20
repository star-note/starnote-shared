import type { TiptapDoc, TiptapNode } from '../api/types';

/**
 * Text helpers shared by the AI typesetting tools (排成传播稿 / 整理段落 / 配图 / 排版体检).
 *
 * Offsets inside a paragraph count characters of its text nodes; an inline leaf (hard break, inline image,
 * mention…) counts as one character (`￼`), so cutting at an offset never lands inside a leaf.
 */

export type Mark = { type: string; attrs?: Record<string, unknown> };

export const LEAF = '￼';

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Plain text of a node (leaves contribute nothing). */
export function textOf(node: TiptapNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

/** Text of a run of inline nodes, a leaf as `￼` (the offsets the split helpers use). */
export function inlineText(content: TiptapNode[] | undefined): string {
  return (content ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : LEAF)).join('');
}

/** Characters that count for length rules: no whitespace. */
export function visibleLength(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export const p = (text: string, marks?: Mark[]): TiptapNode =>
  text
    ? { type: 'paragraph', content: [{ type: 'text', text, ...(marks?.length ? { marks } : {}) }] }
    : { type: 'paragraph' };

export const para = (content: TiptapNode[]): TiptapNode =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' };

/** `content[from, to)` by inline offset, marks and leaves preserved. */
export function sliceInline(content: TiptapNode[] | undefined, from: number, to: number): TiptapNode[] {
  const out: TiptapNode[] = [];
  let at = 0;
  for (const node of content ?? []) {
    const len = node.type === 'text' ? (node.text ?? '').length : 1;
    const start = at;
    const end = at + len;
    at = end;
    if (end <= from || start >= to) continue;
    if (node.type !== 'text') {
      out.push(clone(node));
      continue;
    }
    const a = Math.max(from, start) - start;
    const b = Math.min(to, end) - start;
    const text = (node.text ?? '').slice(a, b);
    if (text) out.push({ ...clone(node), text });
  }
  return out;
}

/** Cuts inline content at the given offsets: `pieces.join() === content`, char for char, marks kept. */
export function splitInline(content: TiptapNode[] | undefined, offsets: number[]): TiptapNode[][] {
  const total = inlineText(content).length;
  const cuts = [...new Set(offsets)].filter((o) => o > 0 && o < total).sort((a, b) => a - b);
  const bounds = [0, ...cuts, total];
  const pieces: TiptapNode[][] = [];
  for (let i = 0; i < bounds.length - 1; i++) pieces.push(sliceInline(content, bounds[i]!, bounds[i + 1]!));
  return pieces;
}

const sameMarks = (a?: Mark[], b?: Mark[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Adds `mark` to `content[from, to)` (text unchanged); adjacent runs with equal marks are merged. */
export function markInline(content: TiptapNode[] | undefined, from: number, to: number, mark: Mark): TiptapNode[] {
  const total = inlineText(content).length;
  const marked = sliceInline(content, from, to).map((n) => {
    if (n.type !== 'text') return n;
    const marks = (n.marks ?? []).filter((m) => m.type !== mark.type);
    return { ...n, marks: [...marks, mark] };
  });
  return mergeText([...sliceInline(content, 0, from), ...marked, ...sliceInline(content, to, total)]);
}

export function mergeText(nodes: TiptapNode[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (last && last.type === 'text' && n.type === 'text' && sameMarks(last.marks, n.marks)) {
      out[out.length - 1] = { ...last, text: (last.text ?? '') + (n.text ?? '') };
    } else out.push(n);
  }
  return out;
}

const CLOSERS = '”’」』）)】》"\'';
const ENDERS = '。！？!?；;…';

/**
 * Sentence ends inside `text`: offsets right after 。！？；… (and any closing quotes / brackets that follow),
 * never at 0 or at the very end. These are the only places 整理段落 may cut a paragraph.
 */
export function sentenceBoundaries(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    let end = -1;
    if (ENDERS.includes(ch)) end = i + 1;
    else if (ch === '.' && /\s/.test(text[i + 1] ?? '') && /[A-Za-z)\]"']/.test(text[i - 1] ?? '')) end = i + 1;
    if (end < 0) continue;
    while (end < text.length && (ENDERS.includes(text[end]!) || CLOSERS.includes(text[end]!))) end++;
    while (end < text.length && /[ \t]/.test(text[end]!)) end++;
    if (end > 0 && end < text.length && out[out.length - 1] !== end) out.push(end);
    i = end - 1;
  }
  return out;
}

/** Sentences of `text` with their offsets (whitespace trimmed off the reported text, offsets untouched). */
export function sentences(text: string): { text: string; from: number; to: number }[] {
  const b = [0, ...sentenceBoundaries(text), text.length];
  const out: { text: string; from: number; to: number }[] = [];
  for (let i = 0; i < b.length - 1; i++) {
    const s = text.slice(b[i], b[i + 1]);
    if (s.trim()) out.push({ text: s.trim(), from: b[i]!, to: b[i + 1]! });
  }
  return out;
}

/** A block's kind as prompts (and the mock model) name it. Mirrors `blockKind` in templates/layout. */
export function kindOf(node: TiptapNode): string {
  switch (node.type) {
    case 'heading':
      return `h${Math.min(4, Math.max(1, Number(node.attrs?.level) || 2))}`;
    case 'paragraph':
      return 'p';
    case 'blockquote':
      return 'blockquote';
    case 'horizontalRule':
    case 'divider':
      return 'hr';
    case 'bulletList':
    case 'taskList':
      return 'ul';
    case 'orderedList':
      return 'ol';
    case 'image':
    case 'imageBlock':
    case 'imageGif':
      return 'image';
    case 'codeBlock':
      return 'code';
    case 'card':
      return 'card';
    case 'table':
      return 'table';
    default:
      return 'other';
  }
}

/**
 * The note for a prompt: one line per top-level block, `3. p(214): 全文…`. Text is flattened to one line and
 * capped per block and overall, so a long note still fits.
 */
export function blockLines(doc: TiptapDoc, perBlock = 900, total = 14000): string[] {
  let budget = total;
  return (doc.content ?? []).map((node, i) => {
    const flat = textOf(node).replace(/\s+/g, ' ').trim();
    const take = Math.max(0, Math.min(perBlock, budget));
    budget -= Math.min(flat.length, take);
    return `${i}. ${kindOf(node)}(${flat.length}): ${flat.slice(0, take)}`;
  });
}

/** Parses the first `{…}` JSON object in a model answer. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const str = (v: unknown, max = 200): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
