import {
  blockLines,
  clone,
  inlineText,
  int,
  markInline,
  para,
  parseJsonObject,
  sentenceBoundaries,
  sliceInline,
  splitInline,
  str,
  visibleLength,
} from './text';
import type { TiptapDoc, TiptapNode } from '../api/types';

/**
 * 大段文字治理 (feature `paragraph.tidy`). The model proposes, per paragraph: where to break a long one, which
 * sentence carries it, enumerations to turn into lists, number-heavy sentences for a 数据卡 (`card` variant
 * `stat`), comparisons for a table. Everything is checked here before it is offered:
 *
 * - a split only ever cuts at a sentence end, so joining the pieces gives back the paragraph char for char
 *   (marks, links and inline leaves included); when the model's cut points don't fit, the local planner picks;
 * - emphasis marks an exact sentence of the paragraph (bold or highlight) and changes no text;
 * - a list is only made when the paragraph really reads 「第一…第二…」 / 「首先…其次…」.
 *
 * Each proposal is an item with its own before / after preview; the ticked ones are applied as one edit.
 */

export const TIDY_MARKER = '[sn-tidy]';
export const LONG_PARAGRAPH = 200;

export type TidyOp =
  | { op: 'split'; i: number; starts: string[] }
  | { op: 'emphasize'; i: number; text: string }
  | { op: 'list'; i: number }
  | { op: 'stat'; i: number; sentence: string; items: { value: string; label: string }[] }
  | { op: 'table'; i: number; intro: string; head: string[]; rows: string[][] };

export type TidyKind = TidyOp['op'];
export type EmphasisMode = 'bold' | 'highlight' | 'none';

export const HIGHLIGHT_COLOR = '#FFF1B8';

export function buildTidyPrompt(doc: TiptapDoc): { system: string; user: string } {
  const system = [
    `${TIDY_MARKER} 你是资深编辑，帮作者把大段文字整理得好读。不改写原文。只返回 JSON：{"ops":[…]}。可用的 op：`,
    `{"op":"split","i":段落序号,"starts":["新段落开头的前 6–10 个字，必须是原文某句的开头"]}（超过约 ${LONG_PARAGRAPH} 字的段落，在意思转折处断开）；`,
    '{"op":"emphasize","i":序号,"text":"这段里最重要的一整句，一字不差"}（每段最多一句）；',
    '{"op":"list","i":序号}（段落里有「第一、第二…」或「首先、其次…」这类枚举时）；',
    '{"op":"stat","i":序号,"sentence":"原文里数据密集的一句，一字不差","items":[{"value":"68%","label":"不超过 10 字的说明"}]}；',
    '{"op":"table","i":序号,"intro":"表格前的一句引子，可空","head":["列名"…],"rows":[["单元格"…]…]}（对比类内容）。',
  ].join('\n');
  const user = ['笔记块（序号. 类型(字数): 全文）：', ...blockLines(doc, 1200, 16000)].join('\n');
  return { system, user };
}

export function parseTidyOps(text: string): TidyOp[] | null {
  const data = parseJsonObject(text);
  if (!data || !Array.isArray(data.ops)) return null;
  const ops: TidyOp[] = [];
  for (const item of data.ops as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue;
    const i = int(item.i);
    if (i === null) continue;
    switch (item.op) {
      case 'split': {
        const starts = Array.isArray(item.starts) ? item.starts.filter((s): s is string => typeof s === 'string' && Boolean(s.trim())) : [];
        ops.push({ op: 'split', i, starts: starts.slice(0, 8) });
        break;
      }
      case 'emphasize':
        if (typeof item.text === 'string' && item.text.trim()) ops.push({ op: 'emphasize', i, text: item.text.trim() });
        break;
      case 'list':
        ops.push({ op: 'list', i });
        break;
      case 'stat': {
        const items = Array.isArray(item.items)
          ? (item.items as Record<string, unknown>[])
              .map((x) => ({ value: str(x?.value, 16), label: str(x?.label, 24) }))
              .filter((x) => x.value)
              .slice(0, 4)
          : [];
        if (typeof item.sentence === 'string' && items.length) ops.push({ op: 'stat', i, sentence: item.sentence.trim(), items });
        break;
      }
      case 'table': {
        const head = Array.isArray(item.head) ? item.head.map((c) => str(c, 40)) : [];
        const rows = Array.isArray(item.rows)
          ? (item.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map((c) => str(c, 80)))
          : [];
        const cols = head.length;
        if (cols >= 2 && cols <= 6 && rows.length >= 1 && rows.length <= 12 && rows.every((r) => r.length === cols))
          ops.push({ op: 'table', i, intro: str(item.intro, 120), head, rows });
        break;
      }
    }
  }
  return ops;
}

// ---------- splitting ----------

const TURN_WORDS =
  /^(但是|但|然而|不过|因此|所以|于是|另外|此外|同时|其次|最后|首先|总之|总的来说|比如|例如|换句话说|也就是说|接下来|另一方面|与此同时|事实上|其实|可是|而且|再者|那么)/;

/**
 * Where to cut a long paragraph: only at sentence ends, pieces of balanced length (none tiny), preferring cuts
 * before a turn (但是 / 因此 / 另外…) or at the places the model asked for.
 */
export function planSplit(text: string, max = LONG_PARAGRAPH, preferred: number[] = []): number[] {
  const len = text.length;
  if (visibleLength(text) <= max) return [];
  const bounds = sentenceBoundaries(text);
  if (!bounds.length) return [];
  const minPiece = Math.min(40, Math.floor(len / 4));
  const usable = bounds.filter((b) => b >= minPiece && len - b >= minPiece);
  if (!usable.length) return [];
  const pieces = Math.max(2, Math.ceil(len / (max * 0.8)));
  const score = (b: number, target: number) => {
    let s = Math.abs(b - target);
    if (TURN_WORDS.test(text.slice(b).trimStart())) s -= 40;
    if (preferred.includes(b)) s -= 80;
    return s;
  };
  const cuts: number[] = [];
  let start = 0;
  for (let k = 1; k < pieces; k++) {
    const target = start + (len - start) / (pieces - k + 1);
    const options = usable.filter((b) => b - start >= minPiece && len - b >= minPiece && !cuts.includes(b));
    if (!options.length) break;
    const best = options.reduce((a, b) => (score(b, target) < score(a, target) ? b : a));
    cuts.push(best);
    start = best;
  }
  return cuts.sort((a, b) => a - b);
}

/** Offsets for the model's `starts` snippets that land on (or within a few chars of) a sentence end. */
export function snapStarts(text: string, starts: string[]): number[] {
  const bounds = sentenceBoundaries(text);
  const out: number[] = [];
  for (const s of starts) {
    const at = text.indexOf(s.trim().slice(0, 12));
    if (at <= 0) continue;
    const near = bounds.find((b) => Math.abs(b - at) <= 3);
    if (near !== undefined && !out.includes(near)) out.push(near);
  }
  return out.sort((a, b) => a - b);
}

/** Paragraph → paragraphs. The pieces' text joined is exactly the original's (tested). */
export function splitParagraph(node: TiptapNode, offsets: number[]): TiptapNode[] {
  if (!offsets.length) return [clone(node)];
  return splitInline(node.content, offsets).map((content) => ({ ...clone({ ...node, content: undefined }), content }));
}

// ---------- lists ----------

const ORDINALS = [
  /(第[一二三四五六七八九十]{1,3})[，,、：:]/g,
  /(首先|其次|再次|然后|最后)[，,、：:]/g,
  /([1-9])[、.．)）]/g,
];

/** Where a paragraph's enumeration items start (marker offset and the item's text start), or `null`. */
export function findEnumeration(text: string): { marker: number; body: number }[] | null {
  let best: { marker: number; body: number }[] = [];
  for (const re of ORDINALS) {
    const hits: { marker: number; body: number }[] = [];
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      const prev = text.slice(0, at).trimEnd().slice(-1);
      // an item starts a sentence (or the paragraph): 「…。第二，…」
      if (at > 0 && prev && !/[。！？!?；;：:，,\n]/.test(prev)) continue;
      hits.push({ marker: at, body: at + m[0].length });
    }
    if (hits.length > best.length) best = hits;
  }
  return best.length >= 2 ? best : null;
}

/** 「我们有三点建议。第一，A。第二，B。」 → intro paragraph + ordered list (markers dropped, marks kept). */
export function paragraphToList(node: TiptapNode): TiptapNode[] | null {
  const text = inlineText(node.content);
  const items = findEnumeration(text);
  if (!items) return null;
  const out: TiptapNode[] = [];
  const intro = sliceInline(node.content, 0, items[0]!.marker);
  if (inlineText(intro).trim()) out.push(para(trimInline(intro)));
  out.push({
    type: 'orderedList',
    attrs: { start: 1 },
    content: items.map((it, k) => ({
      type: 'listItem',
      content: [para(trimInline(sliceInline(node.content, it.body, items[k + 1]?.marker ?? text.length)))],
    })),
  });
  return out;
}

function trimInline(content: TiptapNode[]): TiptapNode[] {
  const out = clone(content);
  const first = out[0];
  if (first?.type === 'text') first.text = (first.text ?? '').replace(/^\s+/, '');
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text = (last.text ?? '').replace(/\s+$/, '');
  return out.filter((n) => n.type !== 'text' || n.text);
}

// ---------- stat cards & tables ----------

/** The paragraph with `sentence` lifted into a 数据卡: [before?, card(stat items + the sentence), after?]. */
export function statCard(node: TiptapNode, sentence: string, items: { value: string; label: string }[]): TiptapNode[] | null {
  const text = inlineText(node.content);
  const at = text.indexOf(sentence);
  if (at < 0 || !items.length) return null;
  const [before, mid, after] = [
    sliceInline(node.content, 0, at),
    sliceInline(node.content, at, at + sentence.length),
    sliceInline(node.content, at + sentence.length, text.length),
  ];
  const out: TiptapNode[] = [];
  if (inlineText(before).trim()) out.push(para(before));
  out.push({
    type: 'card',
    attrs: { variant: 'stat', label: '数据' },
    content: [
      ...items.map((it) =>
        para([
          { type: 'text', text: it.value, marks: [{ type: 'bold' }] },
          ...(it.label ? [{ type: 'text', text: ` ${it.label}` }] : []),
        ]),
      ),
      para(mid),
    ],
  });
  if (inlineText(after).trim()) out.push(para(after));
  return out;
}

export function tableNode(head: string[], rows: string[][]): TiptapNode {
  const cell = (type: string, t: string): TiptapNode => ({ type, content: [t ? para([{ type: 'text', text: t }]) : para([])] });
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: head.map((h) => cell('tableHeader', h)) },
      ...rows.map((r) => ({ type: 'tableRow', content: r.map((c) => cell('tableCell', c)) })),
    ],
  };
}

// ---------- items ----------

export interface TidyItem {
  id: string;
  kind: TidyKind;
  /** Top-level block it works on. */
  i: number;
  label: string;
  op: TidyOp;
}

export const TIDY_KIND_LABEL: Record<TidyKind, string> = {
  split: '拆段',
  emphasize: '重点句',
  list: '列表',
  stat: '数据卡',
  table: '表格',
};

const STRUCTURAL: TidyKind[] = ['table', 'list', 'stat', 'split'];

/**
 * Checks the model's ops against the note and adds local proposals it missed (long paragraphs, enumerations), so
 * the tool is useful even with a terse model. One structural change per paragraph.
 */
export function planTidy(doc: TiptapDoc, ops: TidyOp[]): TidyItem[] {
  const blocks = doc.content ?? [];
  const items: TidyItem[] = [];
  const structural = new Map<number, TidyKind>();
  const isPara = (i: number) => blocks[i]?.type === 'paragraph';
  const add = (op: TidyOp, label: string) => {
    if (STRUCTURAL.includes(op.op)) {
      if (structural.has(op.i)) return;
      structural.set(op.i, op.op);
    } else if (items.some((it) => it.i === op.i && it.kind === op.op)) return;
    items.push({ id: `${op.op}:${op.i}`, kind: op.op, i: op.i, label, op });
  };
  const sorted = [...ops].sort((a, b) => STRUCTURAL.indexOf(a.op) - STRUCTURAL.indexOf(b.op));
  for (const op of sorted) {
    if (!isPara(op.i)) continue;
    const text = inlineText(blocks[op.i]!.content);
    switch (op.op) {
      case 'table':
        add(op, `转成 ${op.rows.length + 1} 行 ${op.head.length} 列的表格`);
        break;
      case 'list': {
        const found = findEnumeration(text);
        if (found) add(op, `转成 ${found.length} 项列表`);
        break;
      }
      case 'stat':
        if (text.includes(op.sentence)) add(op, `做成数据卡（${op.items.map((x) => x.value).join('、')}）`);
        break;
      case 'split': {
        const offsets = planSplit(text, LONG_PARAGRAPH, snapStarts(text, op.starts));
        if (offsets.length) add(op, `拆成 ${offsets.length + 1} 段`);
        break;
      }
      case 'emphasize':
        if (text.includes(op.text) && op.text.length >= 6 && op.text.length < text.length) add(op, '标出重点句');
        break;
    }
  }
  // local proposals the model left out
  blocks.forEach((b, i) => {
    if (b.type !== 'paragraph' || structural.has(i)) return;
    const text = inlineText(b.content);
    if (findEnumeration(text)) add({ op: 'list', i }, `转成 ${findEnumeration(text)!.length} 项列表`);
    else if (planSplit(text).length) add({ op: 'split', i, starts: [] }, `拆成 ${planSplit(text).length + 1} 段`);
  });
  const rank = (k: TidyKind) => (k === 'emphasize' ? 9 : STRUCTURAL.indexOf(k));
  return items.sort((a, b) => a.i - b.i || rank(a.kind) - rank(b.kind));
}

function emphasisMark(mode: EmphasisMode) {
  return mode === 'highlight' ? { type: 'highlight', attrs: { color: HIGHLIGHT_COLOR } } : { type: 'bold' };
}

/** One paragraph with the given items applied: what replaces `blocks[i]`. */
export function tidyBlock(node: TiptapNode, items: TidyItem[], mode: EmphasisMode): TiptapNode[] {
  let current = clone(node);
  for (const it of items) {
    if (it.op.op !== 'emphasize' || mode === 'none') continue;
    const text = inlineText(current.content);
    const at = text.indexOf(it.op.text);
    if (at >= 0) current = { ...current, content: markInline(current.content, at, at + it.op.text.length, emphasisMark(mode)) };
  }
  const structural = items.find((it) => it.kind !== 'emphasize');
  if (!structural) return [current];
  const op = structural.op;
  const text = inlineText(current.content);
  switch (op.op) {
    case 'table':
      return [...(op.intro ? [para([{ type: 'text', text: op.intro }])] : []), tableNode(op.head, op.rows)];
    case 'list':
      return paragraphToList(current) ?? [current];
    case 'stat':
      return statCard(current, op.sentence, op.items) ?? [current];
    case 'split':
      return splitParagraph(current, planSplit(text, LONG_PARAGRAPH, snapStarts(text, op.starts)));
    default:
      return [current];
  }
}

/** The tidied note with the ticked items. One `setContent` → one undo. */
export function applyTidy(doc: TiptapDoc, items: TidyItem[], accepted: ReadonlySet<string>, mode: EmphasisMode): TiptapDoc {
  const byBlock = new Map<number, TidyItem[]>();
  for (const it of items) if (accepted.has(it.id)) byBlock.set(it.i, [...(byBlock.get(it.i) ?? []), it]);
  const out: TiptapNode[] = [];
  (doc.content ?? []).forEach((b, i) => {
    const list = byBlock.get(i);
    if (list) out.push(...tidyBlock(b, list, mode));
    else out.push(clone(b));
  });
  return { ...doc, type: 'doc', content: out };
}

